# 流式渲染流畅度优化方案

## 目标

- 降低 SSE 高频 chunk 导致的 Zustand 更新频率。
- 避免流式阶段历史消息列表跟随最后一条消息重复渲染。
- 降低流式阶段 Markdown 解析开销。
- 消除流式期间 `smooth` 滚动动画堆积导致的抖动。
- 保持停止生成、重试、编辑、引用点击等现有交互语义不变。

## 当前链路

当前聊天主链路为：

`ChatPage -> useChatPageController -> ChatPageConversation -> ChatMessage -> ChatMarkdown`

当前瓶颈：

1. `chatPanelStore.sendMessage` 在每次 `onChunk` 时直接调用 `appendToLastMessage`。
2. `ChatPageConversation` 向 `ChatMessage` 传递了多组内联回调，阻断 `memo` 收益。
3. `ChatMarkdown` 在流式阶段仍会执行 Markdown 渲染链路。
4. `useChatPageController` 在每次消息变化时无条件触发 `scrollIntoView({ behavior: 'smooth' })`。

## 实施范围

### 新增文件

- `packages/client/src/hooks/useStreamBuffer.ts`

### 修改文件

- `packages/client/src/stores/chatPanelStore.types.ts`
- `packages/client/src/stores/chatPanelStore.ts`
- `packages/client/src/pages/chat-page/useChatPageController.ts`
- `packages/client/src/pages/chat-page/ChatPageConversation.tsx`
- `packages/client/src/components/chat/ChatMessage.tsx`
- `packages/client/src/components/chat/ChatMarkdown.tsx`

## 实施步骤

### 1. 引入 requestAnimationFrame 流式缓冲

新增 `useStreamBuffer` hook，提供：

- `push(text)`：写入 ref，不触发渲染。
- `flush()`：同步提交累积文本。
- `reset()`：清空缓冲并取消待执行 RAF。

实现约束：

- 每帧最多提交一次。
- 组件卸载时清理 RAF，并确保剩余文本不会丢失。

### 2. 扩展 store 流式控制接口

在 `chatPanelStore.types.ts` 中新增 `StreamControls` 类型，并让以下方法接受可选第三参数：

- `sendMessage`
- `editMessage`
- `retryMessage`

设计约束：

- 不向 store state 注入全局 `streamBufferRef`。
- 流式控制对象仅绑定当前请求生命周期，避免跨请求串写。

### 3. 在 store 中接入缓冲刷新

在 `chatPanelStore.ts` 中：

- `sendMessage` 开始前调用 `stream?.reset()`。
- `onChunk` 改为 `stream?.push(text) ?? appendToLastMessage(text)`。
- `onDone` / `onError` 先 `stream?.flush()`，再更新最终消息状态。
- `editMessage` / `retryMessage` 在继续调用 `sendMessage` 时透传 `stream`。

### 4. 在页面控制器中统一编排发送、停止与滚动

在 `useChatPageController.ts` 中：

- 基于 `appendToLastMessage` 创建 `useStreamBuffer` 实例。
- 发送、重试、编辑时将 `streamBuffer` 透传给 store。
- 停止生成时先 `flush()`，再调用 store 的 `stopGeneration()`。

滚动逻辑调整：

- 使用滚动监听持续维护“用户是否仍位于底部附近”的状态。
- 自动定位仅在用户仍位于底部附近时触发。
- 流式阶段使用 `behavior: 'auto'`。
- 非流式新增消息时保留 `behavior: 'smooth'`。
- 聚焦到指定消息或关键字时，继续使用 `smooth + center`。

### 5. 稳定消息项 props，放大 `React.memo` 收益

在 `ChatPageConversation.tsx` 中移除传给 `ChatMessage` 的内联箭头函数。

`ChatMessage` 改为接收：

- `canEdit`
- `canRegenerate`
- 稳定的 `onCopyMessage`
- 稳定的 `onEditMessage`
- 稳定的 `onRegenerateMessage`

随后使用 `React.memo` 包裹 `ChatMessage` 导出。

本轮不引入自定义 comparator，先依赖浅比较。

