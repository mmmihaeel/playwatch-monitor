#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

source_config_file() {
  local config_path="${1:-}"

  if [[ -z "${config_path}" ]]; then
    return 0
  fi

  if [[ ! -f "${config_path}" ]]; then
    printf '[deploy-gcp] Config file not found: %s\n' "${config_path}" >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  source "${config_path}"
  set +a
}

source_config_file "${1:-}"

log() {
  printf '[deploy-gcp] %s\n' "$*" >&2
}

fail() {
  log "$*"
  exit 1
}

require_env() {
  local name

  for name in "$@"; do
    if [[ -z "${!name:-}" ]]; then
      fail "Required environment variable is missing: ${name}"
    fi
  done
}

resource_exists() {
  "$@" >/dev/null 2>&1
}

urlencode() {
  python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=''))" "$1"
}

set_defaults() {
  : "${GCP_REGION:=us-central1}"
  : "${GCP_ZONE:=us-central1-a}"
  : "${GCP_NETWORK:=playwatch-prod}"
  : "${GCP_VM_SUBNET:=playwatch-prod-vm}"
  : "${GCP_VM_SUBNET_CIDR:=10.20.0.0/24}"
  : "${GCP_SERVERLESS_SUBNET:=playwatch-prod-serverless}"
  : "${GCP_SERVERLESS_SUBNET_CIDR:=10.20.1.0/28}"
  : "${GCP_ARTIFACT_REGISTRY_REPOSITORY:=playwatch}"
  : "${GCP_BUCKET_NAME:=${GCP_PROJECT_ID}-playwatch-screenshots}"
  : "${GCP_BUCKET_LOCATION:=${GCP_REGION}}"
  : "${GCP_BUCKET_RETENTION_DAYS:=30}"
  : "${GCP_VM_NAME:=playwatch-worker-vm}"
  : "${GCP_VM_MACHINE_TYPE:=e2-micro}"
  : "${GCP_VM_TAG:=playwatch-worker-vm}"
  : "${GCP_API_SERVICE_NAME:=playwatch-api}"
  : "${GCP_WEB_SERVICE_NAME:=playwatch-web}"
  : "${GCP_MIGRATE_JOB_NAME:=playwatch-migrate}"
  : "${GCP_API_SERVICE_ACCOUNT:=playwatch-api-runtime@${GCP_PROJECT_ID}.iam.gserviceaccount.com}"
  : "${GCP_WEB_SERVICE_ACCOUNT:=playwatch-web-runtime@${GCP_PROJECT_ID}.iam.gserviceaccount.com}"
  : "${GCP_VM_SERVICE_ACCOUNT:=playwatch-vm-runtime@${GCP_PROJECT_ID}.iam.gserviceaccount.com}"
  : "${APP_DATABASE_NAME:=playwatch}"
  : "${APP_DATABASE_USER:=playwatch}"
  : "${APP_PG_BOSS_SCHEMA:=pgboss}"
  : "${APP_GOOGLE_PLAY_DEFAULT_REGION:=US}"
  : "${APP_GOOGLE_PLAY_DEFAULT_LOCALE:=en-US}"
  : "${BOOTSTRAP_INFRASTRUCTURE:=true}"
  : "${RUN_MIGRATIONS:=true}"
}

write_output() {
  local name="$1"
  local value="$2"

  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    printf '%s=%s\n' "${name}" "${value}" >>"${GITHUB_OUTPUT}"
  fi
}

is_retryable_ssh_error() {
  local log_file="$1"

  grep -Eq \
    'Permission denied \(publickey\)|Connection closed by remote host|Connection refused|Operation timed out|Unable to connect to port 22|failed to connect to backend|kex_exchange_identification|connection reset by peer' \
    "${log_file}"
}

run_vm_ssh() {
  local output_file attempt exit_code

  output_file="$(mktemp)"
  for attempt in {1..8}; do
    if gcloud compute ssh "$@" 2>"${output_file}"; then
      rm -f "${output_file}"
      return 0
    fi

    exit_code=$?
    if (( attempt < 8 )) && is_retryable_ssh_error "${output_file}"; then
      log "SSH attempt ${attempt} for ${GCP_VM_NAME} failed; retrying after a short delay"
      sleep 10
      continue
    fi

    cat "${output_file}" >&2
    rm -f "${output_file}"
    return "${exit_code}"
  done

  cat "${output_file}" >&2
  rm -f "${output_file}"
  return 1
}

