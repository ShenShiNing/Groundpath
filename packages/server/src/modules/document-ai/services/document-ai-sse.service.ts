/**
 * Document AI SSE Service
 * Provides Server-Sent Events utilities with heartbeat support
 */

import type { Response } from 'express';
import { createLogger } from '@core/logger';
import { documentAIConfig } from '@config/env';

const logger = createLogger('document-ai-sse');

const HEARTBEAT_INTERVAL_MS = documentAIConfig.heartbeatIntervalMs;

export interface SSEEvent {
  type: 'chunk' | 'done' | 'error' | 'heartbeat';
  data: unknown;
}

export interface SSEContext {
  res: Response;
  abortController: AbortController;
  heartbeatTimer: NodeJS.Timeout | null;
  isAborted: boolean;
  operationId?: string;
}

export const documentAiSseService = {
  /**
   * Initialize SSE connection with proper headers and heartbeat
   */
  initSSE(res: Response, operationId?: string): SSEContext {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    const abortController = new AbortController();
    const context: SSEContext = {
      res,
      abortController,
      heartbeatTimer: null,
      isAborted: false,
      operationId,
    };

    // Handle client disconnect
    const onClose = () => {
      context.isAborted = true;
      abortController.abort();
      this.cleanup(context);
      logger.info({ operationId }, 'SSE client disconnected');
    };

    res.on('close', onClose);
    res.on('error', onClose);

    // Start heartbeat to keep connection alive
    context.heartbeatTimer = setInterval(() => {
      if (!context.isAborted) {
        this.sendEvent(context, {
          type: 'heartbeat',
          data: { timestamp: Date.now() },
        });
      }
    }, HEARTBEAT_INTERVAL_MS);

    logger.debug({ operationId }, 'SSE connection initialized');

    return context;
  },

  /**
   * Send an SSE event to the client
   */
  sendEvent(context: SSEContext, event: SSEEvent): boolean {
    if (context.isAborted) {
      return false;
    }

    try {
      const data = JSON.stringify(event);
      context.res.write(`data: ${data}\n\n`);
      return true;
    } catch (error) {
      // Connection may have been closed
      logger.warn({ error, operationId: context.operationId }, 'Failed to send SSE event');
      context.isAborted = true;
      return false;
    }
  },

  /**
   * Send a chunk of generated content
   */
  sendChunk(context: SSEContext, chunk: string): boolean {
    return this.sendEvent(context, { type: 'chunk', data: chunk });
  },

  /**
   * Send completion event with metadata
   */
  sendDone(context: SSEContext, metadata: { wordCount: number; generatedAt: string }): boolean {
    return this.sendEvent(context, { type: 'done', data: metadata });
  },

  /**
   * Send error event
   */
  sendError(context: SSEContext, code: string, message: string): boolean {
    return this.sendEvent(context, { type: 'error', data: { code, message } });
  },

  /**
   * Clean up resources (stop heartbeat timer)
   */
  cleanup(context: SSEContext): void {
    if (context.heartbeatTimer) {
      clearInterval(context.heartbeatTimer);
      context.heartbeatTimer = null;
    }
  },

  /**
   * End SSE connection properly
   */
  end(context: SSEContext, finalEvent?: SSEEvent): void {
    if (finalEvent && !context.isAborted) {
      this.sendEvent(context, finalEvent);
    }

    this.cleanup(context);

    if (!context.isAborted) {
      try {
        context.res.end();
      } catch {
        // Ignore errors when ending
      }
    }

    logger.debug({ operationId: context.operationId }, 'SSE connection ended');
  },

  /**
   * Check if client is still connected
   */
  isConnected(context: SSEContext): boolean {
    return !context.isAborted;
  },

  /**
   * Get abort signal for passing to async operations
   */
  getSignal(context: SSEContext): AbortSignal {
    return context.abortController.signal;
  },
};
