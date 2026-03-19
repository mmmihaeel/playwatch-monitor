# PlayWatch Monitor

PlayWatch Monitor tracks Google Play listing changes for a curated set of Android applications. Operators can register listings, capture screenshots on a schedule, and review historical changes in a timeline-oriented dashboard.

## Capabilities

| Area         | What it does                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Registration | Adds monitored apps from the dashboard or the API using canonical Google Play URLs                  |
| Scheduling   | Queues the first capture immediately, then keeps each app on its own capture cadence                |
| Capture      | Uses Playwright to open the Play Store listing, collect the title, and store a screenshot           |
| Timeline     | Shows the newest screenshots first, with capture time, success state, change state, and storage key |
| Operations   | Ships with Docker Compose, SQL migrations, tests, and CI verification                               |

## Architecture

```mermaid
flowchart LR
  Web["Web Dashboard"] -->|REST /api| Api["Fastify API"]
  Web -->|Screenshots| Api
  Api --> Db["PostgreSQL"]
  Worker["Scheduler + Capture Worker"] --> Db
  Worker -->|Capture Jobs| Queue["pg-boss"]
  Queue --> Worker
  Worker --> Storage["Screenshot Storage"]
  Api --> Storage
```

Runtime responsibilities:

| Component          | Responsibility                                                     |
| ------------------ | ------------------------------------------------------------------ |
| `apps/web`         | Dashboard for creating, editing, and reviewing monitored apps      |
| `apps/api`         | Typed HTTP API, validation, errors, screenshot asset serving       |
| `apps/worker`      | Due-job scheduler and Playwright capture execution                 |
| `packages/shared`  | Shared DTOs, schemas, and Google Play URL helpers                  |
| `packages/config`  | Environment parsing and defaults                                   |
| `packages/db`      | Drizzle schema, repositories, migrations, and DB utilities         |
| `packages/storage` | Screenshot storage drivers for local disk and cloud object storage |

## Prerequisites

| Tool       | Version                        |
| ---------- | ------------------------------ |
| Node.js    | 24.x                           |
| pnpm       | 10.x                           |
| PostgreSQL | 18.x                           |
| Docker     | Recent Engine + Compose plugin |

## Quick Start

### 1. Configure the environment

PowerShell:

```powershell
Copy-Item .env.example .env
```

Bash:

```bash
cp .env.example .env
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Apply database migrations

```bash
pnpm db:migrate
```

### 4. Start the local stack without Docker

```bash
pnpm dev
```

Local endpoints:

| Surface    | URL                                                       |
| ---------- | --------------------------------------------------------- |
| Web        | `http://localhost:3000`                                   |
| API health | `http://localhost:4000/api/health`                        |
| PostgreSQL | `postgresql://postgres:postgres@localhost:5432/playwatch` |

## Docker Compose

Bring the packaged stack up locally:

```bash
docker compose up --build -d
```

What it starts:

| Service    | Port   | Notes                      |
| ---------- | ------ | -------------------------- |
| `postgres` | `5432` | Primary database           |
| `api`      | `4000` | Fastify API                |
| `web`      | `3000` | Nginx-served dashboard     |
| `worker`   | none   | Scheduler + capture worker |
| `migrate`  | none   | One-off migration job      |

In the Docker build the Nginx web container proxies `/api/*` and `/assets/screenshots/*` back to the API service. The browser therefore talks to a same-origin `http://localhost:3000` surface instead of a separate `3000 -> 4000` hop.

## Operator Workflow

1. Add a Google Play listing URL from the dashboard.
2. Choose region, locale, and capture cadence.
3. Wait for the first capture, which is scheduled immediately.
4. Open the app detail page to review the timeline.
5. Edit a monitor at any time to adjust cadence, market context, or active state.

## Quality Gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

## Configuration

Core environment variables:

