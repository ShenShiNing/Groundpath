RAG 架构实现计划

概述

为 Knowledge Agent 项目实现 RAG（检索增强生成）功能：

- 向量数据库: Qdrant（Docker 部署）
- Embedding Provider: 抽象层设计，默认智谱 GLM，支持 OpenAI / Ollama 切换
- 存储策略: MySQL 存储 chunks 元数据，Qdrant 存储向量

---

技术选型
┌────────────────┬──────────────────┬─────────────────────────────────────────┐
│ 组件 │ 选择 │ 理由 │
├────────────────┼──────────────────┼─────────────────────────────────────────┤
│ 向量数据库 │ Qdrant │ Node.js 友好，后期可迁移到 Qdrant Cloud │
├────────────────┼──────────────────┼─────────────────────────────────────────┤
│ 默认 Embedding │ 智谱 embedding-3 │ 国内访问稳定，2048 维高精度 │
├────────────────┼──────────────────┼─────────────────────────────────────────┤
│ 备选 Embedding │ OpenAI / Ollama │ 灵活切换，满足不同场景 │
└────────────────┴──────────────────┴─────────────────────────────────────────┘
Embedding 模型对比
┌──────────┬────────────────────────┬───────────────────────────┬────────────────┐
│ Provider │ 模型 │ 维度 │ 特点 │
├──────────┼────────────────────────┼───────────────────────────┼────────────────┤
│ 智谱 │ embedding-3 │ 2048（可选 256/512/1024） │ 默认，国内稳定 │
├──────────┼────────────────────────┼───────────────────────────┼────────────────┤
│ 智谱 │ embedding-2 │ 1024（固定） │ 旧版本 │
├──────────┼────────────────────────┼───────────────────────────┼────────────────┤
│ OpenAI │ text-embedding-3-small │ 1536 │ 海外访问 │
├──────────┼────────────────────────┼───────────────────────────┼────────────────┤
│ Ollama │ nomic-embed-text │ 768 │ 本地免费 │
└──────────┴────────────────────────┴───────────────────────────┴────────────────┘

---

文件结构

packages/server/src/
├── modules/
│ ├── embedding/ # Embedding Provider 模块
│ │ ├── embedding.types.ts # 接口定义
│ │ ├── embedding.config.ts # Embedding 配置
│ │ ├── embedding.factory.ts # 工厂 + 单例
│ │ ├── providers/
│ │ │ ├── zhipu.provider.ts # 智谱 embedding-3（默认）
│ │ │ ├── openai.provider.ts # OpenAI text-embedding-3-small
│ │ │ └── ollama.provider.ts # Ollama nomic-embed-text
│ │ └── index.ts
│ │
│ ├── vector/ # Qdrant 向量数据库模块
│ │ ├── vector.types.ts # 向量操作类型
│ │ ├── qdrant.client.ts # Qdrant 客户端封装
│ │ ├── vector.repository.ts # 向量 CRUD
│ │ └── index.ts
│ │
│ └── rag/ # RAG 核心模块
│ ├── services/
│ │ ├── chunking.service.ts # 文本分块
│ │ ├── processing.service.ts # 文档处理 Pipeline
│ │ └── search.service.ts # 相似度搜索
│ ├── controllers/
│ │ └── rag.controller.ts # RAG API
│ ├── rag.routes.ts
│ └── index.ts
│
├── shared/config/
│ ├── env.ts # 扩展环境变量
│ └── embedding.config.ts # Embedding 配置常量

---

环境变量配置

在 env.ts 中新增：

// Embedding Provider
EMBEDDING_PROVIDER: z.enum(['zhipu', 'openai', 'ollama']).default('zhipu'),

// 智谱 (默认)
ZHIPU_API_KEY: z.string().optional(),
ZHIPU_EMBEDDING_MODEL: z.string().default('embedding-3'),
ZHIPU_EMBEDDING_DIMENSIONS: z.coerce.number().default(1024),

// OpenAI (备选)
OPENAI_API_KEY: z.string().optional(),
OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

// Ollama (本地)
OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
OLLAMA_EMBEDDING_MODEL: z.string().default('nomic-embed-text'),

// Qdrant
QDRANT_URL: z.string().default('http://localhost:6333'),
QDRANT_API_KEY: z.string().optional(),
QDRANT_COLLECTION_NAME: z.string().default('document_chunks'),

// Chunking
CHUNK_SIZE: z.coerce.number().default(512),
CHUNK_OVERLAP: z.coerce.number().default(50),

---

核心接口设计

EmbeddingProvider 接口

