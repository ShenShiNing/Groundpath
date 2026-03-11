import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import { startTestServer, stopTestServer } from './helpers/e2e.helpers';

const { authenticateMock, conversationServiceMock, messageServiceMock, chatServiceMock } =
  vi.hoisted(() => {
    const authenticate: RequestHandler = (req, res, next) => {
      if (req.headers.authorization === 'Bearer valid-access') {
        req.user = {
          sub: 'user-1',
          sid: 'sid-1',
          email: 'user@example.com',
          username: 'user1',
          status: 'active' as const,
          emailVerified: true,
        };
        next();
        return;
      }
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid access token' },
      });
    };

    let convCounter = 0;
    const conversations = new Map<string, { id: string; title: string; deleted: boolean }>();
    const messages = new Map<string, Array<{ id: string; role: string; content: string }>>();

    return {
      authenticateMock: vi.fn(authenticate),
      conversationServiceMock: {
        create: vi.fn(async (_userId: string, payload: Record<string, unknown>) => {
          convCounter++;
          const conv = {
            id: `conv-${convCounter}`,
            title: (payload.title as string) ?? 'New Chat',
            deleted: false,
          };
          conversations.set(conv.id, conv);
          messages.set(conv.id, []);
          return {
            id: conv.id,
            title: conv.title,
            knowledgeBaseId: payload.knowledgeBaseId ?? null,
          };
        }),
        list: vi.fn(async () => {
          const items = Array.from(conversations.values())
            .filter((c) => !c.deleted)
            .map((c) => ({ id: c.id, title: c.title }));
          return { items, pagination: { limit: 20, offset: 0, total: items.length } };
        }),
        search: vi.fn(async () => ({
          items: [],
          pagination: { limit: 20, offset: 0, total: 0 },
        })),
        getById: vi.fn(async (_userId: string, id: string) => {
          const conv = conversations.get(id);
          if (!conv || conv.deleted) throw new Error('Not found');
          return { id: conv.id, title: conv.title, knowledgeBaseId: null };
        }),
        updateTitle: vi.fn(async (_userId: string, id: string, title: string) => {
          const conv = conversations.get(id);
          if (conv) conv.title = title;
          return { id, title };
        }),
        update: vi.fn(
          async (
            _userId: string,
            id: string,
            data: { title?: string; knowledgeBaseId?: string | null }
          ) => {
            const conv = conversations.get(id);
            if (conv && data.title) conv.title = data.title;
            return { id, title: data.title ?? conv?.title ?? '' };
          }
        ),
        delete: vi.fn(async (_userId: string, id: string) => {
          const conv = conversations.get(id);
          if (conv) conv.deleted = true;
        }),
        validateOwnership: vi.fn(async () => undefined),
      },
      messageServiceMock: {
        getByConversation: vi.fn(async (convId: string) => {
          const msgs = messages.get(convId) ?? [];
          return { items: msgs, pagination: { limit: 50, offset: 0, total: msgs.length } };
        }),
      },
      chatServiceMock: {
        sendMessageWithSSE: vi.fn(async (res: express.Response, _opts: unknown) => {
          res.status(200).json({
            success: true,
            data: { done: true, message: { id: 'msg-resp', role: 'assistant', content: 'Hello!' } },
          });
        }),
      },
    };
  });

vi.mock('@shared/middleware', () => ({
  authenticate: authenticateMock,
  aiRateLimiter: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

vi.mock('@modules/chat/services/conversation.service', () => ({
  conversationService: conversationServiceMock,
}));

vi.mock('@modules/chat/services/message.service', () => ({
  messageService: messageServiceMock,
}));

vi.mock('@modules/chat/services/chat.service', () => ({
  chatService: chatServiceMock,
}));

import chatRoutes from '@modules/chat/chat.routes';

describe('E2E Smoke: Chat Journey', () => {
  let server: Server;
  let baseUrl: string;

  // Journey state
  let conversationId: string;

  beforeAll(async () => {
    const result = await startTestServer((app) => {
      app.use('/api/chat', chatRoutes);
    });
    server = result.server;
    baseUrl = result.baseUrl;
  });

  afterAll(async () => {
    await stopTestServer(server);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Step 1: Reject unauthenticated
  it('should reject unauthenticated conversation creation', async () => {
    const response = await fetch(`${baseUrl}/api/chat/conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Test' }),
    });

    expect(response.status).toBe(401);
  });

  // Step 2: Create conversation
  it('should create a conversation', async () => {
    const response = await fetch(`${baseUrl}/api/chat/conversations`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'E2E Chat' }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    const data = body.data as Record<string, unknown>;
    conversationId = data.id as string;
    expect(conversationId).toBeDefined();
  });

  // Step 3: List conversations
  it('should list conversations', async () => {
    const response = await fetch(`${baseUrl}/api/chat/conversations`, {
      headers: { authorization: 'Bearer valid-access' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
  });

  // Step 4: Send a message
  it('should send a message to conversation', async () => {
    const response = await fetch(`${baseUrl}/api/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ content: 'Hello, AI!' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(conversationServiceMock.validateOwnership).toHaveBeenCalledWith(
      'user-1',
      conversationId
    );
    expect(chatServiceMock.sendMessageWithSSE).toHaveBeenCalledTimes(1);
  });

  // Step 5: Reject empty message
  it('should reject empty message content', async () => {
    const response = await fetch(`${baseUrl}/api/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ content: '' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    const error = body.error as Record<string, unknown>;
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  // Step 6: List messages
  it('should list messages in conversation', async () => {
    const response = await fetch(
      `${baseUrl}/api/chat/conversations/${conversationId}/messages?limit=20&offset=0`,
      { headers: { authorization: 'Bearer valid-access' } }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(messageServiceMock.getByConversation).toHaveBeenCalledWith(conversationId, {
      limit: 20,
      offset: 0,
    });
  });

  // Step 7: Update conversation title
  it('should update conversation title', async () => {
    const response = await fetch(`${baseUrl}/api/chat/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'Renamed Chat' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
  });

  // Step 8: Delete conversation
  it('should delete conversation', async () => {
    const response = await fetch(`${baseUrl}/api/chat/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer valid-access' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(conversationServiceMock.delete).toHaveBeenCalledWith('user-1', conversationId);
  });
});
