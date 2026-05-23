# 宝塔面板部署指南

## 一、代码上传服务器（选一种）

### 方式 A：Git 拉取（推荐，后续更新方便）

先在 GitHub / Gitee 建一个私有仓库，把代码推上去，服务器拉下来。

```bash
# 本地（你的 Windows 开发机）
git remote add origin https://github.com/你的用户名/new-rabbit-back.git
# 注意：.env 不要提交！.env.production 改为 .env.production.example 提交，真密码留在本地
git add .
git commit -m "init"
git push -u origin main
```

```bash
# 服务器上
cd /www/wwwroot
git clone https://github.com/你的用户名/new-rabbit-back.git
cd new-rabbit-back
```

### 方式 B：直接上传（简单粗暴）

1. 本地把项目打包成 zip（去掉 `node_modules` 和 `dist`）
2. 宝塔 → 文件 → `/www/wwwroot/` → 上传 zip → 解压

---

## 二、服务器环境搭建

### 2.1 宝塔软件商店装这些

| 软件 | 版本 |
|------|------|
| MySQL | 8.0 |
| Redis | 7.x |
| Nginx | 1.24+ |
| PM2 管理器 | 最新 |
| Node.js 版本管理器 | 装 Node 22 |

### 2.2 Docker（跑 PostgreSQL + ChromaDB）

```bash
# 宝塔软件商店搜 Docker 管理器安装
# 或者：
curl -fsSL https://get.docker.com | bash
systemctl enable docker --now
```

### 2.3 启动 PostgreSQL + ChromaDB

```bash
# 创建数据目录
mkdir -p /data/postgres /data/chroma

# 写入 docker-compose.yml
cd /www/wwwroot/new-rabbit-back
cat > docker-compose.yml << 'EOF'
version: "3.8"
services:
  postgres:
    image: postgres:16-alpine
    container_name: postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: 设个强密码
      POSTGRES_DB: langgraph
    ports:
      - "5432:5432"
    volumes:
      - /data/postgres:/var/lib/postgresql/data

  chroma:
    image: chromadb/chroma:latest
    container_name: chroma
    restart: unless-stopped
    ports:
      - "8000:8000"
    volumes:
      - /data/chroma:/chroma/chroma
EOF

docker compose up -d
docker compose ps   # 确认两个都在 running
```

### 2.4 MySQL 建库

宝塔 → 数据库 → 添加数据库：
- 数据库名：`new-rabbit-back`
- 用户名：`newrabbit`（或直接用 root）
- 密码：自己设一个
- 字符集：`utf8mb4`

把本地的 MySQL 数据导出导入：
```bash
# 本地导出
mysqldump -u root -p123456 new-rabbit-back > backup.sql

# 上传到服务器后导入
mysql -u newrabbit -p新的密码 new-rabbit-back < backup.sql
```

### 2.5 配置环境变量 `.env`

```bash
cd /www/wwwroot/new-rabbit-back
vim .env
```

内容（修改所有密码为实际值）：

```env
PORT=3003

# MySQL
MYSQL_USER=root（或上面的 newrabbit）
MYSQL_PASSWORD=你设的密码
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=new-rabbit-back

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# JWT
TOKEN_SECRET_KEY=随便32位随机字符串
APIKEY=随便32位随机字符串
SALTROUNDS=10

# Snowflake
SNOWFLAKE_WORKER_ID=1
SNOWFLAKE_CENTER_ID=1
SNOWFLAKE_EPOCH=1704067200000
SNOWFLAKE_STRING_MODE=true

# LangGraph
USE_LANGGRAPH=true
LANGGRAPH_RECURSION_LIMIT=8
AGENT_MAX_STEPS=3
LANGGRAPH_POSTGRES_URL=postgresql://postgres:设的PG密码@127.0.0.1:5432/langgraph

# ChromaDB
CHROMA_URL=http://127.0.0.1:8000
CHROMA_COLLECTION=ecommerce_knowledge_base

# LLM API Key（替换成你自己的）
GLM_DASHSCOPE_API_KEY=你的智谱Key
GLM_DASHSCOPE_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
MODEL_NAME=glm-4.5-air

QINIU_DASHSCOPE_API_KEY=你的七牛Key
QINIU_DASHSCOPE_BASE_URL=https://api.qnaigc.com/v1

ALI_DASHSCOPE_API_KEY=你的阿里Key
ALI_DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
REPORT_MODEL_NAME=deepseek-v4-pro

BAISHAN_DASHSCOPE_API_KEY=你的白山Key
BAISHAN_DASHSCOPE_BASE_URL=https://api.edgefn.net/v1

HUGGINGFACE_DASHSCOPE_API_KEY=你的HF Key
HUGGINGFACE_DASHSCOPE_BASE_URL=https://router.huggingface.co/v1
VISION_MODEL_NAME=qwen/qwen3.5-35b-a3b

RERANK_SCORE_THRESHOLD=0.5

# 七牛云
QINIU_ACCESS_KEY=你的七牛AK
QINIU_SECRET_KEY=你的七牛SK
QINIU_BUCKET=new-rabbit-back
QINIU_DOMAIN=http://rabbit.fanblog.top

# 邮箱
SMTP_HOST=smtp.yeah.net
SMTP_PORT=465
EMAIL_ACCOUNT=fanfan0521@yeah.net
EMAIL_key=你的邮箱授权码
EMAIL_SECURE=true
```

