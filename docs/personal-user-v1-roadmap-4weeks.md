# 个人用户版 v1.0 功能路线图（4 周可落地）

## 目标

面向个人用户完成 v1.0 的可用闭环：

1. 注册登录 -> 创建知识库 -> 上传文档 -> AI 问答（带引用）-> 数据导出。
2. 降低本地部署门槛，支持开源学习与二次开发。
3. 建立基础工程质量保障（测试、CI、文档）。

## v1.0 范围定义

1. 单用户闭环可用：注册登录、知识库管理、文档管理、RAG 问答、会话管理。
2. 可部署：通过 Docker Compose 快速启动依赖并运行项目。
3. 可维护：具备基础测试、CI、API 文档、发布说明。

## 4 周里程碑

### 第 1 周：产品闭环与体验修复

交付内容：

1. 修复导航死链（`/chat`、`/settings`）与路由入口一致性。
2. 补齐 Chat 页面容器和 Settings 聚合页（可跳转到 AI 设置）。
3. 文档详情页支持 PDF 在线预览 MVP。
4. 首页/About 文案改为个人用户定位。

验收标准：

1. 主导航和 Dashboard 快捷入口无 404。
2. 可从知识库页进入聊天并正常提问。
3. PDF 在详情页可在线阅读。

### 第 2 周：检索质量与可追溯

交付内容：

1. 向量 payload 增加可追溯元数据（offset/page 预留字段）。
2. 引用链路透传 metadata，并支持前端定位跳转。
3. 增加 Hybrid Search（向量召回 + 关键词召回 + 融合排序）。
4. 消息 metadata 记录 token usage、延迟等指标。

验收标准：

1. 同一问题召回结果稳定性提升。
2. 引用可定位回文档内容区域。
3. 可查看单次对话的 token 使用数据。

### 第 3 周：数据可携带

交付内容：

1. 新增服务端导出 CLI（知识库/文档/会话及关联元数据）。
2. 新增服务端导入 CLI（支持幂等与冲突处理策略）。
3. 前端提供“导出知识库”入口（触发导出下载）。

验收标准：

1. 新环境可恢复数据并继续问答。
2. 导入导出有明确日志和失败提示。

### 第 4 周：开源发布与工程化

交付内容：

1. 新增 Docker Compose（MySQL/Qdrant/Server/Client）。
2. 新增 CI：lint + test + build。
3. 补齐 API 文档（OpenAPI 或等价文档）与 v1.0 发布说明。
4. 建立基础贡献说明（本地启动、测试、提交规范）。

验收标准：

1. 新开发者 30 分钟内可本地跑通。
2. PR 自动执行质量检查。

## Issue 拆分（按现有模块）

