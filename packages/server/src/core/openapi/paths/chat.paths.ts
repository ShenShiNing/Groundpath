import { z } from '@groundpath/shared/schemas';
import {
  createConversationSchema,
  updateConversationSchema,
  sendMessageSchema,
  listConversationsSchema,
  listMessagesSchema,
  searchConversationsSchema,
  conversationInfoSchema,
  conversationListResponseSchema,
  conversationSearchResponseSchema,
  conversationWithMessagesSchema,
  messageInfoSchema,
} from '@groundpath/shared/schemas';
import { errorResponse, messageResponse, successResponse } from '../registry';
import { defineOpenApiOperations } from '../route-metadata';

export const chatOpenApiOperations = defineOpenApiOperations({
  'POST /api/chat/conversations': {
    summary: '创建会话',
    request: { body: { content: { 'application/json': { schema: createConversationSchema } } } },
    responses: { 201: successResponse(conversationInfoSchema, '会话创建成功'), 400: errorResponse },
  },
  'GET /api/chat/conversations': {
    summary: '列出会话',
    request: { query: listConversationsSchema },
    responses: { 200: successResponse(conversationListResponseSchema, '会话列表') },
  },
  'GET /api/chat/conversations/search': {
    summary: '搜索会话',
    request: { query: searchConversationsSchema },
    responses: { 200: successResponse(conversationSearchResponseSchema, '搜索结果') },
  },
  'GET /api/chat/conversations/{id}': {
    summary: '获取会话详情',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: successResponse(conversationWithMessagesSchema, '会话详情'),
      404: errorResponse,
    },
  },
  'PATCH /api/chat/conversations/{id}': {
    summary: '更新会话',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: updateConversationSchema } } },
    },
    responses: { 200: successResponse(conversationInfoSchema, '会话更新成功'), 404: errorResponse },
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
    responses: { 200: successResponse(z.array(messageInfoSchema), '消息列表'), 404: errorResponse },
  },
});
