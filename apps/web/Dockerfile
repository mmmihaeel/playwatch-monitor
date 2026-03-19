FROM node:24-bookworm-slim AS build
WORKDIR /workspace

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY . .

RUN corepack enable
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @playwatch/shared build
RUN pnpm --filter @playwatch/web build

FROM nginx:1.29-alpine

ENV PORT=8080
ENV API_UPSTREAM_SCHEME=http
ENV API_UPSTREAM_HOST=api
ENV API_UPSTREAM_PORT=4000

RUN touch /var/run/nginx.pid \
  && mkdir -p /etc/nginx/templates \
  && chown -R nginx:nginx /usr/share/nginx/html /etc/nginx/conf.d /etc/nginx/templates /var/cache/nginx /var/run/nginx.pid

COPY --from=build --chown=nginx:nginx /workspace/apps/web/dist /usr/share/nginx/html
COPY --chown=nginx:nginx apps/web/nginx.conf /etc/nginx/templates/default.conf.template

USER nginx

EXPOSE 8080
