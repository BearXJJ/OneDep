// 此文件由 Prisma 生成，使用前需安装以下依赖：
// 安装命令：npm install --save-dev prisma dotenv
import "dotenv/config";
import { defineConfig } from "prisma/config";

if (!process.env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL is required');

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
