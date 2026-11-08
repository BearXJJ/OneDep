FROM node:22.23.3-bookworm-slim AS build

WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm install --global pnpm@12.9.1 --registry="$NPM_REGISTRY"
COPY . .
RUN HUSKY=0 DATABASE_URL=postgresql://unused:unused@localhost:5432/unused pnpm install --frozen-lockfile --registry="$NPM_REGISTRY"
RUN pnpm build

FROM build AS api
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/onedep-python \
    && /opt/onedep-python/bin/python -m pip install --no-cache-dir -r /app/apps/api/adapters/requirements.txt
ENV NODE_ENV=production
WORKDIR /app/apps/api
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
CMD ["node", "dist/main.js"]

FROM nginx:stable-alpine AS web
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
