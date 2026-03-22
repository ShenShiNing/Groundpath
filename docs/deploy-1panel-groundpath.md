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

## 1Panel 导入 Compose 步骤

推荐方式是先把仓库代码放到服务器目录，再让 1Panel 从磁盘路径导入 Compose。

### 方式 A：推荐，按路径导入

1. 在服务器上准备目录和代码：

```bash
cd /opt/apps
git clone <你的仓库地址> groundpath
cd /opt/apps/groundpath
cp .env.production.example .env.production
vim .env.production
```

2. 登录 1Panel，进入 `容器` -> `编排`。
3. 点击 `创建编排`。
4. 选择 `路径选择` 或等价入口。
5. 如果界面要求填写信息，使用：
   - 名称：`groundpath-prod`
   - Compose 文件：`/opt/apps/groundpath/docker-compose.prod.yml`
   - 工作目录：`/opt/apps/groundpath`
6. 确认后保存。
7. 在编排详情页点击 `启动` 或 `构建并启动`。
8. 等待 1Panel 拉起 `mysql`、`redis`、`qdrant`、`migrate`、`server`、`client`。

### 方式 B：备选，直接粘贴 Compose

如果你的 1Panel 版本没有“路径选择”，可以：

1. 进入 `容器` -> `编排` -> `创建编排`。
2. 选择 `编辑` 或等价入口。
3. 把 [`docker-compose.prod.yml`](../docker-compose.prod.yml) 内容完整粘贴进去。
4. 名称填 `groundpath-prod`。
5. 确保工作目录仍然指向 `/opt/apps/groundpath`，因为：
   - `Dockerfile.client`
   - `Dockerfile.server`
   - `.env.production`
     都依赖仓库目录的相对路径。
6. 保存并启动。

### 导入后的立即检查

在 1Panel 的编排详情页，确认：

- `migrate` 运行完成后退出，状态应为成功退出
- `server` 状态为运行中
- `client` 状态为运行中
- `mysql`、`redis` 至少通过健康检查或保持稳定运行

如果 `migrate` 持续失败，先看它的容器日志，最常见原因是：

- `.env.production` 缺少密钥
- `MYSQL_PASSWORD` / `MYSQL_ROOT_PASSWORD` 配置错误
- 服务器上已有旧数据卷，库结构与当前代码不兼容

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

## 1Panel 网站与反向代理配置

建议先只为主域名创建一个站点：

- 域名：`groundpath.one`
- 代理目标：`http://127.0.0.1:18080`

具体步骤：

1. 进入 1Panel `网站`。
2. 点击 `创建网站`。
3. 类型选择 `反向代理`。
4. 主域名填 `groundpath.one`。
5. 代理地址填 `http://127.0.0.1:18080`。
6. 保存站点。

保存后，进入该站点，把反向代理参数调成下面这一组。

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

这些配置的作用分别是：

- `proxy_buffering off;`：避免 SSE 流式聊天被缓冲
- `proxy_read_timeout 300s;`：避免长对话或长文档处理超时
- `client_max_body_size 100m;`：允许文档上传

## 证书申请与 HTTPS 配置

### 证书申请

推荐给 `groundpath.one` 和 `www.groundpath.one` 一次性签同一张证书。

1. 进入 1Panel `网站` -> `证书`。
2. 先创建或选择一个 ACME 账号。
3. 点击 `申请证书`。
4. 域名填：

```text
groundpath.one
www.groundpath.one
```

5. 校验方式选择：
   - 如果 `groundpath.one` 和 `www.groundpath.one` 都已经解析到 `106.52.204.171`，且 `80` 端口可用，优先选 `HTTP` 校验。
   - 如果你后面把域名放到 CDN 或代理后面，再改用 `DNS` 校验。
6. 打开自动续期。
7. 申请成功后，把该证书绑定到 `groundpath.one` 站点。

### HTTPS 开关建议

在 `groundpath.one` 站点里建议这样设置：

- 开启 HTTPS
- 开启 `HTTP 自动跳转 HTTPS`
- 首次上线当天先不要开 HSTS
- 等确认 HTTPS、重定向、证书续期都稳定后，再考虑开启 HSTS

## `www` 跳转到主域名的具体配置

最稳妥的方式是单独给 `www.groundpath.one` 建一个跳转站点，而不是让它继续反代到应用。

### 方式 A：推荐，单独建 `www` 站点做 301 跳转

1. 再创建一个站点，域名填 `www.groundpath.one`。
2. 绑定和主站相同的证书。
3. 在该站点配置文件里使用下面的最小配置：

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name www.groundpath.one;

    ssl_certificate /www/sites/www.groundpath.one/ssl/fullchain.pem;
    ssl_certificate_key /www/sites/www.groundpath.one/ssl/privkey.pem;

    return 301 https://groundpath.one$request_uri;
}
```

如果你的 1Panel 证书实际路径不是上面的目录，以站点里自动生成的路径为准。

### 方式 B：直接使用仓库内的 OpenResty 模板

如果你更习惯直接改 OpenResty 配置，可参考：

- [`deploy/groundpath.one.openresty.conf`](../deploy/groundpath.one.openresty.conf)

这个模板已经包含：

- `groundpath.one` -> `127.0.0.1:18080`
- `www.groundpath.one` -> `301 https://groundpath.one$request_uri`
- `80` -> `443` 跳转

## 上线后建议执行的最小命令检查

在服务器上至少跑一遍：

```bash
docker compose --env-file .env.production -f /opt/apps/groundpath/docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:18080/health/ready
curl -I http://groundpath.one
curl -I https://groundpath.one
curl -I https://www.groundpath.one
```

期望结果：

- 本地健康检查返回 `200`
- `http://groundpath.one` 跳到 `https://groundpath.one`
- `https://www.groundpath.one` 跳到 `https://groundpath.one`
- 最终页面由 `groundpath.one` 提供服务

## 上线后检查

详细清单见：

- [deploy-1panel-smoke-checklist.md](./deploy-1panel-smoke-checklist.md)

最小验证顺序：

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

## 参考文档

- 1Panel 编排管理：<https://1panel.cn/docs/v2/user_manual/containers/compose/>
- 1Panel 创建网站：<https://1panel.cn/docs/v2/user_manual/websites/website_create/>
- 1Panel 网站基础设置：<https://1panel.cn/docs/v2/user_manual/websites/website_setting/>
- 1Panel 申请证书：<https://1panel.cn/docs/v2/user_manual/websites/certificate_create/>
