# Testing Strategy

## Automated Gates

| Command | Purpose |
| --- | --- |
| `pnpm lint` | Static analysis |
| `pnpm typecheck` | Cross-package TypeScript validation |
| `pnpm test` | Unit and integration tests via Vitest |
| `pnpm build` | Workspace production build verification |
| `pnpm check` | Full local gate |

## Coverage Focus

| Layer | Covered behavior |
| --- | --- |
| Shared package | Google Play URL normalization and schema behavior |
| API routes | Health, validation mapping, domain errors, CORS/static delivery |
| API services | Create, update, duplicate handling, snapshot mapping |
| Worker jobs | Scheduling, capture success, failure handling, storage safety |
| Frontend | Forms, theme, dashboard flow, detail flow, timeline rendering |

## Manual Verification Matrix

Use at least the following app set for sign-off:

| Package | Frequency | Expected check |
| --- | --- | --- |
| `com.spotify.music` | `5` minutes | Immediate capture and repeat cadence behavior |
| `com.whatsapp` | `15` minutes | Immediate capture and timeline entry |
| `com.instagram.android` | `30` minutes | Immediate capture and detail rendering |
| `com.discord` | `60` minutes | Immediate capture and dashboard summary |
| `com.duolingo` | `180` minutes | Immediate capture and long-cadence scheduling |

## Browser Sign-Off Checklist

1. Verify desktop layout first.
2. Add a monitored app from the UI.
3. Confirm the worker produces a screenshot.
4. Open the app detail page and confirm timeline ordering and timestamps.
5. Edit locale, region, or cadence and confirm the monitor updates successfully.
6. Verify theme switching and smaller breakpoints.
7. Verify Dockerized browsing through `http://localhost:3000`.

## CI Expectations

The CI pipeline should prove:

- workspace quality gates pass
- Docker images build
- the packaged stack boots successfully
- the proxied health endpoint responds
- the web shell and proxied API are both reachable
