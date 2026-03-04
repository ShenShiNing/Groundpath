import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import type { HttpTestBody } from '@tests/helpers/http';

const { authenticateMock, conversationServiceMock, messageServiceMock, chatServiceMock } =
  vi.hoisted(() => {
    const authenticate: RequestHandler = (req, res, next) => {
      const authHeader = req.headers.authorization;
      const isAuthorized =
        (typeof authHeader === 'string' &&
          authHeader.replace(/^Bearer\s+/i, '') === 'valid-access') ||
        (Array.isArray(authHeader) &&
          authHeader.some((value) => value.replace(/^Bearer\s+/i, '') === 'valid-access'));

      if (isAuthorized) {
        req.user = {
          sub: 'user-1',
          sid: 'sid-1',
          email: 'user-1@example.com',
          username: 'user1',
          status: 'active',
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

    return {
      authenticateMock: vi.fn(authenticate),
      conversationServiceMock: {
        create: vi.fn(async (_userId: string, payload: Record<string, unknown>) => ({
          id: 'conv-1',
          title: payload.title ?? 'new chat',
          knowledgeBaseId: payload.knowledgeBaseId ?? null,
        })),
        list: vi.fn(async () => ({
          items: [{ id: 'conv-1', title: 'new chat' }],
          pagination: { limit: 20, offset: 0, total: 1 },
        })),
        search: vi.fn(async () => ({
          items: [{ id: 'conv-1', title: 'match' }],
          pagination: { limit: 20, offset: 0, total: 1 },
        })),
        getById: vi.fn(async () => ({
          id: 'conv-1',
          title: 'chat title',
          knowledgeBaseId: null,
        })),
        updateTitle: vi.fn(async (_userId: string, id: string, title: string) => ({ id, title })),
        delete: vi.fn(async () => undefined),
        validateOwnership: vi.fn(async () => undefined),
      },
      messageServiceMock: {
        getByConversation: vi.fn(async () => ({
          items: [{ id: 'msg-1', role: 'user', content: 'hello' }],
          pagination: { limit: 50, offset: 0, total: 1 },
        })),
      },
      chatServiceMock: {
        sendMessageWithSSE: vi.fn(async (res: express.Response) => {
          res.status(200).json({
            success: true,
            data: { done: true, route: 'send-message' },
          });
        }),
      },
    };
  });

vi.mock('@shared/middleware', () => ({
  authenticate: authenticateMock,
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

describe('chat.routes http behavior', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/chat', chatRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to get test server address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject unauthenticated list conversations request', async () => {
    const response = await fetch(`${baseUrl}/chat/conversations`);
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(conversationServiceMock.list).not.toHaveBeenCalled();
  });

  it('should validate create conversation payload', async () => {
    const response = await fetch(`${baseUrl}/chat/conversations`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ knowledgeBaseId: 'not-a-uuid' }),
    });
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(conversationServiceMock.create).not.toHaveBeenCalled();
  });

  it('should create conversation with valid payload', async () => {
    const response = await fetch(`${baseUrl}/chat/conversations`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'New Chat' }),
    });
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(conversationServiceMock.create).toHaveBeenCalledTimes(1);
  });

  it('should validate list conversations query limit', async () => {
    const response = await fetch(`${baseUrl}/chat/conversations?limit=0`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(conversationServiceMock.list).not.toHaveBeenCalled();
  });

  it('should validate search query length', async () => {
    const response = await fetch(`${baseUrl}/chat/conversations/search?query=a`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(conversationServiceMock.search).not.toHaveBeenCalled();
  });

  it('should get conversation detail with messages for valid id', async () => {
    const response = await fetch(`${baseUrl}/chat/conversations/conv-1`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(conversationServiceMock.getById).toHaveBeenCalledWith('user-1', 'conv-1');
    expect(messageServiceMock.getByConversation).toHaveBeenCalledWith('conv-1');
  });

  it('should validate update title payload', async () => {
    const response = await fetch(`${baseUrl}/chat/conversations/conv-1`, {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: '' }),
    });
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(conversationServiceMock.updateTitle).not.toHaveBeenCalled();
  });

  it('should delete conversation with valid request', async () => {
    const response = await fetch(`${baseUrl}/chat/conversations/conv-1`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer valid-access' },
    });
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(conversationServiceMock.delete).toHaveBeenCalledWith('user-1', 'conv-1');
  });

  it('should validate send message payload', async () => {
    const response = await fetch(`${baseUrl}/chat/conversations/conv-1/messages`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ content: '' }),
    });
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(conversationServiceMock.validateOwnership).not.toHaveBeenCalled();
    expect(chatServiceMock.sendMessageWithSSE).not.toHaveBeenCalled();
  });

  it('should send message for valid payload', async () => {
    const response = await fetch(`${baseUrl}/chat/conversations/conv-1/messages`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: 'hello',
        documentIds: ['123e4567-e89b-12d3-a456-426614174000'],
      }),
    });
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(conversationServiceMock.validateOwnership).toHaveBeenCalledWith('user-1', 'conv-1');
    expect(chatServiceMock.sendMessageWithSSE).toHaveBeenCalledTimes(1);
  });

  it('should validate list messages query', async () => {
    const response = await fetch(`${baseUrl}/chat/conversations/conv-1/messages?offset=-1`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(messageServiceMock.getByConversation).not.toHaveBeenCalled();
  });

  it('should list messages for valid query', async () => {
    const response = await fetch(
      `${baseUrl}/chat/conversations/conv-1/messages?limit=20&offset=0`,
      {
        headers: { authorization: 'Bearer valid-access' },
      }
    );
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(conversationServiceMock.validateOwnership).toHaveBeenCalledWith('user-1', 'conv-1');
    expect(messageServiceMock.getByConversation).toHaveBeenCalledWith('conv-1', {
      limit: 20,
      offset: 0,
    });
  });
});
