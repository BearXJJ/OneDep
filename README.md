# OneDep

`apps/web` 是 Vue 3 + Vite 前端，`apps/api` 是 NestJS API；本地 PostgreSQL 和 Redis 由 Docker Compose 提供。`packages/shared` 提供前后端共用的用户类型。

## 技术架构

项目使用 pnpm workspace 管理两个应用和一个共享包。前后端分别运行；Docker Compose 在本地提供数据服务。

```mermaid
flowchart LR
    Browser[浏览器] --> Web[Vue 3 前端]
    Web -->|/api 请求；开发时由 Vite 代理| API[NestJS API]
    API --> Prisma[Prisma Client + PostgreSQL 适配器]
    Prisma --> Postgres[(PostgreSQL)]
    API --> RedisClient[ioredis]
    RedisClient --> Redis[(Redis)]
    Shared[共享用户类型] -.-> Web
    Shared -.-> API
```

版本以 `.nvmrc`、`package.json`、`pnpm-lock.yaml` 和 Docker Compose 镜像标签为准。

| 部分 | 技术 | 版本 |
| --- | --- | --- |
| 运行环境 | Node.js / pnpm | 22.23.3 / 12.9.1 |
| 前端 | Vue / Vue Router / Pinia | 3.5.43 / 5.3.1 / 4.0.3 |
| 前端构建 | Vite | 8.3.3 |
| 前端样式 | Less | 4.9.1 |
| API | NestJS (`@nestjs/core`) | 12.1.2 |
| 数据访问 | Prisma Client / PostgreSQL 适配器 | 7.10.0 / 7.10.0 |
| Redis 客户端 | ioredis | 6.0.0 |
| 语言 | TypeScript | 6.0.3 |
| 测试 | Vitest | 4.1.11 |
| 本地数据库 | PostgreSQL 镜像 | `18-alpine` |
| 本地 Redis | Redis 镜像 | `8-alpine` |

## 本地启动

需要 nvm、Docker 和 Docker Compose。项目使用 Node 22.23.3、pnpm 12.9.1。

首次运行，在项目根目录执行：

```bash
nvm use
corepack enable
[ -f apps/api/.env ] || cp apps/api/.env.example apps/api/.env
pnpm install
pnpm dev
```

以后只需在项目根目录运行 `pnpm dev`。它会启动 PostgreSQL 和 Redis、等待健康检查、执行数据库迁移，然后在当前终端同时运行 API 和前端。按 `Ctrl+C` 停止 API 和前端；数据库容器仍会运行，需要停止时执行 `pnpm docker:down`。

`pnpm install` 会生成 Prisma Client。首次迁移会删除旧 `Message` 表及其数据，若需保留请先备份。

前端地址以 Vite 输出为准，默认是 http://localhost:5173；API 默认是 http://localhost:3000/api，健康检查是 http://localhost:3000/api/health。前端开发服务器会将 `/api` 请求代理到 API。

## 注册与登录

访问 `/register` 注册提交员或审校员。注册成功后自动登录；已有账号可访问 `/login`。密码至少 8 个字符，服务器只保存 scrypt 哈希。登录会话保存在 Redis，浏览器使用 HttpOnly Cookie；`GET /api/auth/me` 恢复登录状态，`POST /api/auth/logout` 退出。管理员可登录，但注册接口拒绝管理员身份。

管理员账号只能从服务器命令行创建。先完成数据库迁移和 API 构建，再在 `apps/api` 工作目录设置 `DATABASE_URL`、`ADMIN_EMAIL` 和 `ADMIN_PASSWORD`，运行 `pnpm admin:create`。邮箱不能与现有账号重复。生产环境可在服务器执行：

```bash
cd /opt/onedep
read -r -p '管理员邮箱: ' ADMIN_EMAIL
read -r -s -p '管理员密码（至少 8 个字符）: ' ADMIN_PASSWORD
printf '\n'
export ADMIN_EMAIL ADMIN_PASSWORD
docker compose --env-file .env.production -f compose.production.yml \
  exec -e ADMIN_EMAIL -e ADMIN_PASSWORD api node dist/create-admin.js
unset ADMIN_EMAIL ADMIN_PASSWORD
```

密码不会写入命令历史。这个命令只用于首次创建管理员；若邮箱已存在会报错，不会提升已有账号权限。[Docker Compose 的 `exec -e` 参数说明](https://docs.docker.com/reference/cli/docker/compose/exec/)。

## 检查

```bash
pnpm build
pnpm lint
pnpm test
```

认证测试使用内存中的 PostgreSQL/Redis 替身，不会连接真实服务。`pnpm test:cov` 目前只统计 API 覆盖率。

## 目录与配置

- `apps/api/prisma/schema.prisma`：数据库模型；迁移提交在 `apps/api/prisma/migrations`。
- `apps/api/.env.example`：本地环境变量示例；复制后的 `.env` 不提交到 Git。
- `apps/web/src/views` 和 `apps/web/src/router`：页面与路由。
- `packages/shared`：前后端共用的用户与角色类型。

Docker Compose 中的数据库口令仅供本地开发。

## 生产部署

推送到 `main` 后，GitHub Actions 会为 `linux/amd64` 构建 API 和 Web 镜像，并发布到 GitHub Container Registry。生产 Compose 使用 `ghcr.io/bearxjj/onedep-api:main` 和 `ghcr.io/bearxjj/onedep-web:main`；数据库迁移复用 API 镜像，服务器不参与构建。

首次发布后，确认两个容器包允许服务器拉取：公开包可以直接拉取，私有包需要先在服务器登录 GHCR。生产数据库密码保存在服务器的 `.env.production`，不要提交到 Git。

在服务器更新代码中的 Compose 文件后，拉取并启动服务：

```bash
cd /opt/onedep
docker compose --env-file .env.production -f compose.production.yml pull
docker compose --env-file .env.production -f compose.production.yml up -d
docker compose --env-file .env.production -f compose.production.yml ps
```

PostgreSQL 和 Redis 的数据分别保存在 Compose 卷中。Web 只监听服务器本机的 `127.0.0.1:8080`，由 1Panel 网站反向代理并配置 HTTPS。

这次认证迁移会删除旧 `Message` 表及其留言数据。生产更新前先备份 PostgreSQL，再拉取新镜像并运行迁移。