run_vm_scp() {
  local output_file attempt exit_code

  output_file="$(mktemp)"
  for attempt in {1..8}; do
    if gcloud compute scp "$@" 2>"${output_file}"; then
      rm -f "${output_file}"
      return 0
    fi

    exit_code=$?
    if (( attempt < 8 )) && is_retryable_ssh_error "${output_file}"; then
      log "SCP attempt ${attempt} for ${GCP_VM_NAME} failed; retrying after a short delay"
      sleep 10
      continue
    fi

    cat "${output_file}" >&2
    rm -f "${output_file}"
    return "${exit_code}"
  done

  cat "${output_file}" >&2
  rm -f "${output_file}"
  return 1
}

ensure_project_binding() {
  local member="$1"
  local role="$2"

  if gcloud projects get-iam-policy "${GCP_PROJECT_ID}" \
    --flatten='bindings[].members' \
    --filter="bindings.role=${role} AND bindings.members=${member}" \
    --format='value(bindings.role)' | grep -qx "${role}"; then
    return 0
  fi

  gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
    --member "${member}" \
    --role "${role}" \
    --quiet >/dev/null
}

ensure_service_account_binding() {
  local service_account="$1"
  local member="$2"
  local role="$3"

  if gcloud iam service-accounts get-iam-policy "${service_account}" \
    --flatten='bindings[].members' \
    --filter="bindings.role=${role} AND bindings.members=${member}" \
    --format='value(bindings.role)' | grep -qx "${role}"; then
    return 0
  fi

  gcloud iam service-accounts add-iam-policy-binding "${service_account}" \
    --member "${member}" \
    --role "${role}" \
    --quiet >/dev/null
}

ensure_bucket_binding() {
  local member="$1"
  local role="$2"

  gcloud storage buckets add-iam-policy-binding "gs://${GCP_BUCKET_NAME}" \
    --member "${member}" \
    --role "${role}" \
    --quiet >/dev/null
}

service_account_id_from_email() {
  printf '%s' "${1%@*}"
}

wait_for_service_account() {
  local email="$1"

  for _attempt in {1..12}; do
    if resource_exists gcloud iam service-accounts describe "${email}"; then
      return 0
    fi

    sleep 5
  done

  fail "Service account ${email} did not become readable after creation"
}

ensure_service_account() {
  local email="$1"
  local display_name="$2"
  local account_id

  account_id="$(service_account_id_from_email "${email}")"

  if resource_exists gcloud iam service-accounts describe "${email}"; then
    return 0
  fi

  gcloud iam service-accounts create "${account_id}" \
    --display-name "${display_name}" \
    --quiet >/dev/null

  wait_for_service_account "${email}"
}

ensure_gcp_services() {
  log 'Enabling required Google Cloud APIs'
  gcloud services enable \
    artifactregistry.googleapis.com \
    cloudresourcemanager.googleapis.com \
    compute.googleapis.com \
    iap.googleapis.com \
    iam.googleapis.com \
    iamcredentials.googleapis.com \
    run.googleapis.com \
    storage.googleapis.com >/dev/null
}

ensure_artifact_registry() {
  if resource_exists gcloud artifacts repositories describe "${GCP_ARTIFACT_REGISTRY_REPOSITORY}" --location "${GCP_REGION}"; then
    return 0
  fi

  log "Creating Artifact Registry repository ${GCP_ARTIFACT_REGISTRY_REPOSITORY}"
  gcloud artifacts repositories create "${GCP_ARTIFACT_REGISTRY_REPOSITORY}" \
    --location "${GCP_REGION}" \
    --repository-format docker \
    --description 'PlayWatch production images' >/dev/null
}

ensure_network() {
  if resource_exists gcloud compute networks describe "${GCP_NETWORK}"; then
    return 0
  fi

  log "Creating VPC network ${GCP_NETWORK}"
  gcloud compute networks create "${GCP_NETWORK}" \
    --subnet-mode custom >/dev/null
}