| ID        | 优先级  | 标题                                           | 影响模块/路径                                                                                                                                                                          | 预估 |
| --------- | ------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| KA-V1-001 | Must    | 修复导航死链：`/chat`、`/settings`             | `packages/client/src/components/layout/AppLayout.tsx` `packages/client/src/components/dashboard/QuickLinks.tsx` `packages/client/src/routes/index.ts`                                  | 0.5d |
| KA-V1-002 | Must    | 新增 Chat 路由与页面容器                       | `packages/client/src/routes` `packages/client/src/pages` `packages/client/src/components/knowledge-bases/chat`                                                                         | 1d   |
| KA-V1-003 | Must    | 新增 `/settings` 路由（重定向 `/settings/ai`） | `packages/client/src/routes` `packages/client/src/pages/AISettingsPage.tsx`                                                                                                            | 0.5d |
| KA-V1-004 | Must    | 首页/About 文案改为个人用户定位                | `packages/client/src/pages/Home.tsx` `packages/client/src/pages/About.tsx`                                                                                                             | 0.5d |
| KA-V1-005 | Must    | PDF 在线预览组件（pdf.js）                     | `packages/client/src/components/documents` `packages/client/package.json`                                                                                                              | 2d   |
| KA-V1-006 | Must    | 文档详情接入预览组件，补 loading/error UX      | `packages/client/src/pages/documents/DocumentDetailPage.tsx` `packages/client/src/components/documents/DocumentReader.tsx`                                                             | 1d   |
| KA-V1-007 | Must    | 扩展向量 payload 元数据结构                    | `packages/server/src/modules/vector/vector.types.ts` `packages/server/src/modules/vector/vector.repository.ts`                                                                         | 1d   |
| KA-V1-008 | Must    | 处理链路写入 chunk metadata 到向量层           | `packages/server/src/modules/rag/services/processing.service.ts` `packages/server/src/modules/rag/services/chunking.service.ts`                                                        | 1.5d |
| KA-V1-009 | Must    | 搜索与 citation 透传 metadata                  | `packages/server/src/modules/rag/services/search.service.ts` `packages/server/src/modules/chat/services/chat.service.ts` `packages/server/src/modules/chat/services/prompt.service.ts` | 1d   |
| KA-V1-010 | Must    | 前端引用点击跳转到文档定位                     | `packages/client/src/components/knowledge-bases/chat` `packages/client/src/pages/documents/DocumentDetailPage.tsx`                                                                     | 1.5d |
| KA-V1-011 | Must    | Hybrid Search（向量 + 关键词 + 融合）          | `packages/server/src/modules/rag/services/search.service.ts` `packages/server/src/modules/document/repositories`                                                                       | 2d   |
| KA-V1-012 | Must    | token usage 与延迟指标持久化                   | `packages/server/src/modules/chat/services/chat.service.ts` `packages/server/src/shared/db/schema/ai/messages.schema.ts`                                                               | 1.5d |
| KA-V1-013 | Must    | 数据导出 CLI                                   | `packages/server/src/scripts` `packages/server/src/modules`                                                                                                                            | 2d   |
| KA-V1-014 | Must    | 数据导入 CLI（幂等、冲突策略）                 | `packages/server/src/scripts` `packages/server/src/modules`                                                                                                                            | 2d   |
| KA-V1-015 | Must    | 前端“导出知识库”入口                           | `packages/client/src/pages/knowledge-bases/KnowledgeBaseDetailPage.tsx` `packages/client/src/api`                                                                                      | 1d   |
| KA-V1-016 | Must    | Docker Compose 一键启动                        | 仓库根目录 + `README.md`                                                                                                                                                               | 1.5d |
| KA-V1-017 | Must    | CI：lint + test + build                        | `.github/workflows/ci.yml` 根目录脚本                                                                                                                                                  | 1d   |
| KA-V1-018 | Must    | API 文档与 v1.0 发布清单                       | `docs/` `README.md`                                                                                                                                                                    | 1d   |
| KA-V1-019 | Stretch | 快速笔记（直接创建 markdown 文档）             | `packages/client/src/components/documents` `packages/server/src/modules/document`                                                                                                      | 1.5d |
| KA-V1-020 | Stretch | 自动重试失败文档 + 批量重建索引                | `packages/server/src/shared/scheduler/index.ts` `packages/server/src/modules/rag`                                                                                                      | 1.5d |

## 推荐执行顺序

1. 第 1 周完成 KA-V1-001 到 KA-V1-006。
2. 第 2 周完成 KA-V1-007 到 KA-V1-012。
3. 第 3 周完成 KA-V1-013 到 KA-V1-015。
4. 第 4 周完成 KA-V1-016 到 KA-V1-018。
5. 余量再做 KA-V1-019 与 KA-V1-020。

## 风险与应对

1. 文档预览与定位复杂度超预期：先做 PDF 预览 MVP，定位采用 offset 最小实现。
2. 检索质量调参成本高：先上线简单融合策略（加权分数），再逐步优化。
3. 导入导出易出现兼容问题：定义稳定 JSON schema 和版本号字段。
4. Docker 环境差异：提供 `.env.example` 与启动自检脚本。
