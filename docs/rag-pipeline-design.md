# RAG 流水线完整设计解析

> 本文档从文档处理到 LLM 回答，按阶段逐一解析设计及其背后的考量。

---

## 一、文档分块（Chunking）

**位置**: `packages/server/src/modules/rag/services/chunking.service.ts`

### 三级层次化分块策略

```
文本 → ① 按段落分割 (\n\n+) → ② 按句子分割 (.!?。！？) → ③ 按字符硬截断
```

| 配置项          | 默认值   | 作用                  |
| --------------- | -------- | --------------------- |
| `CHUNK_SIZE`    | 512 字符 | 每个 chunk 的目标大小 |
| `CHUNK_OVERLAP` | 50 字符  | 相邻 chunk 的重叠区域 |

每个 chunk 输出包含 `content`、`chunkIndex`、`metadata: { startOffset, endOffset }`。

### 为什么这样设计？

1. **层次化分割优于固定窗口**：优先按段落/句子的自然语义边界分割，保持语义完整性。只有在段落或句子本身超长时才回退到硬截断，是一种 graceful degradation。
2. **512 字符的 chunk 大小**：这是 embedding 模型的"甜点区"——太小会丢失上下文，太大会引入噪声稀释语义密度，降低检索精度。
3. **50 字符的重叠**：解决分块边界处的信息断裂问题。比如一句话被切成两半时，重叠区域保证两个 chunk 都包含这句话的完整语义，避免检索"死角"。
4. **保留偏移量元数据**：`startOffset/endOffset` 允许将检索结果映射回原文位置，为未来高亮定位等功能留下基础设施。

---

## 二、向量化（Embedding）

**位置**: `packages/server/src/modules/embedding/`

### 三个 Provider，统一接口

```typescript
interface EmbeddingProvider {
  embed(text: string): Promise<number[]>; // 单文本
  embedBatch(texts: string[]): Promise<number[][]>; // 批量
  getDimensions(): number;
  getName(): string;
}
```

| Provider | 默认模型               | 维度 | 并发控制                | 超时     |
| -------- | ---------------------- | ---- | ----------------------- | -------- |
| Zhipu    | embedding-3            | 1024 | p-limit(5)              | 30s      |
| OpenAI   | text-embedding-3-small | 1536 | SDK 原生批量            | SDK 默认 |
| Ollama   | nomic-embed-text       | 768  | 尝试批量 API → 回退逐条 | 60s      |

**工厂模式 + 单例缓存**：`EmbeddingFactory` 按 provider 类型缓存实例，同一类型不重复创建。

### 为什么这样设计？

1. **策略模式 + 工厂**：将 embedding 实现与业务逻辑解耦。新增 provider（如 Cohere、Jina）只需实现接口 + 注册工厂，零改动业务代码。这是 OCP（开闭原则）的典型应用。
2. **知识库绑定 provider**：创建 KB 时选定 embedding provider/model/dimensions，之后**不可变**。因为不同模型产生的向量空间不兼容——用模型 A 生成的向量不能和模型 B 的查询向量做相似度比较。这保证了整个 KB 内向量空间的一致性。
3. **p-limit 并发控制**：外部 API 有 rate limit，不控制并发会导致大量 429/超时。Ollama 本地模型则给了更高超时（60s），因为本地推理更慢。
4. **批量嵌入**：处理时按 batch_size=20 分批调用 `embedBatch`，平衡了吞吐量与单次请求大小，避免超时或 payload 过大。
5. **单例缓存**：同一 provider 配置不变的情况下复用连接和配置，降低开销。

---

## 三、向量存储（Vector Storage）

**位置**: `packages/server/src/modules/vector/`

### Qdrant 集合设计

```
集合名: embedding_{provider}_{dimensions}
例: embedding_openai_1536, embedding_zhipu_1024
```

每个向量点的 payload 结构：

```typescript
{
  documentId: string,
  userId: string,
  knowledgeBaseId: string,
  version: number,
  chunkIndex: number,
  content: string,
  isDeleted?: boolean  // 软删除标记
}
```

**Payload 索引**：`userId`、`documentId`、`knowledgeBaseId`（keyword）、`isDeleted`（bool）

### 核心操作

| 操作            | 说明                            | 批量大小 |
| --------------- | ------------------------------- | -------- |
| Upsert          | 幂等写入，`wait: true`          | 100      |
| Search          | 过滤 userId + kbId + !isDeleted | -        |
| Soft Delete     | 标记 `isDeleted: true`          | -        |
| Physical Delete | best-effort 清理                | -        |

### 为什么这样设计？

