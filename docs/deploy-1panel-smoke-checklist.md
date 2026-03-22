# Groundpath 生产首次上线 Smoke Checklist

本文档用于 `groundpath.one` 第一次正式上线后的快速验收。

## 目标

在 30 分钟内确认四件事：

1. 入口层可用
2. 应用核心路径可用
3. 文档处理链路可用
4. 出现问题时可以快速定位

## A. 基础设施检查

### 1. 编排状态

执行：

```bash
cd /opt/apps/groundpath
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

通过标准：

- `mysql`、`redis`、`qdrant`、`server`、`client` 为 `Up`
- `migrate` 为成功退出，不应反复重启

失败时优先看：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs migrate --tail=100
docker compose --env-file .env.production -f docker-compose.prod.yml logs server --tail=100
```

### 2. 本机入口

执行：

```bash
curl -fsS http://127.0.0.1:18080/health/ready
```

通过标准：

- 返回 JSON
- `status` 为 `ready`

### 3. 公网域名与跳转

执行：

```bash
curl -I http://groundpath.one
curl -I https://groundpath.one
curl -I https://www.groundpath.one
```

通过标准：

- `http://groundpath.one` 返回 `301` 或 `308` 到 `https://groundpath.one`
- `https://groundpath.one` 返回 `200`
- `https://www.groundpath.one` 返回 `301` 或 `308` 到 `https://groundpath.one`

### 4. 证书

浏览器检查：

- 证书域名覆盖 `groundpath.one`
- 证书域名覆盖 `www.groundpath.one`
- 无证书错误、无混合内容警告

## B. 应用基础路径检查

### 5. 首页与静态资源

浏览器打开：

- `https://groundpath.one`

通过标准：

- 首页正常渲染
- 控制台没有明显 `404` / `500`
- 没有 `/assets/*` 加载失败

### 6. API 文档

浏览器打开：

- `https://groundpath.one/api-docs`

通过标准：

- Swagger 页面可打开
- 页面不是空白

### 7. 健康检查

浏览器或命令执行：

```bash
curl -fsS https://groundpath.one/health/ready
curl -fsS https://groundpath.one/health/live
```

通过标准：

- 两个接口都返回 `200`

## C. 认证与会话检查

### 8. 注册 / 登录

操作：

1. 注册一个新账号，或用已有测试账号登录
2. 刷新页面
3. 退出登录，再重新登录

通过标准：

- 登录后页面状态正确
- 刷新页面后仍保持已登录
- 退出后会话被清理

失败时重点排查：

- `FRONTEND_URL`
- `TRUST_PROXY`
- `AUTH_COOKIE_SAMESITE`
- 反代是否正确传了 `X-Forwarded-Proto`

### 9. OAuth 回调

如果启用了 GitHub / Google 登录，再做一次：

- GitHub 登录回调
- Google 登录回调

通过标准：

- 可以正常返回前端
- 没有回调地址不匹配

## D. 文档与 RAG 链路检查

### 10. 上传文档

准备一个小文件：

- `txt` 或 `md`
- 内容 1 KB 到 50 KB

操作：

1. 新建知识库
2. 上传文件
3. 等待处理完成

通过标准：

- 上传成功
- 文档状态从处理中变为可用
- 页面无永久 loading

失败时查看：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs server --tail=200
```

### 11. 文档下载 / 预览

操作：

1. 打开文档详情
2. 下载原文件

通过标准：

- 预览页可打开
- 下载 URL 可用
- 文件名和内容正确

### 12. 向量化与问答

操作：

1. 针对刚上传的文档提一个能从文档里直接回答的问题
2. 检查回答是否带来源引用

通过标准：

- 聊天可以正常返回
- 引用不是空的
- 能明显看出检索到了刚上传的内容

## E. 流式与长连接检查

### 13. SSE 流式聊天

操作：

1. 发起一个稍长一点的问题
2. 观察回答是否逐步输出

通过标准：

- 回答是流式出现，而不是长时间无响应后一次性返回

失败时重点排查：

- OpenResty / 1Panel 是否开启了缓冲
- `proxy_buffering off;` 是否生效
- `proxy_read_timeout 300s;` 是否已配置

## F. 数据持久化检查

### 14. 重启后数据是否仍在

执行：

```bash
cd /opt/apps/groundpath
docker compose --env-file .env.production -f docker-compose.prod.yml restart client server
```

重启后检查：

- 账号仍可登录
- 已上传文档仍存在
- 历史知识库仍存在

### 15. 卷检查

执行：

```bash
docker volume ls | grep groundpath-prod
```

通过标准：

- 至少能看到：
  - `groundpath-prod_mysql-data`
  - `groundpath-prod_redis-data`
  - `groundpath-prod_qdrant-data`
  - `groundpath-prod_uploads-data`

## G. 上线后 24 小时观察项

上线当天和次日，重点看：

- `server` 是否重启过
- `migrate` 是否异常重复运行
- 上传是否出现失败重试
- SSE 聊天是否偶发断流
- 证书是否已绑定成功

建议查看：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs server --since=24h
docker compose --env-file .env.production -f docker-compose.prod.yml logs client --since=24h
```

## H. 失败时的最小回滚动作

如果上线后出现明显故障，先做最小止血：

1. 先不要删数据卷
2. 保留 `.env.production`
3. 回退到上一个可用 commit
4. 重新执行：

```bash
cd /opt/apps/groundpath
git checkout <上一个可用提交>
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

不要执行：

- `docker compose down -v`
- 删除 MySQL / Qdrant 卷
- 在未备份前直接清空上传目录
