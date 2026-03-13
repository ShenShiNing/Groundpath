import { z } from '@knowledge-agent/shared/schemas';
import {
  createConversationSchema,
  updateConversationSchema,
  sendMessageSchema,
  listConversationsSchema,
  listMessagesSchema,
  searchConversationsSchema,
} from '@knowledge-agent/shared/schemas';
import { errorResponse, messageResponse, successResponse } from '../registry';
import { defineOpenApiOperations } from '../route-metadata';

const conversationItem = z.object({
  id: z.string(),
  title: z.string().nullable(),
  knowledgeBaseId: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  createdAt: z.string(),
});

const messageItem = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  metadata: z.unknown().nullable(),
  createdAt: z.string(),
});

export const chatOpenApiOperations = defineOpenApiOperations({
  'POST /api/chat/conversations': {
    summary: '创建会话',
    request: { body: { content: { 'application/json': { schema: createConversationSchema } } } },
    responses: { 201: successResponse(conversationItem, '会话创建成功'), 400: errorResponse },
  },
  'GET /api/chat/conversations': {
    summary: '列出会话',
    request: { query: listConversationsSchema },
    responses: { 200: successResponse(z.array(conversationItem), '会话列表') },
  },
  'GET /api/chat/conversations/search': {
    summary: '搜索会话',
    request: { query: searchConversationsSchema },
    responses: { 200: successResponse(z.array(conversationItem), '搜索结果') },
  },
  'GET /api/chat/conversations/{id}': {
    summary: '获取会话详情',
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: successResponse(conversationItem, '会话详情'), 404: errorResponse },
  },
  'PATCH /api/chat/conversations/{id}': {
    summary: '更新会话',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: updateConversationSchema } } },
    },
    responses: { 200: successResponse(conversationItem, '会话更新成功'), 404: errorResponse },
  },
  'DELETE /api/chat/conversations/{id}': {
    summary: '删除会话',
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: messageResponse('会话已删除'), 404: errorResponse },
  },
  'POST /api/chat/conversations/{id}/messages': {
    summary: '发送消息（SSE 流式响应）',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: sendMessageSchema } } },
    },
    responses: { 200: { description: 'SSE 事件流（AI 回复）' }, 404: errorResponse },
  },
  'GET /api/chat/conversations/{id}/messages': {
    summary: '获取消息列表',
    request: {
      params: z.object({ id: z.string() }),
      query: listMessagesSchema,
    },
    responses: { 200: successResponse(z.array(messageItem), '消息列表'), 404: errorResponse },
  },
});
