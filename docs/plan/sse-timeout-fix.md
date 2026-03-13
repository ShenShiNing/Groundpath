# SSE Agent 超时断连修复计划

## 问题现象

Agent 模式下发送消息，最终 LLM 生成回答期间（~30s），SSE 连接被服务端销毁，
导致用户看到"连接中断"而非正常回答。

## 根因分析

### 事故时间线

```
14:30:15.765  请求开始，进入 agent mode（4 tools, zhipu provider）
14:30:23.847  LLM 第 1 次调用完成 → step 0（1 tool call）          ~8s LLM
14:30:31.779  LLM 第 2 次调用完成 → step 1（2 tool calls）         ~8s LLM
14:30:34.870  LLM 第 3 次调用完成 → step 2（vector_fallback_search） ~3s LLM
14:30:37.506  向量搜索工具执行完成                                    ~2.6s tool
14:30:37.506  <- 最后一次 SSE 数据（tool_end 事件）
              ~~~~~~~~ 30 秒空白，无任何 SSE 数据 ~~~~~~~~
14:31:07.511  [SLOW] POST 200 - 51774ms
14:31:07.512  "Client disconnected, aborting"
14:31:07.512  "Chat request aborted"
```

### 三层超时混淆

| 层级                        | 当前值           | 来源                                                    |
| --------------------------- | ---------------- | ------------------------------------------------------- |
| **连接层** `server.timeout` | `30000ms`        | `index.ts:91` — Node.js 检测 socket 空闲 30s 后销毁连接 |
| **编排层** agent loop       | 无上限           | `maxIterations=5`，但每轮 LLM 调用无总时间限制          |
| **上游层** LLM/tool         | tool=15s, LLM=无 | 工具有 `toolTimeout=15s`，LLM 调用无超时                |

**直接触发者**：`server.timeout = 30000`。最后一次 SSE 数据在 `14:30:37`，
socket 空闲 30s 后（`14:31:07`）被 Node.js 销毁。

### 代码缺陷

**缺陷 1：`toolContext.signal` 未传递**

`chat-agent-stream.service.ts:48-53` 构造 `toolContext` 时未传入 signal：

```ts
// chat-agent-stream.service.ts:48-53
toolContext: {
  userId,
  conversationId,
  knowledgeBaseId: knowledgeBaseId ?? undefined,
  documentIds,
  runtimeState: {},
  // signal 缺失
},
```

导致 `agent-executor.ts:97` 的 abort 检查形同虚设：

```ts
// agent-executor.ts:97
if (toolContext.signal?.aborted) {  // 永远是 undefined
```

signal 只通过 `genOptions` 传到了 LLM provider 层（`openai-compat.ts` fetch `signal`），
provider 层的 AbortError 可以传播，但 agent 循环入口无法快速退出。

**缺陷 2：Agent 模式最终回答非流式**

Legacy 模式使用 `provider.streamGenerate()` 逐 token 输出，
SSE 连接始终有数据流动，不会触发空闲超时。

Agent 模式的 `executeAgentMode`（`chat-agent-stream.service.ts:61-137`）是：

1. `await executeAgentConversation(...)` — 阻塞等待整个 agent 循环
2. 循环内每轮调用 `provider.generateWithTools()` — 非流式，等完整响应
3. 最终回答生成后才 `sendChunkedSSE(res, agentResult.content)` — 一次性发送

最终 LLM 调用（生成回答）期间 ~30s 无 SSE 数据 -> 触发 `server.timeout`。

---

## 现有架构参照

### 已有的流式基础设施

| 组件                              | 位置                                      | 状态                                                   |
| --------------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `LLMProvider.streamGenerate()`    | `llm-provider.interface.ts`               | 所有 provider 均已实现，返回 `AsyncGenerator<string>`  |
| `LLMProvider.generateWithTools()` | `llm-provider.interface.ts`               | 可选，OpenAI/Anthropic/Zhipu/DeepSeek 实现，**非流式** |
| `sendSSE()` / `sendChunkedSSE()`  | `chat.helpers.ts`                         | 通用 SSE 发送工具                                      |
| Legacy 流式模式                   | `chat-legacy-stream.service.ts`           | 使用 `streamGenerate` 逐 token 推送，正常工作          |
| 前端 SSE 解析                     | `lib/http/sse.ts` + `api/chat.ts:156-218` | 已有 `receivedTerminalEvent` 安全网                    |
| 前端状态清理                      | `chatPanelStore.ts:185-196`               | `onError` 已正确清理 `isLoading`                       |

