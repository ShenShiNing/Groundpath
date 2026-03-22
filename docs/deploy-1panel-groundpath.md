# Groundpath 生产部署（1Panel + OpenResty）

本文档对应：

- 域名：`groundpath.one`
- 服务器：`106.52.204.171`
- 入口层：`1Panel + OpenResty`
- 应用编排：`docker compose`

## 目录准备

建议在服务器上使用单独目录：

```bash
sudo mkdir -p /opt/apps/groundpath
sudo chown -R $USER:$USER /opt/apps/groundpath
cd /opt/apps/groundpath
```

## DNS 准备

在域名解析后台新增：

- `A` 记录：`groundpath.one` -> `106.52.204.171`
- `CNAME` 记录：`www.groundpath.one` -> `groundpath.one`

## 文件准备

把仓库部署到服务器后，准备生产环境文件：

```bash
cp .env.production.example .env.production
```

按实际情况修改这些关键值：

- `MYSQL_ROOT_PASSWORD`
- `MYSQL_PASSWORD`
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `EMAIL_VERIFICATION_SECRET`
- `EMBEDDING_PROVIDER` 及对应 API Key
- `SMTP_*`（如果要用邮箱验证码）
- `GITHUB_*` / `GOOGLE_*`（如果要启用 OAuth）

## 首次上线命令清单

如果服务器还没有仓库代码：

```bash
cd /opt/apps
git clone <你的仓库地址> groundpath
cd /opt/apps/groundpath
cp .env.production.example .env.production
vim .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:18080/health/ready
```

如果服务器上已经有代码，只做更新：

```bash
cd /opt/apps/groundpath
git pull --ff-only
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:18080/health/ready
```

预期结果：

- `client` 对外仅监听 `127.0.0.1:18080`
- `server`、`mysql`、`redis`、`qdrant` 只在容器网络内通信
- `migrate` 先执行数据库迁移，成功后才会启动 `server`

## 1Panel 反向代理配置

最省事的方式是在 1Panel 中新建一个站点：

- 域名：`groundpath.one`
- 代理目标：`http://127.0.0.1:18080`
- 证书：给 `groundpath.one` 和 `www.groundpath.one` 签发同一张证书

如果 1Panel 的站点支持“代理参数”或“附加配置”，确保反代位置包含这些参数：

```nginx
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_buffering off;
proxy_read_timeout 300s;
proxy_send_timeout 300s;
client_max_body_size 100m;
```

如果你更习惯直接改 OpenResty 配置，可参考：

- [`deploy/groundpath.one.openresty.conf`](../deploy/groundpath.one.openresty.conf)

`www.groundpath.one` 建议直接 301 跳到 `https://groundpath.one`。

## 上线后检查

按顺序验证：

1. `https://groundpath.one/health/ready`
2. `https://groundpath.one/api-docs`
3. 首页能正常打开
4. 注册 / 登录流程正常
5. 文档上传可用
6. SSE 聊天流式输出正常

## 与 blog 共存

因为 blog 使用不同域名，推荐保持完全独立：

- Groundpath：`groundpath.one` -> `127.0.0.1:18080`
- Blog：`blog 域名` -> 另一个本机端口，例如 `127.0.0.1:18081`

不要把 Groundpath 和 blog 放进同一个 compose 项目里。

## 后续运维建议

- 首次可用 `STORAGE_TYPE=local`，稳定后再切到 `r2`
- 只开放公网端口 `22`、`80`、`443`
- MySQL、Qdrant、上传文件卷要定期备份
- 发布时优先使用固定版本或固定 commit，而不是长期追 `latest`
