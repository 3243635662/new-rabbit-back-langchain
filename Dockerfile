# ─── Stage 1: 安装依赖 + 编译 ───
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存层
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch --prod=false

COPY . .
RUN pnpm install --offline --prod=false
RUN pnpm build

# ─── Stage 2: 生产运行镜像 ───
FROM node:22-alpine AS runner

# Playwright 浏览器依赖（用于 PDF/截图）
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PLAYWRIGHT_BROWSERS_PATH=/usr/lib/chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 只复制生产依赖和编译产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

EXPOSE 3003

CMD ["pnpm", "start:prod"]