### 关键类型约束

- `LLMProvider` 接口无 `streamGenerateWithTools` 方法
- `generateWithTools` 返回 `Promise<ToolGenerateResult>`（完整结果，非流式）
- `AgentExecutorResult` 是完整对象，非流式
- 前端 SSE 事件类型：`chunk | sources | done | error | tool_start | tool_end`
- 所有 provider 的 `generate` / `streamGenerate` / `generateWithTools` 均正确传递 `signal`

---

## 实施计划

### Phase 0：止血（路由超时 + signal 修复）

> 目标：立即消除 SSE 连接被服务端杀死的问题
> 改动：3 个文件，约 10 行

#### 0.1 — SSE 路由禁用 socket 超时

**文件**：`packages/server/src/modules/chat/services/chat.service.ts`
**位置**：`sendMessageWithSSE` 方法，SSE header 设置之后（第 57 行之后）

```ts
res.setHeader('X-Accel-Buffering', 'no');

// SSE 长连接禁用 server.timeout（不影响全局 REST 接口的 30s 超时）
if (res.socket) {
  res.socket.setTimeout(0);
}
```

**原理**：`server.timeout = 30000` 对普通 REST 接口是合理的保护。SSE 连接需要
单独豁免，通过 `socket.setTimeout(0)` 仅对当前连接禁用空闲超时。

#### 0.2 — 传递 signal 到 toolContext

**文件**：`packages/server/src/modules/chat/services/chat.types.ts`
**位置**：`AgentExecutionContext` 接口（第 28-36 行）

```ts
export interface AgentExecutionContext {
  // ...existing fields
  signal?: AbortSignal; // 新增
}
```

**文件**：`packages/server/src/modules/chat/services/chat-agent-stream.service.ts`

两处改动：

1. `executeAgentConversation`（第 44-58 行）— toolContext 补传 signal：

```ts
return executeAgentLoop({
  provider,
  messages,
  tools,
  toolContext: {
    userId,
    conversationId,
    knowledgeBaseId: knowledgeBaseId ?? undefined,
    documentIds,
    signal: ctx.signal, // 新增
    runtimeState: {},
  },
  genOptions,
  onToolStart: callbacks?.onToolStart,
  onToolEnd: callbacks?.onToolEnd,
});
```

2. `executeAgentMode`（第 66-74 行）— 将 signal 同时传入 AgentExecutionContext：

```ts
const agentResult = await executeAgentConversation(
  {
    conversationId,
    content,
    userId,
    documentIds: ctx.documentIds,
    knowledgeBaseId: ctx.knowledgeBaseId,
    provider,
    genOptions: { ...genOptions, signal: abortController.signal },
    signal: abortController.signal,   // 新增
  },
  tools,
  { onToolStart: ..., onToolEnd: ... }
);
```

`executeAgentConversation` 内部将 `ctx.signal` 同时传给 `genOptions.signal`（LLM provider 层）
和 `toolContext.signal`（agent 循环 abort 检查 + 工具执行层）。

#### 0.3 — 新增 SSE heartbeat 默认配置

**文件**：`packages/server/src/core/config/defaults/agent.defaults.ts`

```ts
export const agentDefaults = {
  // ...existing
  sseHeartbeatIntervalMs: 15_000,
} as const;
```

预留给 Phase 1 使用。按 CLAUDE.md 规范，业务常量放在 `*.defaults.ts`。

#### Phase 0 测试验证

- [ ] Agent 模式对话：最终 LLM 调用 >30s 不再断连
- [ ] 普通 REST 接口：仍受 `SERVER_TIMEOUT=30000` 保护
- [ ] 客户端手动取消：`stopGeneration()` -> agent 循环在下一步入口快速退出
- [ ] 服务端 graceful shutdown：SSE 连接不阻塞关闭

---

### Phase 1：心跳保活

> 目标：防御反向代理层的空闲超时
> 改动：1 个文件，约 15 行

#### 1.1 — Agent 执行期间发送 SSE 心跳