ensure_subnet() {
  local subnet_name="$1"
  local subnet_range="$2"

  if resource_exists gcloud compute networks subnets describe "${subnet_name}" --region "${GCP_REGION}"; then
    gcloud compute networks subnets update "${subnet_name}" \
      --region "${GCP_REGION}" \
      --enable-private-ip-google-access >/dev/null
    return 0
  fi

  log "Creating subnet ${subnet_name}"
  gcloud compute networks subnets create "${subnet_name}" \
    --network "${GCP_NETWORK}" \
    --region "${GCP_REGION}" \
    --range "${subnet_range}" >/dev/null

  gcloud compute networks subnets update "${subnet_name}" \
    --region "${GCP_REGION}" \
    --enable-private-ip-google-access >/dev/null
}

render_bucket_lifecycle() {
  local destination="$1"

  cat >"${destination}" <<EOF
{
  "rule": [
    {
      "action": {
        "type": "Delete"
      },
      "condition": {
        "age": ${GCP_BUCKET_RETENTION_DAYS}
      }
    }
  ]
}
EOF
}

ensure_bucket() {
  local lifecycle_file

  if ! resource_exists gcloud storage buckets describe "gs://${GCP_BUCKET_NAME}"; then
    log "Creating screenshot bucket gs://${GCP_BUCKET_NAME}"
    gcloud storage buckets create "gs://${GCP_BUCKET_NAME}" \
      --location "${GCP_BUCKET_LOCATION}" \
      --uniform-bucket-level-access \
      --public-access-prevention >/dev/null
  fi

  gcloud storage buckets update "gs://${GCP_BUCKET_NAME}" \
    --public-access-prevention >/dev/null

  if [[ "${GCP_BUCKET_RETENTION_DAYS}" =~ ^[0-9]+$ ]] && (( GCP_BUCKET_RETENTION_DAYS > 0 )); then
    lifecycle_file="$(mktemp)"
    render_bucket_lifecycle "${lifecycle_file}"
    gcloud storage buckets update "gs://${GCP_BUCKET_NAME}" \
      --lifecycle-file "${lifecycle_file}" >/dev/null
    rm -f "${lifecycle_file}"
  fi
}

ensure_firewall_rule() {
  local name="$1"
  local source_range="$2"
  local target_tag="$3"
  local port="$4"

  if resource_exists gcloud compute firewall-rules describe "${name}"; then
    return 0
  fi

  log "Creating firewall rule ${name}"
  gcloud compute firewall-rules create "${name}" \
    --network "${GCP_NETWORK}" \
    --direction INGRESS \
    --action ALLOW \
    --rules "tcp:${port}" \
    --source-ranges "${source_range}" \
    --target-tags "${target_tag}" >/dev/null
}

ensure_runtime_service_accounts() {
  ensure_service_account "${GCP_API_SERVICE_ACCOUNT}" 'PlayWatch API runtime'
  ensure_service_account "${GCP_WEB_SERVICE_ACCOUNT}" 'PlayWatch web runtime'
  ensure_service_account "${GCP_VM_SERVICE_ACCOUNT}" 'PlayWatch worker VM runtime'

  ensure_project_binding "serviceAccount:${GCP_VM_SERVICE_ACCOUNT}" 'roles/artifactregistry.reader'
  ensure_project_binding "serviceAccount:${GCP_VM_SERVICE_ACCOUNT}" 'roles/logging.logWriter'
  ensure_project_binding "serviceAccount:${GCP_VM_SERVICE_ACCOUNT}" 'roles/monitoring.metricWriter'

  ensure_bucket_binding "serviceAccount:${GCP_API_SERVICE_ACCOUNT}" 'roles/storage.objectViewer'
  ensure_bucket_binding "serviceAccount:${GCP_VM_SERVICE_ACCOUNT}" 'roles/storage.objectUser'
}

ensure_serverless_network_access() {
  local serverless_robot="service-${GCP_PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com"
  ensure_project_binding "serviceAccount:${serverless_robot}" 'roles/compute.networkUser'
}

ensure_deployer_vm_access() {
  local active_account

  active_account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
  if [[ -z "${active_account}" || "${active_account}" != *.gserviceaccount.com ]]; then
    return 0
  fi

  ensure_project_binding "serviceAccount:${active_account}" 'roles/iap.tunnelResourceAccessor'
  ensure_project_binding "serviceAccount:${active_account}" 'roles/compute.osAdminLogin'
  ensure_service_account_binding "${GCP_VM_SERVICE_ACCOUNT}" "serviceAccount:${active_account}" 'roles/iam.serviceAccountUser'
}

