// Versioned HonePack Portability & Local Backup System
// Clean, portable JSON export/import compatible with the HoneNurse product ecosystem.

import { storage } from './storage.js';

export const HONEPACK_SCHEMA_VERSION = '1.0.0';

export class HonePack {
  // Generate a full portable HonePack backup
  static async exportBackup() {
    const collections = [
      'sources',
      'assignments',
      'clips',
      'notes',
      'flashcards',
      'examHistory',
      'captures',
      'rubricProfiles'
    ];

    const data = {};
    for (const col of collections) {
      data[col] = await storage.getCollection(col);
    }

    const pack = {
      format: 'HonePack',
      version: HONEPACK_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      sourceTool: 'HoneLENS Chrome Extension',
      summary: {
        sourcesCount: data.sources.length,
        assignmentsCount: data.assignments.length,
        flashcardsCount: data.flashcards.length,
        notesCount: data.notes.length
      },
      data
    };

    return JSON.stringify(pack, null, 2);
  }

  // Restore data from HonePack JSON string
  static async restoreBackup(jsonString, mode = 'merge') {
    let pack;
    try {
      pack = JSON.parse(jsonString);
    } catch (e) {
      throw new Error('Invalid JSON format in HonePack file.');
    }

    if (!pack.format || pack.format !== 'HonePack') {
      throw new Error('Unrecognized package format. Must be a valid HonePack file.');
    }

    const incoming = pack.data || {};
    const collections = [
      'sources',
      'assignments',
      'clips',
      'notes',
      'flashcards',
      'examHistory',
      'captures',
      'rubricProfiles'
    ];

    const restoreCounts = {};

    for (const col of collections) {
      const incomingItems = Array.isArray(incoming[col]) ? incoming[col] : [];
      if (mode === 'overwrite') {
        await storage.saveCollection(col, incomingItems);
        restoreCounts[col] = incomingItems.length;
      } else {
        // Merge: avoid duplicate IDs
        const existing = await storage.getCollection(col);
        const existingIds = new Set(existing.map(x => x.id));
        const toAdd = incomingItems.filter(x => !existingIds.has(x.id));
        const merged = [...existing, ...toAdd];
        await storage.saveCollection(col, merged);
        restoreCounts[col] = toAdd.length;
      }
    }

    return {
      success: true,
      mode,
      version: pack.version,
      exportedAt: pack.exportedAt,
      restoredItems: restoreCounts
    };
  }
}