1. **按 provider+维度分集合**：不同模型的向量维度不同，Qdrant 要求同一集合内所有向量维度一致。按 `provider_dimensions` 命名保证隔离，同时相同配置的 KB 可以共享集合——减少集合碎片化。
2. **Cosine 距离**：大多数文本 embedding 模型在训练时就针对 cosine similarity 优化，是文本语义搜索的标准选择。
3. **软删除机制（两阶段删除）**：
   - **阶段一**：`isDeleted = true`（立即生效，搜索过滤）
   - **阶段二**：物理删除（best-effort，失败不报错）

   因为向量删除是不可逆的。如果在删除过程中系统崩溃，软删除保证数据不会"幽灵般"出现在搜索结果中，而物理清理可以后续补偿。这是一种**安全优先**的设计。

4. **payload 内嵌 content**：将 chunk 文本直接存在 Qdrant payload 中，搜索时直接返回内容，无需再回查 MySQL——减少一次跨存储的 round-trip，降低延迟。
5. **Upsert 语义**：幂等操作，重复处理同一文档不会产生重复向量。

---

## 四、文档处理编排（Processing Pipeline）

**位置**: `packages/server/src/modules/rag/services/processing.service.ts`

这是整个系统最关键的编排层，采用了**五阶段流水线**：

```
Phase 1: 获取锁 + 预检查
    ↓
Phase 2: 分块 + 嵌入（生成新数据，但不修改任何存储）
    ↓
Phase 3: Qdrant Upsert（幂等写入新向量）
    ↓
Phase 4: MySQL 事务（插入新 chunk → 删除旧 chunk → 更新计数器）
    ↓
Phase 5: 清理旧向量（best-effort）
```

### 并发控制：双层锁

| 层级     | 机制                                                            | 作用                      |
| -------- | --------------------------------------------------------------- | ------------------------- |
| 内存锁   | `Map<documentId, true>`                                         | 同进程快速路径，O(1) 判断 |
| 数据库锁 | 原子 `UPDATE ... SET status='processing' WHERE status IN (...)` | 多进程/多实例竞争防护     |

### 状态追踪

```
pending → processing → completed
                    → failed
```

通过 `documents.processingStatus` 和 `documents.processingError` 字段持久化追踪。

### 为什么这样设计？

1. **异步处理，不阻塞请求**：上传/编辑文档后，fire-and-forget 触发处理。用户不需要等待分块和向量化完成。通过 `processingStatus` 字段追踪进度。

2. **"先写新、后删旧"的顺序**：Phase 3 先 upsert 新向量，Phase 4 事务内先插入新 chunk 再删除旧 chunk。如果中途失败：
   - 新向量已写入但 MySQL 未更新 → 下次重跑会 upsert 覆盖（幂等），不会丢数据
   - 旧向量未删除 → 软删除兜底 + 清理服务补偿

   如果反过来"先删旧再写新"，中途崩溃会导致**数据丢失**——这是数据安全的关键设计决策。

3. **Qdrant 写入在 MySQL 事务之前**：如果 Qdrant 写入失败，直接标记 failed 返回，MySQL 数据完全未动。这样"真相源"（MySQL）始终一致，而 Qdrant 的多余数据可以通过清理服务修复。

4. **双层锁防止重复处理**：内存锁在单进程内 O(1) 判断，数据库锁防止多进程/多实例竞争。成本低但有效。

5. **计数器原子更新**：`chunkCount`、`totalChunks` 在事务内用 delta 方式更新（`newCount - oldCount`），配合 floor 保护（不为负），保证幂等和并发安全。

---

## 五、RAG 检索（Search & Retrieval）

**位置**: `packages/server/src/modules/rag/services/search.service.ts`

### 搜索接口

```typescript
searchInKnowledgeBase({
  userId: string,
  knowledgeBaseId: string,
  query: string,
  limit: 5,            // 返回 top-K
  scoreThreshold: 0.7, // 相似度阈值
  documentIds?: string[] // 可选：限定文档范围
}): Promise<SearchResult[]>
```

### 搜索流程

```
1. 获取 KB 的 embedding 配置
2. 用同一个 provider 将 query 向量化
3. 在 Qdrant 中搜索
   过滤条件：userId + kbId + !isDeleted
4. 返回 score > threshold 的结果
```

### 为什么这样设计？

1. **查询必须用同一 embedding provider**：query 向量必须和文档向量处于同一向量空间，否则 cosine similarity 无意义。这就是前面 KB 绑定 provider 的原因。
2. **双重过滤（userId + kbId）**：多租户隔离的安全保障。即使知道别人的 kbId，payload filter 确保不会泄露其他用户的数据。
3. **scoreThreshold = 0.7**：独立搜索 API 的阈值较高，避免返回低质量结果给用户。而在 chat 场景中阈值降低到 0.5（下文详述）。
4. **可选 documentIds 过滤**：支持"在指定文档中搜索"的场景，精准度更高。

