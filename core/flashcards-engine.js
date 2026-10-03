// Source-Linked Student-Authored Flashcards with Fixed Leitner Spaced Repetition
// Strict rule-based Leitner schedule. No FSRS or machine-learning optimization.

import { storage } from './storage.js';

export const LEITNER_INTERVALS_DAYS = {
  1: 1,   // Daily
  2: 3,   // Every 3 days
  3: 7,   // Weekly
  4: 14,  // Every 2 weeks
  5: 30   // Monthly (Mastered)
};

export class FlashcardsEngine {
  // Get all cards
  static async getCards() {
    return await storage.getCollection('flashcards');
  }

  // Create a new card (Student-authored)
  static async createCard({ front, back, sourceId, sourceTitle, sourceUrl, pageLocator, tags = [] }) {
    if (!front || !back) {
      throw new Error('Front question and back answer are required.');
    }

    const card = {
      id: 'card_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      front: front.trim(),
      back: back.trim(),
      sourceId: sourceId || null,
      sourceTitle: sourceTitle || null,
      sourceUrl: sourceUrl || null,
      pageLocator: pageLocator || null,
      tags: Array.isArray(tags) ? tags : [],
      box: 1, // Start in Leitner Box 1
      nextReviewDate: new Date().toISOString(), // Due immediately
      lastReviewedDate: null,
      reviewCount: 0,
      createdAt: new Date().toISOString()
    };

    return await storage.addItem('flashcards', card);
  }

  // Record a review result (Leitner box transition)
  static async recordReview(cardId, isCorrect) {
    const cards = await this.getCards();
    const card = cards.find(c => c.id === cardId);
    if (!card) throw new Error('Card not found.');

    const now = new Date();
    let newBox = card.box;

    if (isCorrect) {
      newBox = Math.min(5, card.box + 1); // Promote
    } else {
      newBox = 1; // Demote back to Box 1 for relearning
    }

    const intervalDays = LEITNER_INTERVALS_DAYS[newBox];
    const nextDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

    const updates = {
      box: newBox,
      lastReviewedDate: now.toISOString(),
      nextReviewDate: nextDate.toISOString(),
      reviewCount: (card.reviewCount || 0) + 1
    };

    return await storage.updateItem('flashcards', cardId, updates);
  }

  // Get cards due for review
  static async getDueCards() {
    const cards = await this.getCards();
    const nowIso = new Date().toISOString();
    return cards.filter(c => !c.nextReviewDate || c.nextReviewDate <= nowIso);
  }

  // Get statistics by Leitner box
  static async getBoxStats() {
    const cards = await this.getCards();
    const stats = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, total: cards.length, dueToday: 0 };
    const nowIso = new Date().toISOString();

    cards.forEach(c => {
      const b = c.box || 1;
      stats[b] = (stats[b] || 0) + 1;
      if (!c.nextReviewDate || c.nextReviewDate <= nowIso) {
        stats.dueToday++;
      }
    });

    return stats;
  }

  // Export cards to Anki-compatible TSV format
  static async exportToAnki() {
    const cards = await this.getCards();
    const lines = [
      '#separator:tab',
      '#html:true',
      '#tags column:4',
      '#columns:Front\tBack\tSource\tTags'
    ];

    for (const c of cards) {
      const front = c.front.replace(/\t/g, ' ').replace(/\n/g, '<br>');
      const back = c.back.replace(/\t/g, ' ').replace(/\n/g, '<br>');
      const source = (c.sourceTitle ? `${c.sourceTitle} (${c.pageLocator || c.sourceUrl || ''})` : '').replace(/\t/g, ' ');
      const tags = (c.tags || []).join(' ');

      lines.push(`${front}\t${back}\t${source}\t${tags}`);
    }

    return lines.join('\n');
  }
}
