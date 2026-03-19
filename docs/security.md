# Security Notes

## Security Posture Summary

| Control | Current implementation |
| --- | --- |
| Input validation | Zod-validated request payloads and shared DTO schemas |
| URL normalization | Google Play URLs are canonicalized before persistence |
| File-path safety | Screenshot keys are derived from validated package IDs and timestamps |
| Error handling | Stable error payloads without stack-trace leakage |
| Static asset serving | Screenshot files are exposed only through a controlled public prefix |
| Scheduling safety | Due jobs are claimed atomically in PostgreSQL |
| Browser-facing headers | Packaged web app serves CSP, clickjacking, referrer, nosniff, and permissions headers |

## Trust Boundaries

| Boundary | Risk | Current mitigation |
| --- | --- | --- |
| Browser -> API | Malformed input, abuse, origin confusion | Validation, allowlist CORS, rate limiting |
| API -> DB | Data integrity | Typed repositories and SQL constraints |
| Worker -> Google Play | Remote content volatility | Playwright retries and sanitized failure recording |
| Worker -> Storage | Path traversal | Validated object keys and safe path resolution |
| Web -> Screenshot assets | Broken image delivery or cross-origin policies | Same-origin proxy path in Docker packaging |

## Secure-By-Default Decisions

- Monitor IDs use UUIDs instead of incrementing public identifiers.
- Screenshot counts are based on successful captures only.
- Failed captures remain in the timeline for chronological review.
- The worker shortens retry delay after failures instead of silently waiting for the full cadence window.

## Transport and Runtime Hardening

| Area | Control |
| --- | --- |
| HTTP headers | Helmet on the API, CSP and browser headers on the packaged web app |
| Rate limiting | Global Fastify rate limiter |
| Request size | API body limit is bounded |
| Shutdown | API and worker stop gracefully on process termination |
| Proxy readiness | API can be configured to trust reverse-proxy headers |

## Remaining Production Work

| Topic | Next step |
| --- | --- |
| Object storage | Configure the `gcs` storage driver and restrict the bucket access model |
| Secrets | Inject secrets from Secret Manager |
| Monitoring | Add logs, metrics, alerting, and failure dashboards |
| Content policy | Tune CSP for production domains and third-party integrations |
| Queue resilience | Add dead-letter policy and retry governance |