zone_candidates() {
  local zone

  printf '%s\n' "${GCP_ZONE}"
  while IFS= read -r zone; do
    if [[ -n "${zone}" && "${zone}" != "${GCP_ZONE}" ]]; then
      printf '%s\n' "${zone}"
    fi
  done < <(gcloud compute zones list --filter="name~'^${GCP_REGION}-' AND status=UP" --format='value(name)')
}

update_vm_metadata() {
  local startup_script='deploy/gcp/vm/bootstrap.sh'

  gcloud compute instances add-metadata "${GCP_VM_NAME}" \
    --zone "${GCP_ZONE}" \
    --metadata "enable-oslogin=TRUE,playwatch-artifact-registry-region=${GCP_REGION}" \
    --metadata-from-file "startup-script=${startup_script}" >/dev/null

  local status
  status="$(gcloud compute instances describe "${GCP_VM_NAME}" --zone "${GCP_ZONE}" --format='value(status)')"
  if [[ "${status}" == 'TERMINATED' ]]; then
    gcloud compute instances start "${GCP_VM_NAME}" --zone "${GCP_ZONE}" >/dev/null
  fi
}

ensure_vm() {
  local startup_script='deploy/gcp/vm/bootstrap.sh'
  local candidate_zone create_error

  if ! resource_exists gcloud compute instances describe "${GCP_VM_NAME}" --zone "${GCP_ZONE}"; then
    while IFS= read -r candidate_zone; do
      if resource_exists gcloud compute instances describe "${GCP_VM_NAME}" --zone "${candidate_zone}"; then
        GCP_ZONE="${candidate_zone}"
        log "Using existing Compute Engine VM ${GCP_VM_NAME} in ${GCP_ZONE}"
        update_vm_metadata
        return 0
      fi
    done < <(zone_candidates)

    while IFS= read -r candidate_zone; do
      create_error="$(mktemp)"
      log "Creating Compute Engine VM ${GCP_VM_NAME} in ${candidate_zone}"
      if gcloud compute instances create "${GCP_VM_NAME}" \
        --zone "${candidate_zone}" \
        --machine-type "${GCP_VM_MACHINE_TYPE}" \
        --subnet "${GCP_VM_SUBNET}" \
        --tags "${GCP_VM_TAG}" \
        --service-account "${GCP_VM_SERVICE_ACCOUNT}" \
        --scopes cloud-platform \
        --image-family debian-12 \
        --image-project debian-cloud \
        --boot-disk-size 20GB \
        --metadata "enable-oslogin=TRUE,playwatch-artifact-registry-region=${GCP_REGION}" \
        --metadata-from-file "startup-script=${startup_script}" > /dev/null 2>"${create_error}"; then
        GCP_ZONE="${candidate_zone}"
        rm -f "${create_error}"
        return 0
      fi

      if grep -Eq 'ZONE_RESOURCE_POOL_EXHAUSTED|does not have enough resources' "${create_error}"; then
        log "Zone ${candidate_zone} is currently exhausted for ${GCP_VM_MACHINE_TYPE}; trying the next zone in ${GCP_REGION}"
        rm -f "${create_error}"
        continue
      fi

      cat "${create_error}" >&2
      rm -f "${create_error}"
      fail "Failed to create Compute Engine VM ${GCP_VM_NAME}"
    done < <(zone_candidates)

    fail "Unable to provision ${GCP_VM_MACHINE_TYPE} in any ${GCP_REGION} zone"
  else
    log "Updating VM startup metadata for ${GCP_VM_NAME}"
    update_vm_metadata
    return 0
  fi

  if resource_exists gcloud compute instances describe "${GCP_VM_NAME}" --zone "${GCP_ZONE}"; then
    return 0
  fi

  while IFS= read -r candidate_zone; do
    if resource_exists gcloud compute instances describe "${GCP_VM_NAME}" --zone "${candidate_zone}"; then
      GCP_ZONE="${candidate_zone}"
      update_vm_metadata
      return 0
    fi
  done < <(zone_candidates)

  fail "Compute Engine VM ${GCP_VM_NAME} was not found after provisioning"
}

