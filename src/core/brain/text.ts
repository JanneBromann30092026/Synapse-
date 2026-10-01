import { sha256Hex } from '../hash';

/** What the embedding of a card is computed from. */
export interface EmbeddableCard {
  front: string;
  back: string;
  notes?: string;
}

/** "<front> — <back>" plus " (<notes>)" when the card has notes. */
export function embeddingText(card: EmbeddableCard): string {
  const base = `${card.front.trim()} — ${card.back.trim()}`;
  const notes = card.notes?.trim();
  return notes ? `${base} (${notes})` : base;
}

/** SHA-256 of the embedding text; an embedding is current when model and hash match. */
export function embeddingTextHash(card: EmbeddableCard): string {
  return sha256Hex(embeddingText(card));
}