### 6. 流式阶段使用渐进式 Markdown 渲染

在 `ChatMarkdown.tsx` 中新增 `isStreaming`：

- `false`：沿用现有 Markdown 渲染逻辑。
- `true`：仍走 Markdown 渲染链路，但通过 deferred 内容降低流式阶段更新优先级，并保留光标动画。

这样可以兼顾：

- 流式过程中即时看到标题、列表、代码块等 Markdown 结构。
- 避免回退到“全文完成后才一次性格式化”的体验。

## 测试与验证

计划补充或更新以下测试：

- `packages/client/tests/hooks/useStreamBuffer.test.tsx`
- `packages/client/tests/stores/chatPanelStore.onDone.test.ts`
- `packages/client/tests/stores/chatPanelStore.onError.test.ts`
- `packages/client/tests/pages/ChatPage.test.tsx`
- `packages/client/tests/components/chat/ChatMarkdown.test.tsx`

验证命令：

```bash
pnpm test -- packages/client/tests/hooks/useStreamBuffer.test.tsx packages/client/tests/stores/chatPanelStore.onDone.test.ts packages/client/tests/stores/chatPanelStore.onError.test.ts packages/client/tests/components/chat/ChatMarkdown.test.tsx packages/client/tests/pages/ChatPage.test.tsx
pnpm -F @knowledge-agent/client build
```

## 验收标准

1. 流式输出时，最后一条消息以每帧最多一次的节奏刷新。
2. 历史消息不会因最后一条流式变化而重复渲染。
3. 用户离开底部查看历史时，不会被强制拉回底部。
4. 停止生成、错误结束、正常结束三种场景都不会丢失尾部文本。
5. 流结束后 Markdown 最终表现与现有逻辑一致。

## 实施结果

- 状态：已完成
- 已落地内容：
  - 新增 `useStreamBuffer`，以 `requestAnimationFrame` 合并流式 chunk。
  - `chatPanelStore` 支持 request-scoped `StreamControls`，并在 `done` / `error` / 编辑中断前显式 `flush`。
- `useChatPageController` 已统一接入 buffer，并改为“通过滚动监听维护底部状态；仅在底部附近时自动滚动；流式阶段使用 `auto`”。
- `ChatPageConversation` 已移除传给 `ChatMessage` 的内联回调。
- `ChatMessage` 已改为稳定 props API，并使用 `React.memo` 包裹导出。
- `ChatMarkdown` 已改为流式阶段渐进式 Markdown 渲染，保留实时格式化与光标动画。
  - `sendMessage` 已改为先乐观插入用户消息与 assistant 占位，再异步创建会话，避免首条消息被建会话请求阻塞。
  - `useChatPageController` 已在新一轮问答开始时优先将最新用户消息滚动到可视区域，再进入流式跟随。
  - `ChatMessage` 已在 assistant 首段内容出现时增加淡入位移动画，并在编辑重发未真正启动时给出错误提示。
- 已补测试：
  - `packages/client/tests/hooks/useStreamBuffer.test.tsx`
  - `packages/client/tests/components/chat/ChatMarkdown.test.tsx`
  - `packages/client/tests/stores/chatPanelStore.onDone.test.ts`
  - `packages/client/tests/stores/chatPanelStore.onError.test.ts`
  - `packages/client/tests/pages/ChatPage.test.tsx`
  - `packages/client/tests/stores/chatPanelStore.test.ts`
- 验证结果：
  - `pnpm test -- packages/client/tests/hooks/useStreamBuffer.test.tsx packages/client/tests/stores/chatPanelStore.onDone.test.ts packages/client/tests/stores/chatPanelStore.onError.test.ts packages/client/tests/components/chat/ChatMarkdown.test.tsx packages/client/tests/pages/ChatPage.test.tsx` 通过。
  - `pnpm -F @knowledge-agent/client build` 通过。
- 备注：
  - 本轮未额外加入 profiler 级自动化断言，`React.memo` 收益依赖运行时渲染剖析进一步确认。
  - 客户端构建仍有既存的大 chunk 告警，本次未处理打包拆分问题。