wait_for_ssh() {
  log "Waiting for SSH access to ${GCP_VM_NAME}"

  for _attempt in {1..36}; do
    if gcloud compute ssh "${GCP_VM_NAME}" \
      --zone "${GCP_ZONE}" \
      --tunnel-through-iap \
      --ssh-key-expire-after=10m \
      --command 'echo ssh-ready' >/dev/null 2>&1; then
      return 0
    fi

    sleep 10
  done

  fail "Compute Engine VM ${GCP_VM_NAME} did not become reachable over SSH"
}

wait_for_startup_scripts() {
  local startup_state

  log "Waiting for startup scripts on ${GCP_VM_NAME}"

  for _attempt in {1..60}; do
    startup_state="$(
      gcloud compute ssh "${GCP_VM_NAME}" \
        --zone "${GCP_ZONE}" \
        --tunnel-through-iap \
        --ssh-key-expire-after=10m \
        --command "systemctl show -p ActiveState --value google-startup-scripts.service 2>/dev/null || echo unknown" \
        2>/dev/null | tr -d '\r' || true
    )"

    case "${startup_state}" in
      active | activating | deactivating | reloading)
        sleep 5
        ;;
      failed)
        gcloud compute ssh "${GCP_VM_NAME}" \
          --zone "${GCP_ZONE}" \
          --tunnel-through-iap \
          --ssh-key-expire-after=10m \
          --command 'sudo journalctl -u google-startup-scripts.service -n 200 --no-pager' >&2 || true
        fail "Startup scripts failed on ${GCP_VM_NAME}"
        ;;
      inactive)
        return 0
        ;;
      *)
        sleep 5
        ;;
    esac
  done

  fail "Startup scripts on ${GCP_VM_NAME} did not finish in time"
}

bootstrap_vm_runtime() {
  local attempt

  for attempt in {1..3}; do
    log "Bootstrapping VM runtime on ${GCP_VM_NAME} (attempt ${attempt}/3)"
    if run_vm_ssh "${GCP_VM_NAME}" \
      --zone "${GCP_ZONE}" \
      --tunnel-through-iap \
      --ssh-key-expire-after=10m \
      --command "sudo bash -s -- '${GCP_REGION}'" < deploy/gcp/vm/bootstrap.sh >/dev/null; then
      return 0
    fi

    if (( attempt == 3 )); then
      break
    fi

    sleep 15
  done

  fail "VM runtime bootstrap failed on ${GCP_VM_NAME}"
}

render_migrate_env_file() {
  local destination="$1"

  cat >"${destination}" <<EOF
NODE_ENV: production
DATABASE_URL: ${DATABASE_URL}
PG_BOSS_SCHEMA: ${APP_PG_BOSS_SCHEMA}
EOF
}

render_api_env_file() {
  local destination="$1"
  local origin="$2"

  cat >"${destination}" <<EOF
NODE_ENV: production
DATABASE_URL: ${DATABASE_URL}
API_HOST: 0.0.0.0
PORT: "4000"
API_TRUST_PROXY: "true"
WEB_PORT: "3000"
WEB_ORIGIN: ${origin}
CORS_ORIGINS: ${origin}
WORKER_CONCURRENCY: "1"
CAPTURE_SCHEDULER_INTERVAL_MS: "60000"
SCREENSHOT_STORAGE_DRIVER: gcs
STORAGE_PUBLIC_PATH: /assets/screenshots
GCS_BUCKET_NAME: ${GCP_BUCKET_NAME}
GOOGLE_PLAY_DEFAULT_REGION: ${APP_GOOGLE_PLAY_DEFAULT_REGION}
GOOGLE_PLAY_DEFAULT_LOCALE: ${APP_GOOGLE_PLAY_DEFAULT_LOCALE}
PG_BOSS_SCHEMA: ${APP_PG_BOSS_SCHEMA}
PLAYWRIGHT_HEADLESS: "true"
PLAYWRIGHT_TIMEOUT_MS: "60000"
EOF
}

render_web_env_file() {
  local destination="$1"
  local api_scheme="$2"
  local api_host="$3"
  local api_port="$4"

  cat >"${destination}" <<EOF
API_UPSTREAM_SCHEME: ${api_scheme}
API_UPSTREAM_HOST: ${api_host}
API_UPSTREAM_PORT: "${api_port}"
EOF
}

