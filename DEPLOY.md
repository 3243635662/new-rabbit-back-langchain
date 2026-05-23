# 生产环境部署指南

## 一、服务器要求

| 项目 | 最低 | 推荐 |
|------|------|------|
| OS | Ubuntu 22.04 / CentOS 8 | Ubuntu 24.04 |
| CPU | 2 核 | 4 核+ |
| 内存 | 4 GB | 8 GB+ |
| 磁盘 | 20 GB | 50 GB SSD |

## 二、安装 Docker

```bash
# Ubuntu
curl -fsSL https://get.docker.com | bash
sudo usermod -aG docker $USER
newgrp docker

# 安装 docker-compose-plugin
sudo apt install docker-compose-v2 -y
```

## 三、项目文件准备

```bash
# 1. 克隆项目到服务器
git clone <仓库地址> /opt/new-rabbit-back
cd /opt/new-rabbit-back

# 2. 复制并修改生产环境变量
cp .env.production.example .env.production
vim .env.production   # 修改所有"替换为..."的占位值

# 3. 创建 nginx SSL 目录（有证书时）
mkdir -p nginx/ssl
# 将 fullchain.pem 和 privkey.pem 放入 nginx/ssl/
```

## 四、启动服务

```bash
# 构建并启动所有服务（首次运行可能需要 5-10 分钟）
docker compose up -d --build

# 查看运行状态
docker compose ps

# 查看应用日志
docker compose logs -f app

# 只在代码更新时重新构建 app
docker compose up -d --build app
```

## 五、验证部署

```bash
# 健康检查 — 通过 nginx 访问
curl http://localhost/api/health

# 或直连 NestJS 端口
curl http://localhost:3003/
```

## 六、启用 HTTPS（Let's Encrypt 免费证书）

```bash
# 安装 certbot
sudo apt install certbot -y

# 生成证书
sudo certbot certonly --standalone -d your-domain.com

# 复制到项目
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/

# 编辑 nginx/conf.d/default.conf，取消注释 HTTPS server 块
# 重启 nginx
docker compose restart nginx

# 设置自动续期 cron
echo "0 3 * * * certbot renew --quiet && docker compose restart nginx" | sudo crontab -
```

## 七、常用运维命令

```bash
# 查看所有容器状态
docker compose ps

# 查看某个服务日志
docker compose logs -f --tail=100 app
docker compose logs -f --tail=100 nginx

# 重启单个服务
docker compose restart app
docker compose restart nginx

# 进入容器调试
docker compose exec app sh
docker compose exec mysql mysql -u root -p

# 清理旧镜像释放空间
docker system prune -af

# 备份 MySQL 数据
docker compose exec mysql mysqldump -u root -p新密码 new-rabbit-back > backup.sql

# 恢复 MySQL 数据
docker compose exec -T mysql mysql -u root -p新密码 new-rabbit-back < backup.sql
```

## 八、目录结构

```
/opt/new-rabbit-back/
├── Dockerfile              # 应用镜像构建文件
├── .dockerignore           # 构建时排除的文件
├── docker-compose.yml      # 编排所有服务
├── .env.production         # 生产环境变量（不提交 Git）
├── nginx/
│   ├── nginx.conf          # nginx 主配置
│   ├── conf.d/
│   │   └── default.conf    # 站点配置（代理、SSL）
│   └── ssl/                # 证书目录（不提交 Git）
│       ├── fullchain.pem
│       └── privkey.pem
├── src/                    # 源码
├── package.json
└── ...
```

## 九、重要注意事项

1. **SSE 长连接**：Agent 对话使用 SSE 流式输出，nginx 配置中 `/agents/` 路径已关闭 proxy_buffering，不可删除
2. **Playwright**：Dockerfile 已安装 Chromium 依赖，用于 PDF 生成功能
3. **数据库密码**：第一次启动后 MySQL 密码固定，修改 `.env.production` 需要同步删除 mysql-data volume
4. **API Key 安全**：所有 LLM API Key 在 `.env.production` 中，不要提交到 Git
5. **内存占用**：6 个容器（app + mysql + redis + postgres + chroma + nginx），总占用约 2-3GB，建议服务器 4GB+
