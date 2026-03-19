# GCP Deployment Assets

This directory contains the checked-in deployment assets for the production GCP rollout path.

## What Lives Here

| Path                    | Purpose                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `config.env.example`    | Local bootstrap template with safe defaults and no secrets                          |
| `scripts/deploy.sh`     | Idempotent deployment entrypoint used by GitHub Actions and local operators         |
| `vm/bootstrap.sh`       | Prepares the Compute Engine host with Docker, gcloud, swap, and runtime directories |
| `vm/docker-compose.yml` | Worker and PostgreSQL stack that runs on the VM                                     |

## Deployment Model

| Surface             | Target                   |
| ------------------- | ------------------------ |
| Web                 | Cloud Run                |
| API                 | Cloud Run                |
| Database migrations | Cloud Run job            |
| Worker              | Compute Engine VM        |
| PostgreSQL          | Same Compute Engine VM   |
| Screenshots         | Cloud Storage            |
| Browser entrypoint  | Public Cloud Run web URL |

The browser stays same-origin because the web container already proxies `/api` and `/assets/screenshots` to the API service. No external load balancer is required for this setup.

## Default Infrastructure Shape

The deployment script can run with only `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_ZONE`, and `APP_DATABASE_PASSWORD`. Everything else has a checked-in default:

| Concern                | Default                                               |
| ---------------------- | ----------------------------------------------------- |
| VPC network            | `playwatch-prod`                                      |
| VM subnet              | `playwatch-prod-vm` (`10.20.0.0/24`)                  |
| Cloud Run subnet       | `playwatch-prod-serverless` (`10.20.1.0/24`)          |
| Artifact Registry repo | `playwatch`                                           |
| Bucket name            | `${GCP_PROJECT_ID}-playwatch-screenshots`             |
| VM shape               | `e2-micro`                                            |
| Cloud Run services     | `playwatch-web`, `playwatch-api`, `playwatch-migrate` |

The bucket receives a lifecycle rule that deletes screenshot objects older than `30` days to keep storage usage predictable.

## Required GitHub Secrets

| Secret                           | Purpose                                                       |
| -------------------------------- | ------------------------------------------------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Federation provider resource name           |
| `GCP_DEPLOYER_SERVICE_ACCOUNT`   | Deployer service account email used by GitHub Actions         |
| `APP_DATABASE_PASSWORD`          | PostgreSQL password shared by the API, migrations, and worker |

## Required GitHub Variables

| Variable         | Example                 |
| ---------------- | ----------------------- |
| `GCP_PROJECT_ID` | `solid-setup-466109-h4` |
| `GCP_REGION`     | `us-central1`           |
| `GCP_ZONE`       | `us-central1-a`         |

Everything else is optional. If you need to override the defaults, add the matching variable from `config.env.example`.

## Workflow Dispatch Inputs

| Input                      | Meaning                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `environment`              | GitHub environment that owns the secrets and vars                                    |
| `bootstrap_infrastructure` | Creates any missing VPC, subnet, bucket, service account, firewall, and VM resources |
| `run_quality_gates`        | Runs `pnpm audit --prod` and `pnpm check` first                                      |
| `run_migrations`           | Executes the Cloud Run migration job                                                 |

## Operating Notes

- The API and migration job reach PostgreSQL through direct VPC egress from Cloud Run into the dedicated serverless subnet.
- The VM only allows PostgreSQL ingress from the serverless subnet and SSH ingress from Google IAP.
- The VM keeps an external IP for low-cost outbound package and image access, but the custom VPC has no broad ingress rules.
- For local operator use, copy `config.env.example` to `config.env`, add `APP_DATABASE_PASSWORD`, export the file, and set `IMAGE_API`, `IMAGE_MIGRATE`, `IMAGE_WEB`, and `IMAGE_WORKER` before running `scripts/deploy.sh`.