ensure_api_service() {
  local env_file="$1"

  gcloud run deploy "${GCP_API_SERVICE_NAME}" \
    --image "${IMAGE_API}" \
    --region "${GCP_REGION}" \
    --platform managed \
    --allow-unauthenticated \
    --ingress all \
    --min-instances 0 \
    --max-instances 1 \
    --cpu 1 \
    --memory 512Mi \
    --port 4000 \
    --service-account "${GCP_API_SERVICE_ACCOUNT}" \
    --network "${GCP_NETWORK}" \
    --subnet "${GCP_SERVERLESS_SUBNET}" \
    --vpc-egress private-ranges-only \
    --env-vars-file "${env_file}" >/dev/null
}

ensure_web_service() {
  local env_file="$1"

  gcloud run deploy "${GCP_WEB_SERVICE_NAME}" \
    --image "${IMAGE_WEB}" \
    --region "${GCP_REGION}" \
    --platform managed \
    --allow-unauthenticated \
    --ingress all \
    --min-instances 0 \
    --max-instances 1 \
    --cpu 1 \
    --memory 256Mi \
    --port 8080 \
    --service-account "${GCP_WEB_SERVICE_ACCOUNT}" \
    --env-vars-file "${env_file}" >/dev/null
}

ensure_migration_job() {
  local env_file="$1"

  if resource_exists gcloud run jobs describe "${GCP_MIGRATE_JOB_NAME}" --region "${GCP_REGION}"; then
    gcloud run jobs update "${GCP_MIGRATE_JOB_NAME}" \
      --image "${IMAGE_MIGRATE}" \
      --region "${GCP_REGION}" \
      --service-account "${GCP_API_SERVICE_ACCOUNT}" \
      --network "${GCP_NETWORK}" \
      --subnet "${GCP_SERVERLESS_SUBNET}" \
      --vpc-egress private-ranges-only \
      --tasks 1 \
      --max-retries 1 \
      --task-timeout 10m \
      --command pnpm \
      --args db:migrate \
      --env-vars-file "${env_file}" >/dev/null
    return 0
  fi

  gcloud run jobs create "${GCP_MIGRATE_JOB_NAME}" \
    --image "${IMAGE_MIGRATE}" \
    --region "${GCP_REGION}" \
    --service-account "${GCP_API_SERVICE_ACCOUNT}" \
    --network "${GCP_NETWORK}" \
    --subnet "${GCP_SERVERLESS_SUBNET}" \
    --vpc-egress private-ranges-only \
    --tasks 1 \
    --max-retries 1 \
    --task-timeout 10m \
    --command pnpm \
    --args db:migrate \
    --env-vars-file "${env_file}" >/dev/null
}

render_vm_env_file() {
  local destination="$1"
  local web_origin="$2"
  local encoded_user encoded_password

  encoded_user="$(urlencode "${APP_DATABASE_USER}")"
  encoded_password="$(urlencode "${APP_DATABASE_PASSWORD}")"

  cat >"${destination}" <<EOF
NODE_ENV=production
POSTGRES_DB=${APP_DATABASE_NAME}
POSTGRES_USER=${APP_DATABASE_USER}
POSTGRES_PASSWORD=${APP_DATABASE_PASSWORD}
DATABASE_URL=postgresql://${encoded_user}:${encoded_password}@postgres:5432/${APP_DATABASE_NAME}
API_HOST=0.0.0.0
API_PORT=4000
WEB_PORT=3000
WEB_ORIGIN=${web_origin}
CORS_ORIGINS=${web_origin}
WORKER_CONCURRENCY=1
CAPTURE_SCHEDULER_INTERVAL_MS=60000
SCREENSHOT_STORAGE_DRIVER=gcs
STORAGE_PUBLIC_PATH=/assets/screenshots
GCS_BUCKET_NAME=${GCP_BUCKET_NAME}
GOOGLE_PLAY_DEFAULT_REGION=${APP_GOOGLE_PLAY_DEFAULT_REGION}
GOOGLE_PLAY_DEFAULT_LOCALE=${APP_GOOGLE_PLAY_DEFAULT_LOCALE}
PG_BOSS_SCHEMA=${APP_PG_BOSS_SCHEMA}
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT_MS=60000
WORKER_IMAGE=${IMAGE_WORKER}
POSTGRES_SHARED_BUFFERS=128MB
POSTGRES_MAX_CONNECTIONS=50
POSTGRES_WORK_MEM=4MB
EOF
}