---

## 三、安装依赖 & 编译启动

```bash
cd /www/wwwroot/new-rabbit-back

# 装 pnpm
npm i -g pnpm

# 安装依赖
pnpm install

# 编译
pnpm build
```

---

## 四、PM2 启动

### 方式 A：宝塔 PM2 管理器界面操作

1. 宝塔 → 软件商店 → PM2 管理器 → 设置 → 添加项目
2. 填写：

| 字段 | 值 |
|------|-----|
| 启动文件 | `/www/wwwroot/new-rabbit-back/dist/main.js` |
| 项目名称 | `new-rabbit-back` |
| 运行目录 | `/www/wwwroot/new-rabbit-back` |

3. 保存 → 映射（端口 3003）→ 启动

### 方式 B：命令行

```bash
pm2 start dist/main.js --name new-rabbit-back
pm2 save
pm2 startup   # 设置开机自启，复制输出的命令执行
```

---

## 五、Nginx 反向代理

宝塔 → 网站 → 添加站点 → 域名填你的域名 → 确定。

然后点"设置" → "配置文件"，替换为：

```nginx
server {
    listen 80;
    server_name 你的域名.com;

    # SSE 流式对话 — 必须关缓冲！
    location /agents/ {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # 普通接口
    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
    }
}
```

之后在宝塔面板点 SSL → Let's Encrypt → 申请证书 → 勾选强制 HTTPS。

---

## 六、验证

```bash
# 直连测试
curl http://127.0.0.1:3003/

# 通过 nginx 测试
curl http://你的域名.com/

# 看进程
pm2 list

# 看日志
pm2 logs new-rabbit-back
```

---

## 七、后续更新代码

```bash
cd /www/wwwroot/new-rabbit-back

# Git 拉取
git pull

# 如果有新依赖
pnpm install

# 重新编译
pnpm build

# 重启
pm2 restart new-rabbit-back
```

---

## 八、防火墙 & 安全组

确保这些端口开放：

| 端口 | 用途 | 公开？ |
|------|------|--------|
| 80/443 | HTTP/HTTPS | 是（云服务器安全组放开） |
| 3003 | PM2 直接端口 | 否（仅 127.0.0.1） |
| 3306 | MySQL | 否 |
| 6379 | Redis | 否 |
| 5432 | PostgreSQL | 否 |
| 8000 | ChromaDB | 否 |

宝塔 → 安全 → 防火墙，确认 80 和 443 放行。其余端口不需要放行。

---

## 九、常见问题

**Q: PM2 启动报错 connect ECONNREFUSED**
A: 检查 MySQL/Redis/Docker 是否全在运行：`docker compose ps` + `systemctl status redis`

**Q: Agent 对话卡住不动**
A: nginx `/agents/` 路径的 `proxy_buffering off` 是否配了？没配的话流式输出会被缓冲。

**Q: 端口冲突**
A: `lsof -i:3003` 看谁占了，`kill` 掉或换端口。

**Q: Playwright 报错找不到浏览器**
A: 服务器上装依赖：
```bash
npx playwright install-deps chromium
npx playwright install chromium
```
