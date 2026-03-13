import { eq } from 'drizzle-orm';
import { db } from '@core/db';
import {
  llmConfigs,
  type LLMConfig,
  type NewLLMConfig,
} from '@core/db/schema/ai/llm-configs.schema';

export const llmConfigRepository = {
  /**
   * Create a new LLM config
   */
  async create(data: NewLLMConfig): Promise<LLMConfig> {
    await db.insert(llmConfigs).values(data);
    const result = await db.select().from(llmConfigs).where(eq(llmConfigs.id, data.id)).limit(1);
    return result[0]!;
  },

  /**
   * Find LLM config by user ID
   */
  async findByUserId(userId: string): Promise<LLMConfig | undefined> {
    const result = await db.select().from(llmConfigs).where(eq(llmConfigs.userId, userId)).limit(1);
    return result[0];
  },

  /**
   * Update LLM config by user ID
   */
  async updateByUserId(
    userId: string,
    data: Partial<Omit<LLMConfig, 'id' | 'userId' | 'createdAt'>>
  ): Promise<LLMConfig | undefined> {
    await db.update(llmConfigs).set(data).where(eq(llmConfigs.userId, userId));
    return this.findByUserId(userId);
  },

  /**
   * Delete LLM config by user ID
   */
  async deleteByUserId(userId: string): Promise<void> {
    await db.delete(llmConfigs).where(eq(llmConfigs.userId, userId));
  },
};