---

## 六、LLM 回答生成

**位置**: `packages/server/src/modules/llm/` + `packages/server/src/modules/chat/`

### 6.1 LLM Provider 层

支持 5 类 Provider：OpenAI、Anthropic、Zhipu、DeepSeek、Ollama、Custom（兼容 OpenAI API）。

```typescript
interface LLMProvider {
  name: LLMProviderType;
  generate(messages: ChatMessage[], options?: GenerateOptions): Promise<string>;
  streamGenerate(messages: ChatMessage[], options?: GenerateOptions): AsyncGenerator<string>;
  healthCheck(): Promise<boolean>;
}

interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  signal?: AbortSignal; // 用于取消
}
```

**与 Embedding Provider 的关键区别**：LLM Provider **不缓存**，每次请求从用户配置创建。因为不同用户有不同的 API Key 和模型偏好。

### 6.2 Chat 完整流程

`chatService.sendMessageWithSSE()` 的完整流程：

```
 1. 保存用户消息到 DB
 2. 若首条消息 → 自动更新会话标题
 3. RAG 搜索（limit=5, threshold=0.5）
    ↓ 失败则 graceful 降级，不中断
 4. 批量查询文档标题（防 N+1）
 5. 构建 system prompt + 注入检索上下文
 6. 获取历史消息（最近 10 条）
 7. 截断历史到 ~4000 tokens
 8. 流式生成 → SSE 推送
 9. 监听客户端断开 → AbortSignal 取消 LLM 流
10. 保存助手消息 + citations
11. 发送 done 事件
```

### 6.3 SSE 事件流

```
→ { type: 'sources',  data: Citation[] }        // 引用来源（首先发送）
→ { type: 'chunk',    data: string }             // 逐 token 推送（多次）
→ { type: 'done',     data: { messageId } }      // 完成
→ { type: 'error',    data: { code, message } }  // 出错
```

### 6.4 Prompt 工程

**上下文注入格式**：

```
请根据以下参考资料回答用户问题：

[Source 1: 文档标题, Page X]
chunk 内容...

[Source 2: 文档标题, Page Y]
chunk 内容...
```

**历史截断**：从最新消息向前遍历，按 4 字符 ≈ 1 token 估算，累计超过 4000 tokens 截断。

**Citation 结构**：

```typescript
interface Citation {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  pageNumber?: number;
  score: number;
}
```

### 为什么这样设计？

1. **RAG 搜索阈值降低到 0.5**：在对话场景中，宁可多给一些可能相关的上下文，让 LLM 自行判断相关性，也不要因为阈值过高而遗漏关键信息。LLM 有很强的信息筛选能力，而搜索的 recall 更难补偿。

2. **Graceful 降级**：RAG 搜索失败不中断对话，退化为普通聊天。这保证了系统的可用性——向量服务临时不可用不应该让整个聊天功能瘫痪。

3. **SSE 而非 WebSocket**：
   - 单向推送，符合"请求-流式响应"的模式
   - 自动重连、HTTP 兼容、代理友好
   - 不需要维护双向连接状态，实现更简单

4. **AbortSignal 取消机制**：用户关闭页面或切换对话时，通过 `res.on('close')` 检测断连，立即 abort LLM 流。避免浪费 token 和服务器资源——这在按 token 计费的 API 场景下是重要的成本控制。

5. **历史截断策略**：保留最近的消息（最多 10 条，~4000 tokens），保证：
   - 不超过 LLM 的 context window
   - 优先保留最近的对话上下文（更可能与当前问题相关）
   - 粗略的 4 字符/token 估算足够用于控制，精确 tokenizer 成本不值得

6. **Citation 持久化**：将 RAG 检索结果作为 citations 存入消息表，用户可以回溯查看回答的来源依据，增强可信度和可审计性。

7. **批量查询文档标题**：检索结果中只有 `documentId`，需要关联文档标题。用一次 `WHERE id IN (...)` 批量查询替代 N 次单独查询，防止 N+1 问题。

---

