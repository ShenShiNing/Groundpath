# 代码库修复计划（代码质量、架构、API、数据库）

最后更新：2026-03-24

## 1. 目标

- 先修复会导致运行时错误或主数据不一致的问题。
- 再修复数据库约束与 API 契约漂移，减少隐性故障。
- 最后补齐测试与门禁，避免同类问题再次回归。

## 2. 当前结论

仓库整体工程化基础是好的：

- `public/*` 出口、OpenAPI 自动发现、Drizzle schema、依赖边界门禁都已经落地。
- 文档索引链路有事务、发布栅栏、后台清理与缓存失效设计。
- 后端测试覆盖面较大，说明仓库并不是“无测试靠人工回归”状态。

但目前仍有 4 个需要优先处理的问题：

1. multipart 文档上传链路存在真实运行时缺陷。
2. `users` 软删除唯一约束在 MySQL 下不成立。
3. `user_auths` 缺少数据库级外键保护。
4. Document AI 的局部接口已经出现实现与 OpenAPI 漂移。

---

## 3. 修复项

### P0. 修复 multipart 上传接口的 `getValidatedBody()` 运行时缺陷

**现象**

- `packages/server/src/modules/document/controllers/document.controller.ts`
  - `upload()` 从 `getValidatedBody()` 解构 `title / description / knowledgeBaseId`
  - `uploadNewVersion()` 从 `getValidatedBody()` 解构 `changeNote`
- 但 `packages/server/src/modules/document/document.routes.ts` 中：
  - `POST /api/documents`
  - `POST /api/documents/:id/versions`
  仅挂了 `multer + sanitize`，没有挂 `validateBody(...)`

**影响**

- 真实请求进入控制器时，`res.locals.validated.body` 可能为 `undefined`
- 解构会直接抛异常，最终表现为 500
- 前端当前仍在消费这两条 API，故这是用户可见故障

**修复方案**

1. 在 `POST /api/documents` 上，在 `uploadWithErrorHandling('file')` 之后增加：
   - `validateBody(documentUploadMetadataSchema)`
2. 在 `POST /api/documents/:id/versions` 上增加：
   - `validateBody(documentVersionUploadMetadataSchema)`
3. 统一嵌套路由 `POST /api/knowledge-bases/:id/documents` 的处理方式：
   - 增加 `validateBody(knowledgeBaseDocumentUploadMetadataSchema)`
   - 控制器改为使用 `getValidatedBody()`，不要继续直接读裸 `req.body`
4. 如发现 `validateBody()` 对 multipart 空体兼容性不足，补一个专用 multipart body 校验中间件，但不要让 controller 继续依赖隐式状态

**验收标准**

- `POST /api/documents` 在携带合法 multipart 字段时返回 201，不再因缺少 `validated.body` 报 500
- `POST /api/documents/:id/versions` 同上
- `POST /api/knowledge-bases/:id/documents` 与文档根上传接口使用同一套校验模式
- 新增 HTTP 测试，覆盖“有 file 且有 metadata”的真实控制器路径

### P0. 修复 `users` 软删除唯一约束失效问题

**现象**

- `packages/server/src/core/db/schema/user/users.schema.ts`
  - 当前唯一索引为 `(username, deleted_at)` 与 `(email, deleted_at)`
- 在 MySQL 中，`NULL` 不参与唯一冲突判定
- 因此多个“未删除用户”可能共享相同 `email` 或 `username`

**影响**

- 登录、注册、改邮箱、改用户名的行为会退化为“命中哪条算哪条”
- 仓库层默认把邮箱/用户名视为唯一，但数据库没有真正兜底
- 这是典型的主数据一致性缺陷

**修复方案**

1. 把“活跃用户唯一”约束改成真正可执行的数据库约束，推荐方案二选一：
   - 方案 A：增加 generated column，如 `active_email` / `active_username`
     - `CASE WHEN deleted_at IS NULL THEN email ELSE NULL END`
     - 对 generated column 建唯一索引
   - 方案 B：显式增加“活跃态”约束字段并重建唯一索引
2. 为现存数据补一致性检查：
   - 扩展 `db-consistency-check`
   - 或新增一次性数据审计脚本，先查出重复活跃邮箱/用户名，再执行迁移
3. 仓库测试补上“数据库约束层”验证，不只验证 repository 的查询逻辑

**验收标准**

- 两个活跃用户无法写入相同 `email`
- 两个活跃用户无法写入相同 `username`
- 软删除后的历史记录不阻塞新活跃用户重新使用该邮箱/用户名
- `db:drift-check` 与迁移一致