render_pg_hba_file() {
  local destination="$1"

  cat >"${destination}" <<EOF
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     trust
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
host    all             all             ${GCP_SERVERLESS_SUBNET_CIDR} scram-sha-256
host    all             all             172.16.0.0/12           scram-sha-256
EOF
}

sync_vm_runtime_bundle() {
  local temp_dir vm_stage_dir web_origin="$1"

  temp_dir="$(mktemp -d)"
  vm_stage_dir="${temp_dir}/playwatch-release"
  mkdir -p "${vm_stage_dir}/postgres"

  cp deploy/gcp/vm/docker-compose.yml "${vm_stage_dir}/docker-compose.yml"
  render_vm_env_file "${vm_stage_dir}/.env" "${web_origin}"
  render_pg_hba_file "${vm_stage_dir}/postgres/pg_hba.conf"

  run_vm_scp \
    --recurse \
    --zone "${GCP_ZONE}" \
    --tunnel-through-iap \
    --ssh-key-expire-after=10m \
    "${vm_stage_dir}" \
    "${GCP_VM_NAME}:~/" >/dev/null

  run_vm_ssh "${GCP_VM_NAME}" \
    --zone "${GCP_ZONE}" \
    --tunnel-through-iap \
    --ssh-key-expire-after=10m \
    --command "
      set -euo pipefail
      sudo install -d -m 0755 /opt/playwatch/runtime/postgres
      sudo cp -R ~/playwatch-release/. /opt/playwatch/runtime/
      sudo chown -R root:root /opt/playwatch/runtime
      sudo gcloud auth configure-docker '${GCP_REGION}-docker.pkg.dev' --quiet
      cd /opt/playwatch/runtime
      sudo docker compose pull postgres worker
    " >/dev/null

  rm -rf "${temp_dir}"
}

start_vm_postgres() {
  log 'Starting PostgreSQL on the VM'
  run_vm_ssh "${GCP_VM_NAME}" \
    --zone "${GCP_ZONE}" \
    --tunnel-through-iap \
    --ssh-key-expire-after=10m \
    --command "
      set -euo pipefail
      cd /opt/playwatch/runtime
      sudo docker compose up -d postgres
      for attempt in {1..30}; do
        if sudo docker compose exec -T postgres pg_isready -U '${APP_DATABASE_USER}' -d '${APP_DATABASE_NAME}' >/dev/null 2>&1; then
          exit 0
        fi
        sleep 5
      done
      exit 1
    " >/dev/null
}

start_vm_worker() {
  log 'Starting worker on the VM'
  run_vm_ssh "${GCP_VM_NAME}" \
    --zone "${GCP_ZONE}" \
    --tunnel-through-iap \
    --ssh-key-expire-after=10m \
    --command "
      set -euo pipefail
      cd /opt/playwatch/runtime
      sudo docker compose up -d worker
      sudo docker compose ps
    " >/dev/null
}

verify_remote_worker() {
  run_vm_ssh "${GCP_VM_NAME}" \
    --zone "${GCP_ZONE}" \
    --tunnel-through-iap \
    --ssh-key-expire-after=10m \
    --command "
      set -euo pipefail
      cd /opt/playwatch/runtime
      sudo docker compose ps worker --status running | grep -q worker
    " >/dev/null
}

wait_for_http_contains() {
  local url="$1"
  local expected_fragment="$2"

  for _attempt in {1..30}; do
    if curl --fail --silent --show-error "${url}" | grep -q "${expected_fragment}"; then
      return 0
    fi
    sleep 5
  done

  fail "Timed out waiting for ${url}"
}

parse_service_url() {
  local url="$1"

  SERVICE_URL_SCHEME="${url%%://*}"
  SERVICE_URL_HOSTPORT="${url#*://}"
  SERVICE_URL_HOSTPORT="${SERVICE_URL_HOSTPORT%/}"

  if [[ "${SERVICE_URL_HOSTPORT}" == *:* ]]; then
    SERVICE_URL_HOST="${SERVICE_URL_HOSTPORT%%:*}"
    SERVICE_URL_PORT="${SERVICE_URL_HOSTPORT##*:}"
  else
    SERVICE_URL_HOST="${SERVICE_URL_HOSTPORT}"
    if [[ "${SERVICE_URL_SCHEME}" == 'https' ]]; then
      SERVICE_URL_PORT='443'
    else
      SERVICE_URL_PORT='80'
    fi
  fi
}

set_defaults

