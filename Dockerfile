FROM node:22-alpine

# Playwright 浏览器依赖（PDF/截图）
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

EXPOSE 3003

CMD ["node", "dist/main.js"]