### P1. 为 `user_auths` 增加数据库级外键

**现象**

- `packages/server/src/core/db/schema/auth/user-auths.schema.ts` 中 `userId` 只有索引，没有外键
- 关系文件里声明了 relation，但数据库本身不保证完整性

**影响**

- 认证绑定记录可能悬空
- 用户删除、迁移、修复脚本执行时，数据库无法协助守住参照完整性
- 对认证域这种高敏感主数据，只靠应用层校验不够稳

**修复方案**

1. 在 `user_auths.user_id -> users.id` 上补外键
2. 删除策略建议使用：
   - `onDelete('cascade')` 如果用户被硬删除时应连带删除绑定
   - 若业务上要求严格阻止删除，则改 `restrict`，但要与用户删除策略统一
3. 为迁移前数据增加 orphan 检查，避免加外键时失败

**验收标准**

- 无法插入指向不存在用户的 `user_auths`
- 用户硬删除后的 `user_auths` 行为与预期一致
- `db-consistency-check` 能发现或防止 auth orphan

### P1. 修复 Document AI `keywords/entities` 的 API 契约漂移

**现象**

- `packages/server/src/modules/document-ai/controllers/analysis.controller.ts`
  - `extractKeywords()` 实际读取 `req.body.maxKeywords / language`
  - `extractEntities()` 实际读取 `req.body.maxEntities / language`
- 但 `packages/server/src/modules/document-ai/document-ai.routes.ts`
  - 这两个接口没有 `validateBody(...)`
- `packages/server/src/core/openapi/paths/document-ai.paths.ts`
  - 这两个接口也没有声明 request body

**影响**

- 实现、路由校验、OpenAPI 三者不一致
- 客户端或 SDK 生成代码会得到错误契约
- 这类漂移会在后续继续扩散到测试与文档

**修复方案**

1. 在 shared schema 中补两个显式请求模型：
   - `extractKeywordsRequestSchema`
   - `extractEntitiesRequestSchema`
2. 在对应路由上挂 `validateBody(...)`
3. controller 改为读取已验证后的 body
4. OpenAPI 为这两条接口补 request body 描述
5. 扩展 OpenAPI 测试，断言这两条接口确实声明了 body schema

**验收标准**

- 两个接口都能接收并校验合法 body
- OpenAPI 文档与实际请求结构一致
- 新增测试能在元数据缺失时直接失败

### P2. 补齐测试门禁，避免同类问题再次漏过

**现象**

- 文档路由测试目前只验证 route wiring，没有验证 multipart metadata 的真实控制器路径
- 现有 KB/Document smoke test 对 service 层 mock 较重，不能完整反映真实契约
- 本次发现的 multipart 缺陷与 Document AI 契约漂移，都没有被当前测试拦住

**修复方案**

1. 文档模块新增 HTTP contract test：
   - `POST /api/documents`
   - `POST /api/documents/:id/versions`
   - `POST /api/knowledge-bases/:id/documents`
2. Document AI 新增：
   - `keywords/entities` 的 HTTP 测试
   - OpenAPI schema 断言
3. 数据库侧新增：
   - `users` 唯一约束迁移后的集成测试
   - `user_auths` 外键与 orphan 防护测试

**验收标准**

- 上述 4 个问题至少各有一条能稳定复现与防回归的自动化测试
- `pnpm test:server`、`pnpm architecture:check`、`pnpm --dir packages/server db:drift-check` 全绿

---

## 4. 推荐实施顺序

1. 先修 multipart 上传链路
   - 原因：这是直接的运行时故障，用户最先感知
2. 再修 `users` 唯一约束
   - 原因：这是主数据层问题，越晚修复，脏数据越难治理
3. 然后补 `user_auths` 外键
   - 原因：属于认证域完整性加固，改动相对独立
4. 最后统一 Document AI 契约并补测试
   - 原因：实现层改动较小，但适合在前面两类问题稳定后一起收口

---

## 5. 每项修复后的最小验证命令

```bash
pnpm architecture:check
pnpm test:server
pnpm --dir packages/server db:drift-check
```

若涉及数据库迁移与一致性修复，补充执行：

```bash
pnpm --dir packages/server db:check
```

---

## 6. 一句话结论

这个仓库目前不是“需要推倒重来”，而是需要优先修 2 类问题：

- 一类是已经会在运行时爆炸的接口链路问题
- 一类是数据库已经看起来正确、但实际上约束不成立的一致性问题

只要先把这 4 个点收口，再补对应测试，整体质量会明显上一个台阶。
