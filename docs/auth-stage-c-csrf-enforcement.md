# 阶段 C 实施记录：CSRF 显式防护强制启用

## 1. 目标

- 为 Cookie 鉴权写操作接口强制启用显式 CSRF 防护
- 对关键接口强制校验 `Origin/Referer`
- 强制双提交 Token：`X-CSRF-Token` + `csrf_token` cookie

## 2. 依赖变更

- 无新增三方依赖
- 复用现有 `cookie-parser` 与安全中间件体系

## 3. 核心改造

## 3.1 服务端新增 CSRF 防护中间件

文件：`packages/server/src/shared/middleware/security.middleware.ts`

- 新增 `requireCsrfProtection`
- 强制校验来源：
  - 优先检查 `Origin`
  - `Origin` 缺失时回退检查 `Referer` 的 origin
  - 来源不在允许列表时拒绝（403）
- 强制双提交 Token 校验：
  - 读取请求头 `X-CSRF-Token`
  - 读取 cookie `csrf_token`
  - 使用常量时间比较校验一致性，不一致直接拒绝（403）
- CORS `allowedHeaders` 增加 `X-CSRF-Token`

## 3.2 认证 cookie 策略扩展

文件：`packages/server/src/shared/utils/cookie.utils.ts`

- 新增 `csrf_token` cookie（非 HttpOnly，路径 `/api/auth`）
- `setRefreshTokenCookie` 调整为同时下发：
  - `refresh_token`（HttpOnly）
  - `csrf_token`（用于双提交）
- `clearRefreshTokenCookie` 调整为同时清理两个 cookie
- 新增导出：
  - `CSRF_TOKEN_COOKIE_NAME`
  - `REFRESH_TOKEN_COOKIE_NAME`
  - `getCsrfTokenFromRequest(req)`

## 3.3 路由强制挂载阶段 C 中间件

文件：`packages/server/src/modules/auth/auth.routes.ts`

- `POST /api/auth/refresh` 新增 `requireCsrfProtection`
- `POST /api/auth/logout` 新增 `requireCsrfProtection`

文件：`packages/server/src/modules/auth/oauth/oauth.routes.ts`

- `POST /api/auth/oauth/exchange` 新增 `requireCsrfProtection`

文件：`packages/server/src/shared/middleware/index.ts`

- 导出 `requireCsrfProtection`

## 3.4 客户端自动附加 CSRF 请求头

文件：`packages/client/src/lib/http/headers.ts`

- 新增 `getCsrfTokenFromCookie()`
- `buildHeaders` 支持 `includeCsrfToken` 选项

文件：`packages/client/src/lib/http/auth.ts`

- `POST /api/auth/refresh` 的 fetch 请求启用 `includeCsrfToken`

文件：`packages/client/src/lib/http/api-client.ts`

- 请求拦截器对以下接口自动附加 `X-CSRF-Token`：
  - `/api/auth/refresh`
  - `/api/auth/logout`
  - `/api/auth/oauth/exchange`

## 4. 受影响文件清单

- `packages/server/src/shared/middleware/security.middleware.ts`
- `packages/server/src/shared/middleware/index.ts`
- `packages/server/src/shared/utils/cookie.utils.ts`
- `packages/server/src/shared/utils/index.ts`
- `packages/server/src/modules/auth/auth.routes.ts`
- `packages/server/src/modules/auth/oauth/oauth.routes.ts`
- `packages/client/src/lib/http/headers.ts`
- `packages/client/src/lib/http/auth.ts`
- `packages/client/src/lib/http/api-client.ts`
- `packages/server/tests/shared/utils/cookie.utils.test.ts`
- `packages/server/tests/shared/middleware/security.middleware.test.ts`

## 5. 验证建议

1. 运行测试：`pnpm -F @knowledge-agent/server test -- tests/shared/utils/cookie.utils.test.ts tests/shared/middleware/security.middleware.test.ts`
2. 启动前后端后进行手工验证：
   - 正常浏览器流量可成功 `refresh/logout/oauth exchange`
   - 去掉 `X-CSRF-Token` 后上述接口返回 403
   - 伪造 `Origin` 后上述接口返回 403