require_env \
  GCP_PROJECT_ID \
  APP_DATABASE_PASSWORD \
  IMAGE_API \
  IMAGE_MIGRATE \
  IMAGE_WEB \
  IMAGE_WORKER
GCP_PROJECT_NUMBER="$(gcloud projects describe "${GCP_PROJECT_ID}" --format='value(projectNumber)')"

if [[ "${BOOTSTRAP_INFRASTRUCTURE}" == 'true' ]]; then
  ensure_gcp_services
  ensure_artifact_registry
  ensure_network
  ensure_subnet "${GCP_VM_SUBNET}" "${GCP_VM_SUBNET_CIDR}"
  ensure_subnet "${GCP_SERVERLESS_SUBNET}" "${GCP_SERVERLESS_SUBNET_CIDR}"
  ensure_bucket
  ensure_runtime_service_accounts
  ensure_serverless_network_access
  ensure_deployer_vm_access
  ensure_firewall_rule "${GCP_VM_TAG}-allow-postgres-from-serverless" "${GCP_SERVERLESS_SUBNET_CIDR}" "${GCP_VM_TAG}" 5432
  ensure_firewall_rule "${GCP_VM_TAG}-allow-ssh-from-iap" "35.235.240.0/20" "${GCP_VM_TAG}" 22
fi

ensure_vm
wait_for_ssh
wait_for_startup_scripts
bootstrap_vm_runtime

VM_INTERNAL_IP="$(gcloud compute instances describe "${GCP_VM_NAME}" --zone "${GCP_ZONE}" --format='value(networkInterfaces[0].networkIP)')"
DATABASE_URL="postgresql://$(urlencode "${APP_DATABASE_USER}"):$(urlencode "${APP_DATABASE_PASSWORD}")@${VM_INTERNAL_IP}:5432/${APP_DATABASE_NAME}"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_DIR}"' EXIT

sync_vm_runtime_bundle 'https://placeholder.invalid'
start_vm_postgres

render_migrate_env_file "${TEMP_DIR}/migrate.env.yaml"
log 'Configuring migration job'
ensure_migration_job "${TEMP_DIR}/migrate.env.yaml"

if [[ "${RUN_MIGRATIONS}" == 'true' ]]; then
  log 'Executing migration job'
  gcloud run jobs execute "${GCP_MIGRATE_JOB_NAME}" --region "${GCP_REGION}" --wait >/dev/null
fi

log 'Deploying Cloud Run API service'
render_api_env_file "${TEMP_DIR}/api.env.yaml" 'https://placeholder.invalid'
ensure_api_service "${TEMP_DIR}/api.env.yaml"

API_SERVICE_URL="$(gcloud run services describe "${GCP_API_SERVICE_NAME}" --region "${GCP_REGION}" --format='value(status.url)')"
parse_service_url "${API_SERVICE_URL}"

log 'Deploying Cloud Run web service'
render_web_env_file "${TEMP_DIR}/web.env.yaml" "${SERVICE_URL_SCHEME}" "${SERVICE_URL_HOST}" "${SERVICE_URL_PORT}"
ensure_web_service "${TEMP_DIR}/web.env.yaml"

WEB_SERVICE_URL="$(gcloud run services describe "${GCP_WEB_SERVICE_NAME}" --region "${GCP_REGION}" --format='value(status.url)')"

log 'Refreshing API CORS origin for the public web URL'
render_api_env_file "${TEMP_DIR}/api.env.yaml" "${WEB_SERVICE_URL}"
ensure_api_service "${TEMP_DIR}/api.env.yaml"

sync_vm_runtime_bundle "${WEB_SERVICE_URL}"
start_vm_worker
verify_remote_worker

wait_for_http_contains "${API_SERVICE_URL}/api/health" '"status":"ok"'
wait_for_http_contains "${WEB_SERVICE_URL}/api/health" '"status":"ok"'
wait_for_http_contains "${WEB_SERVICE_URL}/" '<!doctype html>'

write_output 'web_service_url' "${WEB_SERVICE_URL}"
write_output 'api_service_url' "${API_SERVICE_URL}"
write_output 'vm_internal_ip' "${VM_INTERNAL_IP}"
write_output 'bucket_name' "${GCP_BUCKET_NAME}"

log "Deployment complete. Web entrypoint: ${WEB_SERVICE_URL}"