// modules/embedding/embedding.types.ts
export interface EmbeddingProvider {
embed(text: string): Promise<number[]>;
embedBatch(texts: string[]): Promise<number[][]>;
getDimensions(): Promise<number>; // 启动时动态获取
getName(): string;
}

向量操作类型

// modules/vector/vector.types.ts
export interface VectorPoint {
id: string; // chunk UUID
vector: number[];
payload: ChunkPayload;
}

export interface ChunkPayload {
documentId: string;
userId: string;
version: number;
chunkIndex: number;
content: string;
}

export interface SearchOptions {
userId: string;
query: string;
limit?: number; // 默认 5
scoreThreshold?: number; // 默认 0.7
documentIds?: string[]; // 可选：限定文档范围
}

---

API 端点设计
┌──────┬──────────────────────────────┬──────────────┐
│ 方法 │ 路径 │ 描述 │
├──────┼──────────────────────────────┼──────────────┤
│ POST │ /api/rag/search │ 语义搜索 │
├──────┼──────────────────────────────┼──────────────┤
│ POST │ /api/rag/process/:documentId │ 手动触发处理 │
├──────┼──────────────────────────────┼──────────────┤
│ GET │ /api/rag/status/:documentId │ 获取处理状态 │
└──────┴──────────────────────────────┴──────────────┘
搜索请求/响应

// POST /api/rag/search
// Request
{
query: string;
limit?: number;
documentIds?: string[];
}

// Response
{
query: string;
chunks: Array<{
id: string;
documentId: string;
content: string;
score: number;
chunkIndex: number;
}>;
}

---

处理流程

文档上传后自动处理

上传文档 → 保存文件 → 提取文本 → 返回响应
↓
异步触发 processingService.processDocument()
↓
更新状态 pending → processing
↓
分块 (chunkText)
↓
批量 Embedding
↓
存储 MySQL chunks + Qdrant vectors
↓
更新状态 → completed / failed

状态机

pending ──→ processing ──→ completed
│
└──→ failed

---

实施步骤

Phase 1: 环境配置

- 扩展 env.ts 添加 RAG 相关环境变量
- 创建 embedding.config.ts 配置文件
- 更新 .env.development 添加默认值

Phase 2: Embedding 模块

- 创建 embedding.types.ts 接口定义
- 实现 zhipu.provider.ts（默认）
- 实现 openai.provider.ts
- 实现 ollama.provider.ts
- 创建 embedding.factory.ts 工厂

Phase 3: Vector 模块

- 创建 vector.types.ts
- 实现 qdrant.client.ts（含 ensureCollection）
- 实现 vector.repository.ts

Phase 4: RAG 核心

- 实现 chunking.service.ts
- 实现 processing.service.ts
- 实现 search.service.ts
- 创建 rag.controller.ts
- 创建 rag.routes.ts

Phase 5: 集成

- 修改 document.service.ts 在上传后触发处理
- 在 router.ts 注册 RAG 路由
- 在 index.ts 启动时初始化 Qdrant collection
- 添加 documentChunkRepository.deleteByDocumentId 方法

Phase 6: 依赖安装

pnpm -F @knowledge-agent/server add @qdrant/js-client-rest openai

---

关键文件修改清单
┌────────────────────────────────────────────────────────────┬──────┬─────────────────────────┐
│ 文件 │ 操作 │ 描述 │
├────────────────────────────────────────────────────────────┼──────┼─────────────────────────┤
│ shared/config/env.ts │ 修改 │ 添加 RAG 环境变量 │
├────────────────────────────────────────────────────────────┼──────┼─────────────────────────┤
│ modules/embedding/_ │ 新增 │ Embedding Provider 模块 │
├────────────────────────────────────────────────────────────┼──────┼─────────────────────────┤
│ modules/vector/_ │ 新增 │ Qdrant 向量模块 │
├────────────────────────────────────────────────────────────┼──────┼─────────────────────────┤
│ modules/rag/\* │ 新增 │ RAG 核心模块 │
├────────────────────────────────────────────────────────────┼──────┼─────────────────────────┤
│ modules/document/services/document.service.ts │ 修改 │ 上传后触发处理 │
├────────────────────────────────────────────────────────────┼──────┼─────────────────────────┤
│ modules/document/repositories/document-chunk.repository.ts │ 修改 │ 添加 deleteByDocumentId │
├────────────────────────────────────────────────────────────┼──────┼─────────────────────────┤
│ router.ts │ 修改 │ 注册 RAG 路由 │
├────────────────────────────────────────────────────────────┼──────┼─────────────────────────┤
│ index.ts │ 修改 │ 启动时初始化 Qdrant │
├────────────────────────────────────────────────────────────┼──────┼─────────────────────────┤
│ .env.development │ 修改 │ 添加默认配置 │
└────────────────────────────────────────────────────────────┴──────┴─────────────────────────┘