| Variable                        | Purpose                                                      | Default                                       |
| ------------------------------- | ------------------------------------------------------------ | --------------------------------------------- |
| `DATABASE_URL`                  | PostgreSQL connection string                                 | required                                      |
| `API_HOST`                      | API listen host                                              | `0.0.0.0`                                     |
| `API_PORT`                      | API listen port                                              | `4000`                                        |
| `PORT`                          | Container-platform override for the API port                 | unset                                         |
| `API_TRUST_PROXY`               | Honors reverse-proxy headers in production-style deployments | `false`                                       |
| `WEB_ORIGIN`                    | Browser origin used by API/CORS defaults                     | `http://localhost:3000`                       |
| `CORS_ORIGINS`                  | Allowed browser origins                                      | `http://localhost:3000,http://127.0.0.1:3000` |
| `SCREENSHOT_STORAGE_DRIVER`     | Storage backend for screenshot assets                        | `local`                                       |
| `SCREENSHOT_STORAGE_DIR`        | Local screenshot root                                        | `./data/screenshots`                          |
| `STORAGE_PUBLIC_PATH`           | Public asset prefix served by the API                        | `/assets/screenshots`                         |
| `GCS_BUCKET_NAME`               | Bucket name when `SCREENSHOT_STORAGE_DRIVER=gcs`             | unset                                         |
| `WORKER_CONCURRENCY`            | Parallel capture workers                                     | `2`                                           |
| `CAPTURE_SCHEDULER_INTERVAL_MS` | Due-job scan interval                                        | `10000`                                       |

See [.env.example](./.env.example) for the full set.

## Project Structure

| Path               | Purpose                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `apps/web`         | Dashboard application                                              |
| `apps/api`         | HTTP API and static screenshot serving                             |
| `apps/worker`      | Scheduler and capture worker                                       |
| `packages/shared`  | Shared schemas and DTOs                                            |
| `packages/config`  | Typed environment config                                           |
| `packages/db`      | Drizzle schema, repositories, migrations, and scripts              |
| `packages/storage` | Storage adapters for screenshot persistence                        |
| `deploy/gcp`       | Workflow assets and VM manifests for the GCP rollout path          |
| `docs`             | Architecture, deployment, security, testing, and operations guides |

## Deployment Readiness

The repository is prepared for container-based deployment, and it now ships a checked-in GCP release path for Cloud Run plus Compute Engine:

| Concern            | Current state                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| Stateless services | API and web are container-friendly and deployable to Cloud Run                                                 |
| Config             | Environment is parsed centrally and typed                                                                      |
| Data               | PostgreSQL is isolated behind Drizzle repositories                                                             |
| Storage boundary   | Local and GCS-backed screenshot storage share the same adapter interface                                       |
| Release order      | Migrations can run as a dedicated job before app rollout                                                       |
| Browser access     | Same-origin `/api` and `/assets/screenshots` routing is preserved on GCP through the web service reverse proxy |
| Worker host        | A dedicated `e2-micro` VM manifest is checked in for the worker plus PostgreSQL pair                           |

## GCP Deployment Workflow

Production deployment is driven by [deploy-gcp.yml](./.github/workflows/deploy-gcp.yml). The workflow:

1. Optionally runs `pnpm audit --prod` and `pnpm check`.
2. Builds immutable `api`, `api-migrate`, `web`, and `worker` images in Artifact Registry.
3. Ensures the GCS bucket, runtime service accounts, subnets, firewall rules, and VM exist.
4. Starts PostgreSQL on the VM, runs migrations through a Cloud Run job on the private VPC path, then deploys `api` and `web` to Cloud Run.
5. Re-points the public web service at the API Cloud Run URL so the browser keeps using same-origin `/api` and `/assets/screenshots`.
6. Copies the checked-in worker/PostgreSQL compose bundle to the VM over IAP SSH and restarts the worker.

The concrete rollout assets live in [deploy/gcp/README.md](./deploy/gcp/README.md), the reusable environment template lives in [config.env.example](./deploy/gcp/config.env.example), and the high-level cloud mapping is documented in [deployment.md](./docs/deployment.md).

## Further Reading

- [architecture.md](./docs/architecture.md)
- [deployment.md](./docs/deployment.md)
- [deploy/gcp/README.md](./deploy/gcp/README.md)
- [security.md](./docs/security.md)
- [testing.md](./docs/testing.md)
- [operations.md](./docs/operations.md)
- [engineering-decisions.md](./docs/engineering-decisions.md)
