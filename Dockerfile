# syntax=docker/dockerfile:1
FROM node:22.23.3-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm install --global pnpm@12.9.1 --registry="$NPM_REGISTRY"
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/prisma7.config.ts apps/api/tsconfig.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    HUSKY=0 DATABASE_URL=postgresql://unused:unused@localhost:5432/unused \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store --registry="$NPM_REGISTRY"

FROM dependencies AS shared
COPY packages/shared ./packages/shared
RUN pnpm --filter @onedep/shared build

FROM shared AS production-dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter api deploy --prod --ignore-scripts --store-dir=/pnpm/store /prod/api

FROM shared AS api-build
COPY apps/api ./apps/api
RUN pnpm --filter api build

FROM shared AS web-build
COPY apps/web ./apps/web
RUN pnpm --filter web build

FROM base AS api
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*
COPY apps/api/adapters/requirements.txt /tmp/onedep-requirements.txt
RUN python3 -m venv /opt/onedep-python \
    && /opt/onedep-python/bin/python -m pip install --no-cache-dir -r /tmp/onedep-requirements.txt
RUN mkdir -p /data/uploads && chown node:node /data/uploads
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=production-dependencies /prod/api/node_modules ./node_modules
COPY --from=production-dependencies /prod/api/package.json ./package.json
COPY --from=api-build /app/apps/api/dist ./dist
COPY apps/api/adapters ./adapters
COPY apps/api/prisma ./prisma
COPY apps/api/prisma7.config.ts ./prisma7.config.ts
RUN DATABASE_URL=postgresql://unused:unused@localhost:5432/unused node node_modules/prisma/build/index.js validate --config prisma7.config.ts \
    && /opt/onedep-python/bin/python -c "import gemmi; from PIL import Image" \
    && node --input-type=module -e "await import('@onedep/shared/deposition'); await import('@onedep/shared/copilot'); await import('./dist/generated/prisma/client.js');"
USER node
CMD ["node", "dist/main.js"]

FROM nginx:stable-alpine AS web
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