**文件**：`packages/server/src/modules/chat/services/chat-agent-stream.service.ts`
**位置**：`executeAgentMode` 函数内

```ts
export async function executeAgentMode(
  ctx: StreamContext,
  tools: ReturnType<typeof resolveTools>
): Promise<void> {
  const { res } = ctx;

  // 心跳定时器：SSE 注释格式，客户端静默忽略
  const heartbeatInterval = setInterval(() => {
    if (!ctx.isDisconnected()) {
      res.write(': heartbeat\n\n');
    }
  }, agentConfig.sseHeartbeatIntervalMs);

  try {
    const agentResult = await executeAgentConversation(/* ... */);
    // ...后续逻辑不变
  } finally {
    clearInterval(heartbeatInterval);
  }
}
```

**原理**：SSE 规范中 `: ` 开头的行是注释。浏览器 `EventSource` 和 fetch-based SSE 库
都会静默忽略。前端 `sse.ts` 的 `processLine` 只处理 `data: ` 开头的行，
`: heartbeat` 会被自动跳过。15s 间隔可覆盖绝大部分代理的空闲超时
（Nginx 默认 60s，Cloudflare 100s）。

#### Phase 1 兼容性验证

- [ ] 前端 `sse.ts` 的 `processLine` 确认忽略 `: heartbeat\n\n`
- [ ] Agent 模式 3+ 轮工具调用：心跳正常发送、工具事件正常穿插
- [ ] Nginx 配置文档（见部署注意事项）

---

### Phase 2：最终回答流式输出

> 目标：Agent 最终回答逐 token 输出，提升用户体验
> 改动：3 个文件，约 60 行

#### 2.1 — Agent executor 透传消息上下文

**核心思路**：Agent 循环中，当 LLM 返回 `finishReason === 'text'`（无更多工具调用）时，
将已收集的对话上下文（`agentMessages`）附带在结果中返回。由 `executeAgentMode`
使用 `provider.streamGenerate()` 流式重新生成最终回答。

**文件**：`packages/server/src/modules/agent/agent-executor.types.ts`

```ts
export interface AgentExecutorResult {
  content: string;
  citations: Citation[];
  retrievedCitations: Citation[];
  agentTrace: AgentStep[];
  stopReason?: AgentStopReason;
  agentMessages?: AgentMessage[]; // 新增：用于流式重新生成
}
```

**文件**：`packages/server/src/modules/agent/agent-executor.ts`

在循环内 `finishReason === 'text'` 分支（第 126-136 行），透传 `agentMessages`：

```ts
if (result.finishReason === 'text' || (result.toolCalls ?? []).length === 0) {
  return finalizeExecutionResult(
    buildAgentExecutorResult({
      content: result.content ?? '',
      citations: allCitations,
      agentTrace,
      stopReason: 'answered',
      tools,
      agentMessages: step > 0 ? agentMessages : undefined, // 新增
    })
  );
}
```

仅当 `step > 0`（经过了工具调用轮次）时才透传。`step === 0` 表示第一轮就直接回答，
无需流式重新生成。

#### 2.2 — 调用方流式输出最终回答

**文件**：`packages/server/src/modules/chat/services/chat-agent-stream.service.ts`

在 `executeAgentMode` 中，替换原来的 `sendChunkedSSE`：

```ts
// 发送 sources（保持不变）
if (agentResult.citations.length > 0) {
  sendSSE(res, { type: 'sources', data: agentResult.citations });
}

// 流式输出最终回答（替换原来的 sendChunkedSSE）
if (agentResult.agentMessages && !ctx.isDisconnected()) {
  // 有工具上下文，用流式重新生成
  let fullContent = '';
  for await (const chunk of provider.streamGenerate(agentResult.agentMessages, {
    ...genOptions,
    signal: abortController.signal,
  })) {
    if (ctx.isDisconnected()) break;
    fullContent += chunk;
    sendSSE(res, { type: 'chunk', data: chunk });
  }
  agentResult.content = fullContent;
} else if (agentResult.content) {
  // 无工具调用（第一轮就回答），直接 chunk 发送
  sendChunkedSSE(res, agentResult.content);
}
```

#### 2.3 — 方案取舍说明

