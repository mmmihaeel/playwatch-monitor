#!/usr/bin/env bash

set -euo pipefail

metadata_region() {
  curl -fsS -H 'Metadata-Flavor: Google' \
    'http://metadata.google.internal/computeMetadata/v1/instance/attributes/playwatch-artifact-registry-region' 2>/dev/null || true
}

REGION="${1:-$(metadata_region)}"

if [[ -z "${REGION}" ]]; then
  echo 'Usage: bootstrap.sh <artifact-registry-region>' >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

ensure_package() {
  local command_name="$1"
  shift

  if command -v "${command_name}" >/dev/null 2>&1; then
    return 0
  fi

  apt-get update
  apt-get install -y "$@"
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    return 0
  fi

  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings

  if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
    curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi

  if [[ ! -f /etc/apt/sources.list.d/docker.list ]]; then
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
      $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" | tee /etc/apt/sources.list.d/docker.list >/dev/null
  fi

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl restart docker
}

install_gcloud() {
  if command -v gcloud >/dev/null 2>&1; then
    return 0
  fi

  apt-get update
  apt-get install -y ca-certificates curl gnupg apt-transport-https
  install -m 0755 -d /etc/apt/keyrings

  if [[ ! -f /etc/apt/keyrings/google-cloud.gpg ]]; then
    curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /etc/apt/keyrings/google-cloud.gpg
    chmod a+r /etc/apt/keyrings/google-cloud.gpg
  fi

  if [[ ! -f /etc/apt/sources.list.d/google-cloud-sdk.list ]]; then
    echo "deb [signed-by=/etc/apt/keyrings/google-cloud.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
      | tee /etc/apt/sources.list.d/google-cloud-sdk.list >/dev/null
  fi

  apt-get update
  apt-get install -y google-cloud-cli
}

ensure_swap() {
  if swapon --show | grep -q '/swapfile'; then
    return 0
  fi

  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
}

ensure_sysctl() {
  cat >/etc/sysctl.d/99-playwatch.conf <<EOF
vm.swappiness=10
vm.vfs_cache_pressure=50
EOF

  sysctl --system >/dev/null
}

ensure_directories() {
  install -d -m 0755 /opt/playwatch/runtime/postgres
}

configure_docker_auth() {
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet >/dev/null || true
}

ensure_package bash bash
ensure_package curl curl
ensure_package python3 python3
install_docker
install_gcloud
ensure_swap
ensure_sysctl
ensure_directories
configure_docker_auth