## 七、端到端流程总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        文档处理阶段                              │
│                                                                 │
│  上传文档 ──→ 文本提取 ──→ 层次化分块 ──→ 批量嵌入 ──→ 存储      │
│                           (512 chars)   (batch=20)              │
│                           (overlap=50)                          │
│                                          ↓           ↓         │
│                                        Qdrant      MySQL       │
│                                       (upsert)   (事务写入)     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        查询回答阶段                              │
│                                                                 │
│  用户提问 ──→ Query 嵌入 ──→ Qdrant 相似搜索 ──→ 上下文注入      │
│              (同一 provider)  (top-5, ≥0.5)     (system prompt) │
│                                                      ↓         │
│                                                 LLM 流式生成    │
│                                                      ↓         │
│                                                 SSE 推送给前端   │
│                                                      ↓         │
│                                              保存消息 + citations│
└─────────────────────────────────────────────────────────────────┘
```

---

## 八、配置参数一览

### 文档处理

| 参数                      | 默认值  | 说明                     |
| ------------------------- | ------- | ------------------------ |
| `CHUNK_SIZE`              | 512     | 每个 chunk 的目标字符数  |
| `CHUNK_OVERLAP`           | 50      | 相邻 chunk 的重叠字符数  |
| `TEXT_CONTENT_MAX_LENGTH` | 500,000 | 可编辑文档的最大文本长度 |
| `TEXT_PREVIEW_MAX_LENGTH` | 50,000  | PDF/DOCX 预览文本长度    |

### Embedding

| 参数                         | 默认值                 | 说明                  |
| ---------------------------- | ---------------------- | --------------------- |
| `EMBEDDING_PROVIDER`         | zhipu                  | 默认 embedding 提供商 |
| `EMBEDDING_CONCURRENCY`      | 5                      | 并发请求数上限        |
| `ZHIPU_EMBEDDING_MODEL`      | embedding-3            | 智谱 embedding 模型   |
| `ZHIPU_EMBEDDING_DIMENSIONS` | 1024                   | 智谱向量维度          |
| `OPENAI_EMBEDDING_MODEL`     | text-embedding-3-small | OpenAI embedding 模型 |
| `OLLAMA_BASE_URL`            | http://localhost:11434 | Ollama 服务地址       |
| `OLLAMA_EMBEDDING_MODEL`     | nomic-embed-text       | Ollama embedding 模型 |

### 向量数据库

| 参数            | 默认值                | 说明                          |
| --------------- | --------------------- | ----------------------------- |
| `QDRANT_URL`    | http://localhost:6333 | Qdrant 服务地址               |
| Qdrant 操作超时 | 30,000ms              | 硬编码在 vector.repository.ts |

### 对话

| 参数                     | 默认值       | 说明                       |
| ------------------------ | ------------ | -------------------------- |
| RAG 搜索数量             | 5            | 每次检索返回的 top-K       |
| RAG 搜索阈值（搜索 API） | 0.7          | 独立搜索的相似度下限       |
| RAG 搜索阈值（对话）     | 0.5          | 对话场景的相似度下限       |
| 历史消息数量             | 10           | 对话上下文中包含的历史条数 |
| 历史 token 预算          | 4,000        | 历史截断的 token 上限      |
| Token 估算比率           | 4 字符/token | 粗略估算比率               |

---

## 九、数据库 Schema 关系

```
knowledge_bases (KB 配置 + 计数器)
    │
    ├── documents (文档元数据 + processingStatus)
    │       │
    │       ├── document_versions (多版本 + 文本内容)
    │       │
    │       └── document_chunks (分块记录 + 内容)
    │
    └── conversations (对话会话)
            │
            └── messages (消息 + citations 元数据)
```

**关键索引**：

- `documents`: userId, knowledgeBaseId, processingStatus, deletedAt, createdAt
- `document_chunks`: documentId, (documentId, version), (documentId, version, chunkIndex)
- Qdrant payload: userId, documentId, knowledgeBaseId, isDeleted

---

## 十、整体设计原则总结

| 原则             | 具体体现                                           |
| ---------------- | -------------------------------------------------- |
| **数据安全优先** | 先写新再删旧、软删除兜底、事务保护                 |
| **幂等性**       | Upsert 语义、条件状态更新、可安全重试              |
| **故障隔离**     | RAG 失败不影响聊天、清理失败不影响主流程           |
| **多租户隔离**   | userId 贯穿所有 filter，payload 级别隔离           |
| **可扩展性**     | 策略模式 + 工厂模式，Provider 可插拔               |
| **性能优化**     | 批量嵌入、payload 内嵌 content、并发控制、N+1 防护 |
| **资源敏感**     | AbortSignal 取消、历史截断、p-limit 限流           |

整个设计在**一致性、可用性、性能**三者之间取了良好的平衡：

- **关键路径**（MySQL 事务）：保证**强一致性**
- **辅助路径**（向量清理）：接受**最终一致性**
- **外部调用**：全部有超时和降级策略