| 维度       | 说明                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| **优点**   | 不改 `LLMProvider` 接口；不改 `executeAgentLoop` 核心循环逻辑；复用所有 provider 已有的 `streamGenerate` |
| **代价**   | 最终回答多一次 LLM 调用（但走流式，首 token 延迟低，用户感知更快）                                       |
| **一致性** | 与 Legacy 流式模式（`chat-legacy-stream.service.ts`）模式一致                                            |
| **备选**   | 新增 `streamGenerateWithTools` 接口 — 改动大、需修改所有 provider，仅在方案 A 不满足时考虑               |

#### Phase 2 测试验证

- [ ] Agent 模式：最终回答逐 token 出现在前端
- [ ] 中途取消：流式生成过程中 `stopGeneration()` 正常中止
- [ ] 空回答处理：`streamGenerate` 生成空内容时的错误提示
- [ ] Citation 先于 chunk 到达前端
- [ ] 消息持久化内容与流式输出一致

---

## 超时预算总结

| 层级           | 值          | 配置位置                            | 说明                   |
| -------------- | ----------- | ----------------------------------- | ---------------------- |
| SSE socket     | `0`（无限） | `chat.service.ts` 路由级            | 由 heartbeat 保活      |
| REST socket    | `30000ms`   | `SERVER_TIMEOUT` env                | 普通接口保护，保持不变 |
| SSE heartbeat  | `15000ms`   | `agent.defaults.ts`                 | 防反向代理空闲超时     |
| 工具单次执行   | `15000ms`   | `agent.defaults.ts` `toolTimeout`   | 已有，保持不变         |
| Agent 最大步数 | `5`         | `agent.defaults.ts` `maxIterations` | 已有，保持不变         |
| LLM 单次调用   | 无显式上限  | 依赖 provider API 超时              | 可后续按需添加         |

---

## 文件变更清单

### Phase 0（止血）

| 文件                                                            | 变更                                   |
| --------------------------------------------------------------- | -------------------------------------- |
| `server/src/modules/chat/services/chat.service.ts`              | `res.socket?.setTimeout(0)`            |
| `server/src/modules/chat/services/chat-agent-stream.service.ts` | `toolContext.signal` 传入              |
| `server/src/modules/chat/services/chat.types.ts`                | `AgentExecutionContext` 增加 `signal?` |
| `server/src/core/config/defaults/agent.defaults.ts`             | 新增 `sseHeartbeatIntervalMs`          |

### Phase 1（心跳）

| 文件                                                            | 变更             |
| --------------------------------------------------------------- | ---------------- |
| `server/src/modules/chat/services/chat-agent-stream.service.ts` | heartbeat 定时器 |

### Phase 2（流式最终回答）

| 文件                                                            | 变更                                          |
| --------------------------------------------------------------- | --------------------------------------------- |
| `server/src/modules/agent/agent-executor.ts`                    | 透传 `agentMessages`                          |
| `server/src/modules/agent/agent-executor.types.ts`              | `AgentExecutorResult.agentMessages`           |
| `server/src/modules/agent/agent-executor.citations.ts`          | `BuildAgentExecutorResultInput.agentMessages` |
| `server/src/modules/chat/services/chat-agent-stream.service.ts` | `streamGenerate` 替换 `sendChunkedSSE`        |

### 不需要变更

| 文件                                   | 原因                                 |
| -------------------------------------- | ------------------------------------ |
| `client/src/lib/http/sse.ts`           | `processLine` 已过滤非 `data: ` 行   |
| `client/src/api/chat.ts`               | `receivedTerminalEvent` 安全网已实现 |
| `client/src/stores/chatPanelStore.ts`  | `onError` 已正确清理 `isLoading`     |
| `server/src/index.ts`                  | 全局 `server.timeout=30000` 保留不变 |
| `server/src/core/config/env/schema.ts` | `SERVER_TIMEOUT` 保留不变            |

---

## 部署注意事项

如果上游有 Nginx / 网关 / CDN，需同步确保：

```nginx
location /api/chat/ {
    proxy_buffering off;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_http_version 1.1;
    chunked_transfer_encoding on;
}
```

Cloudflare：默认 100s 空闲超时，15s 心跳可覆盖。
如有 Enterprise 可调整 `proxy_read_timeout`。
