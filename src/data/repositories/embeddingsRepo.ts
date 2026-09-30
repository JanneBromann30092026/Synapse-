import { db } from '../db';
import type { CardEmbedding } from '../types';

/** Skeleton; filled in step 12 (local embeddings). */
export const embeddingsRepo = {
  async get(cardId: string): Promise<CardEmbedding | undefined> {
    return db.cardEmbeddings.get(cardId);
  },

  async put(embedding: CardEmbedding): Promise<void> {
    await db.cardEmbeddings.put(embedding);
  },
};
