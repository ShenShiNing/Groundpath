# main 分支自动重新部署指南

目标:

- `main` 每次推送到 GitHub 后自动重新部署
- 新版本未通过健康检查前不切流
- 切流后等待旧连接排空，再下线旧版本

当前仓库已经有 `.github/workflows/docker-publish.yml`，会在 `main` push 后构建并推送 GHCR 镜像。这里补的是后半段: 生产机自动拉起新版本、健康检查、切流和回收旧版本。

## 推荐拓扑

单机最稳的做法不是直接在生产机上执行 `docker compose up -d --build` 覆盖当前容器，而是:

1. GitHub Actions 构建并推送 `server` / `client` 镜像到 GHCR
2. 生产机常驻一套共享基础设施: `mysql` / `redis` / `qdrant`
3. 应用层保留两套颜色: `blue` 和 `green`
4. OpenResty 固定对外提供 `443`
5. 每次部署都先把“非活动颜色”拉起来，健康检查通过后仅 reload OpenResty 切流
6. 等旧颜色连接排空后，再停止旧颜色

这样失败只会失败在备用颜色，不会直接影响当前在线版本。

## 仓库内新增内容

- `.github/workflows/docker-publish.yml`
  现在除了 `latest` / `main` / `sha-*`，还会额外推送 `git-<full_sha>` 标签，便于精确部署与回滚。
- `.github/workflows/deploy-main.yml`
  自动部署工作流。支持两种触发:
  - `CD` 工作流成功后自动部署 `git-<head_sha>`
  - 手动 `workflow_dispatch` 指定 `image_tag` 做回滚
- `deploy/blue-green/compose.infra.yml`
  生产共享基础设施编排
- `deploy/blue-green/compose.app.yml`
  蓝绿应用编排
- `deploy/blue-green/deploy.sh`
  服务器侧部署脚本
- `.env.example`
  仓库根目录统一配置样例，开发 / Compose / 蓝绿部署共用
- `deploy/blue-green/groundpath-active.inc.example`
  OpenResty 当前活动 upstream include 样例

## GitHub Secrets

至少需要下面这些 Secrets:

- `DEPLOY_HOST`: 生产机 IP 或域名
- `DEPLOY_PORT`: SSH 端口，默认 `22`
- `DEPLOY_USER`: 部署用户
- `DEPLOY_SSH_PRIVATE_KEY`: GitHub Actions 登录生产机用的私钥
- `DEPLOY_PATH`: 生产机上的仓库路径，例如 `/opt/groundpath`

如果 GHCR 包是私有的，还需要:

- `GHCR_READ_USERNAME`
- `GHCR_READ_TOKEN`

说明:

- `Deploy Main` job 绑定了 `environment: production`
- 如果你使用 environment secrets，请在 `Settings -> Environments -> production -> Secrets and variables -> Actions` 中配置
- 如果你使用 repository secrets，也可以直接在仓库 `Settings -> Secrets and variables -> Actions` 中配置
- 工作流现在会在 SSH 之前先做预检；缺少 `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_PATH` / `DEPLOY_SSH_PRIVATE_KEY` 时，会直接列出缺失项
- `GHCR_READ_USERNAME` 和 `GHCR_READ_TOKEN` 需要成对配置；若镜像公开，可以两者都不填
- 生产机自身也必须能 `git fetch` / `git pull` 这个仓库
- 如果仓库是私有的，给生产机配置只读 deploy key 或只读 PAT

## 生产机初始化

以下步骤只做一次。

### 1. 准备仓库和运行时配置

```bash
git clone <your-repo> /opt/groundpath
cd /opt/groundpath
cp .env.example .env.production
```

然后编辑根目录 `.env.production`，至少填这些值:

- `GHCR_NAMESPACE`
- `GHCR_REPOSITORY`
- `FRONTEND_URL`
- `MYSQL_ROOT_PASSWORD`
- `MYSQL_PASSWORD`
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `EMAIL_VERIFICATION_SECRET`

如果你启用了 Hysteria sidecar:

```bash
cp deploy/hysteria/client.yaml.example deploy/hysteria/client.yaml
```

并把根目录 `.env.production` 里的 `ENABLE_HYSTERIA_PROXY=true`。

### 2. 配置 OpenResty 蓝绿切换点

仓库里的 [deploy/groundpath.one.openresty.conf](../deploy/groundpath.one.openresty.conf) 已经改成通过 include 文件决定当前 upstream。

先创建 include 文件:

```bash
mkdir -p /www/sites/groundpath.one/proxy
cp deploy/blue-green/groundpath-active.inc.example /www/sites/groundpath.one/proxy/groundpath-active.inc
```

然后把站点配置中的反向代理目标改成:

```nginx
set $groundpath_client_upstream http://127.0.0.1:18081;
include /www/sites/groundpath.one/proxy/groundpath-active.inc;

location / {
  proxy_pass $groundpath_client_upstream;
  ...
}
```

部署脚本每次切流时都会重写 `groundpath-active.inc`，然后执行 `OPENRESTY_RELOAD_COMMAND`。

部署脚本默认按以下顺序读取仓库根目录环境文件:

1. `.env.production.local`
2. `.env.production`
3. `.env`

### 3. 首次引导基础设施

```bash
cd /opt/groundpath
DEPLOY_IMAGE_TAG=git-<current_main_sha> bash deploy/blue-green/deploy.sh
```

第一次执行时:

- 默认先部署 `blue`
- 创建共享基础设施
- 拉起 `groundpath-blue`
- 健康检查通过后把 OpenResty 指向 `18081`

## 自动部署流程

`main` push 后，实际流程是:

1. `docker-publish.yml` 构建并推送
   - `ghcr.io/<owner>/<repo>-server:git-<sha>`
   - `ghcr.io/<owner>/<repo>-client:git-<sha>`
2. `deploy-main.yml` 通过 SSH 登录生产机
3. 生产机 `git pull` 到最新 `main`
4. `deploy.sh` 选择当前活动颜色的反色作为目标颜色
5. 拉取目标颜色镜像
6. 先执行数据库迁移
7. 启动目标颜色 `server` / `client`
8. 检查 `http://127.0.0.1:<blue|green_port>/health/ready`
9. 成功后 rewrite OpenResty include 并 reload
10. 等待旧颜色连接排空
11. 关闭旧颜色

如果第 5-8 步失败:

- OpenResty 不会切流
- 旧颜色继续提供服务

## 回滚

回滚时，不要在服务器上手工改容器；直接手动触发 `Deploy Main` 工作流，填入之前的 `image_tag` 即可，例如:

```text
git-4b74c768e0d6fdbf5af7c0e9f3a1f87f7c0b1234
```

这样会继续走同一套蓝绿流程:

- 旧在线颜色保持服务
- 目标颜色拉起历史镜像
- 健康后切流

## 为什么这套方案比直接 `docker compose up -d` 更稳

直接覆盖更新的问题是:

- 新容器还没 ready 就把旧容器停掉了
- 前端 `client` 容器重启时会直接断流
- 失败后没有清晰回滚点

蓝绿方案的关键优势是:

- 切流动作和启动动作分离
- 健康检查失败不会影响线上
- 回滚只是重新部署上一个镜像标签
- OpenResty reload 是平滑的，不会硬断已有连接

## 零停机前提

这套方案能做到“基本无感”切换，但有 3 个前提必须满足:

1. 数据库迁移必须保持前后版本短时兼容
   - 也就是先做 additive / backward-compatible migration
   - 不要把删列、改语义这类破坏性变更和应用切换放在同一时刻
2. 旧颜色在 drain 窗口内仍会短暂存活
   - 当前仓库的后台任务、计数器、向量任务设计本来就要求幂等
   - 如果未来新增非幂等 cron / worker，这一点要额外审查
3. `OLD_STACK_DRAIN_TIMEOUT_SECONDS` 要和你的长连接时长匹配
   - 如果 SSE 对话通常持续 2-3 分钟，建议至少设成 `300`

## 常见调整点

- 想改颜色端口:
  改 `BLUE_CLIENT_PORT` / `GREEN_CLIENT_PORT`
- 想改 OpenResty include 路径:
  改 `OPENRESTY_INCLUDE_PATH`
- OpenResty 跑在容器里, upstream 不能写 `127.0.0.1`:
  设置 `CLIENT_HOST_BIND=0.0.0.0`，并在根目录 `.env.production` 里设置 `OPENRESTY_UPSTREAM_HOST` 为容器可访问到的宿主机地址
- OpenResty reload 需要 sudo:
  把 `OPENRESTY_RELOAD_COMMAND` 改成例如 `sudo openresty -s reload`
- GHCR 镜像名不按默认规则:
  在根目录 `.env.production` 中设置 `SERVER_IMAGE_REPOSITORY` / `CLIENT_IMAGE_REPOSITORY`

## 不建议的方案

不建议直接上这些做法替代蓝绿:

- `watchtower` 直接监听镜像自动重启
  它擅长“自动更新”，不擅长“健康后切流”
- 单机 `docker compose up -d --build`
  它更像“原地替换”，不是“无损切换”
- 把数据库和应用都做成蓝绿
  对单机部署来说复杂度过高，收益不成比例

如果以后服务规模继续扩大，再升级到 Kubernetes / Nomad / Swarm 的滚动发布会更合适；但对当前这个仓库，单机 OpenResty + Docker Compose 的蓝绿切换已经是成本和稳定性的平衡点。
