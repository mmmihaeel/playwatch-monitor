# Operations Guide

## Local Runtime Modes

| Mode                   | Command                        | When to use                                                     |
| ---------------------- | ------------------------------ | --------------------------------------------------------------- |
| Full local development | `pnpm dev`                     | Fast iteration across web, API, and worker                      |
| Packaged runtime       | `docker compose up --build -d` | End-to-end validation with the production-like container layout |
| Full verification      | `pnpm check`                   | Static checks, tests, and builds before review                  |

## Standard Local Workflow

1. Copy `.env.example` to `.env`.
2. Run `pnpm install`.
3. Start PostgreSQL locally or use Docker Compose.
4. Apply migrations with `pnpm db:migrate`.
5. Start the stack with `pnpm dev` or `docker compose up --build -d`.
6. Open `http://localhost:3000`.
7. Remove monitors you no longer need from the detail page to stop captures and clear stored screenshots.

## Health Endpoints

| Surface            | URL                                | Expected result   |
| ------------------ | ---------------------------------- | ----------------- |
| Web shell          | `http://localhost:3000`            | HTML document     |
| Proxied API health | `http://localhost:3000/api/health` | `{"status":"ok"}` |
| Direct API health  | `http://localhost:4000/api/health` | `{"status":"ok"}` |

## Useful Commands

| Need                        | Command                                             |
| --------------------------- | --------------------------------------------------- |
| Run migrations              | `pnpm db:migrate`                                   |
| Seed demo data              | `pnpm db:seed`                                      |
| Rebuild packaged stack      | `docker compose up --build -d`                      |
| Stop packaged stack         | `docker compose down -v --remove-orphans`           |
| Tail worker logs            | `docker compose logs -f worker`                     |
| Tail API logs               | `docker compose logs -f api`                        |
| Run the GCP deploy workflow | GitHub Actions -> `Deploy to GCP` workflow dispatch |

## Troubleshooting

| Symptom                           | Likely cause                                   | Action                                                                                                                                       |
| --------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Web loads but screenshots do not  | Worker has not completed the first capture yet | Check `docker compose logs -f worker` and wait for the first success                                                                         |
| API health fails                  | API or PostgreSQL is not ready                 | Inspect `docker compose ps` and API logs                                                                                                     |
| Duplicate package error on create | The package is already monitored               | Open the existing monitor from the list instead of creating another                                                                          |
| Old screenshots keep accumulating | Stale monitors were left active                | Delete the monitor from its detail page so the app row, stored screenshots, and pending queued captures are cleaned up                      |
| Screenshots 404                   | Storage path mismatch                          | Verify `SCREENSHOT_STORAGE_DRIVER`, `SCREENSHOT_STORAGE_DIR`, `STORAGE_PUBLIC_PATH`, and `GCS_BUCKET_NAME` are aligned across API and worker |

## Production-Oriented Notes

- The packaged web app already talks to same-origin `/api` and `/assets/screenshots` paths, and the Cloud Run web service preserves that contract by proxying those paths to the API service URL.
- The API honors `PORT` for container platforms that inject it automatically.
- The worker and API stay stateless apart from PostgreSQL and screenshot storage, and the storage adapter already supports both local disk and GCS-backed object storage.
- The checked-in GCP deployment bundle lives in `deploy/gcp`, and production rollout is driven from `.github/workflows/deploy-gcp.yml`.
