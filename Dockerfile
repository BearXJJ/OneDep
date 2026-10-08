FROM node:22.23.3-bookworm-slim AS build

WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm install --global pnpm@12.9.1 --registry="$NPM_REGISTRY"
COPY . .
RUN HUSKY=0 DATABASE_URL=postgresql://unused:unused@localhost:5432/unused pnpm install --frozen-lockfile --registry="$NPM_REGISTRY"
RUN pnpm build

FROM build AS api
ENV NODE_ENV=production
WORKDIR /app/apps/api
USER node
CMD ["node", "dist/main.js"]

FROM nginx:stable-alpine AS web
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
