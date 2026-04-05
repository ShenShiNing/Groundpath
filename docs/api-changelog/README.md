# API Changelog

最后更新：2026-04-05

这套文档用于追踪 API 合同的历史变化，不替代 Swagger / OpenAPI。

- `/api-docs` 说明“当前 API 长什么样”
- API changelog 说明“这次相对上次改了什么、兼容性如何、调用方要不要迁移”

## 适用范围

- `/api/v1/**`
- 仍对外暴露且可能被客户端、脚本或运维系统依赖的非版本化公共端点：`/api/files/**`、`/api/uploads/**`、`/api/hello`、`/health/*`

## 文件组织

- `v1.md`：记录 `v1` 时代的全部 API 合同变更；在引入 `/api/v2` 之前持续维护这里
- `v2.md`：未来如引入 `/api/v2`，新增同结构文件

## 什么时候必须更新

- 新增、删除或重命名 endpoint / HTTP method
- 修改 path params、query params、request body、response body
- 修改分页、排序、过滤、默认值、限流、鉴权、权限或异步处理语义，且会影响调用方
- 修改状态码、错误码、错误结构或兼容层行为
- 标记 deprecated、移除兼容层，或正式删除旧行为

## 什么情况可以不写

- 纯内部重构，HTTP 合同和对外可观察行为都不变
- 仅补测试、注释或日志，不影响调用方
- 纯性能优化，不改变请求方式、响应结构或状态码

## 每条记录必须回答

- 变更类型：`Added`、`Changed`、`Deprecated`、`Removed`、`Fixed`
- 兼容性：`Compatible`、`Conditionally compatible`、`Breaking`
- 影响范围：受影响的 endpoint、调用方或行为
- 客户端动作：`None`、`Optional`、`Required`
- 迁移说明：如果调用方需要调整，明确写出怎么改
- 来源：对应 PR、issue 或 commit

## 维护流程

1. 修改路由、OpenAPI 元数据或接口契约
2. 更新对应版本的 API changelog
3. 在 PR 中明确说明是否有 API 合同变化
4. 如果是 breaking change，评估继续兼容还是升级到新版本前缀

## 记录模板

```md
## YYYY-MM-DD

### Added | Changed | Deprecated | Removed | Fixed

- 用一句话描述变化
- 必要时补一句说明影响范围或兼容背景

Compatibility: Compatible | Conditionally compatible | Breaking
Affected endpoints: `GET /api/v1/...`
Client action: None | Optional | Required
Migration: None | 调整说明
Source: PR #123 / commit `abcdef1`
```