---

验证方案

1.  单元测试

- Embedding Provider 各实现的 embed/embedBatch
- Chunking 分块逻辑

2.  集成测试

# 1. 启动 Qdrant

docker run -p 6333:6333 qdrant/qdrant

# 2. 启动服务器

pnpm dev:server

# 3. 上传文档，观察日志中 processing 状态变化

# 4. 调用搜索 API

curl -X POST http://localhost:3000/api/rag/search \
 -H "Authorization: Bearer <token>" \
 -H "Content-Type: application/json" \
 -d '{"query": "测试搜索"}'

3.  验收标准

- 文档上传后自动完成向量化（状态变为 completed）
- 搜索 API 返回相关 chunks
- 切换 Provider（修改 EMBEDDING_PROVIDER）后正常工作
- 用户只能搜索自己的文档

---

后续扩展

1.  异步队列: 使用 BullMQ 处理大量文档
2.  重试机制: 处理失败后自动重试
3.  前端集成: 文档处理状态实时展示
4.  对话功能: 基于 RAG 结果的 LLM 对话

RAG 架构实现总结

新增依赖

- @qdrant/js-client-rest - Qdrant 向量数据库客户端
- openai - OpenAI SDK（用于 embedding provider）

新增文件

Embedding 模块 (modules/embedding/)

- embedding.types.ts - EmbeddingProvider 接口，包含 embed、embedBatch、getDimensions、getName 方法
- providers/zhipu.provider.ts - 智谱 embedding-3（默认，支持自定义维度）
- providers/openai.provider.ts - OpenAI text-embedding-3-small（原生批量支持）
- providers/ollama.provider.ts - Ollama 本地 embedding（含批量 API 回退机制）
- embedding.factory.ts - 工厂 + 单例模式，根据 EMBEDDING_PROVIDER 环境变量创建 provider
- index.ts - 模块导出

Vector 模块 (modules/vector/)

- vector.types.ts - VectorPoint、ChunkPayload、SearchOptions、SearchResult 类型定义
- qdrant.client.ts - Qdrant 客户端单例 + ensureCollection（创建集合，使用余弦距离，在 userId 和 documentId 上建立
  payload 索引）
- vector.repository.ts - upsert、search（按 userId 过滤 + 可选 documentId 过滤 + 分数阈值）、deleteByDocumentId
- index.ts - 模块导出

RAG 模块 (modules/rag/)

- services/chunking.service.ts - 基于段落的文本分块，支持可配置的块大小/重叠，对长段落按句子进行二次切分
- services/processing.service.ts - 完整处理流水线：更新状态 → 获取文本内容 → 删除旧 chunks → 分块 → 批量 embedding →
  存储 MySQL + Qdrant → 更新状态
- services/search.service.ts - 语义搜索：embedding 查询 → 在 Qdrant 中按用户范围搜索
- controllers/rag.controller.ts - 3 个端点，使用 Zod 校验
- rag.routes.ts - 路由，使用 authenticate 中间件
- index.ts - 模块导出

修改的文件
文件: shared/config/env.ts
修改内容: 新增 13 个环境变量（embedding、Qdrant、分块配置）
────────────────────────────────────────
文件: .env.development
修改内容: 添加所有新环境变量的默认值
────────────────────────────────────────
文件: router.ts
修改内容: 注册 /api/rag 路由
────────────────────────────────────────
文件: index.ts
修改内容: 改为异步启动，启动时初始化 Qdrant collection（使用 embedding 维度）
────────────────────────────────────────
文件: document.service.ts
修改内容: 在 upload、uploadNewVersion、restoreVersion 后异步触发 processingService.processDocument()；永久删除时清理
Qdrant
向量
API 端点
┌──────┬──────────────────────────────┬────────────────────────────────────────────────────────────────┐
│ 方法 │ 路径 │ 描述 │
├──────┼──────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ POST │ /api/rag/search │ 语义搜索（参数：query、limit?、scoreThreshold?、documentIds?） │
├──────┼──────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ POST │ /api/rag/process/:documentId │ 手动触发文档处理 │
├──────┼──────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ GET │ /api/rag/status/:documentId │ 获取文档处理状态 │
└──────┴──────────────────────────────┴────────────────────────────────────────────────────────────────┘
处理流程

文档上传 → 异步触发: pending → processing → 文本分块 → 批量 embedding → 存储 MySQL + Qdrant → completed（失败则
failed）

构建和 lint 均已通过验证。
