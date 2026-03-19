FROM node:24-bookworm-slim AS base
WORKDIR /workspace
RUN corepack enable

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/storage/package.json packages/storage/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY apps/api apps/api
COPY packages/config packages/config
COPY packages/db packages/db
COPY packages/shared packages/shared
COPY packages/storage packages/storage

RUN pnpm --filter @playwatch/shared build
RUN pnpm --filter @playwatch/config build
RUN pnpm --filter @playwatch/storage build
RUN pnpm --filter @playwatch/db build
RUN pnpm --filter @playwatch/api build

FROM build AS migrate

FROM node:24-bookworm-slim
WORKDIR /workspace

ENV NODE_ENV=production

RUN groupadd --system --gid 1001 playwatch && useradd --system --uid 1001 --gid 1001 --create-home playwatch

COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/package.json ./package.json
COPY --from=build /workspace/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /workspace/apps/api ./apps/api
COPY --from=build /workspace/packages/config ./packages/config
COPY --from=build /workspace/packages/db ./packages/db
COPY --from=build /workspace/packages/shared ./packages/shared
COPY --from=build /workspace/packages/storage ./packages/storage

EXPOSE 4000

USER playwatch

CMD ["node", "apps/api/dist/server.js"]
