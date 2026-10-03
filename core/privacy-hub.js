// Privacy, Network Disclosure & Local Data Hub
// Transparent accounting of local storage, network requests, and AI-free guarantees.

import { storage } from './storage.js';

export class PrivacyHub {
  static async getSummary() {
    const bytesInUse = await storage.getStorageUsage();
    const sources = await storage.getCollection('sources');
    const assignments = await storage.getCollection('assignments');
    const clips = await storage.getCollection('clips');
    const notes = await storage.getCollection('notes');
    const flashcards = await storage.getCollection('flashcards');

    return {
      storageUsedBytes: bytesInUse,
      storageUsedKb: (bytesInUse / 1024).toFixed(1),
      localCounts: {
        sources: sources.length,
        assignments: assignments.length,
        clips: clips.length,
        notes: notes.length,
        flashcards: flashcards.length
      },
      guarantees: [
        'AI-Free by Construction: Zero LLM, generative AI, neural network, or vector search calls.',
        'Zero Document Upload: DOCX files and paper text are processed strictly in-browser memory.',
        'Deterministic Lookups: Only raw bibliographic IDs (DOI/PMID) are queried via Crossref and PubMed.',
        'Local Data Ownership: All notes, appraisal matrix entries, and flashcards remain on your device.'
      ],
      externalEndpoints: [
        {
          service: 'Crossref Public REST API',
          url: 'https://api.crossref.org/works/{doi}',
          dataSent: 'Specific DOI string requested by user',
          purpose: 'Fetch title, author, year, journal, and update/retraction record'
        },
        {
          service: 'NCBI PubMed E-Utilities',
          url: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
          dataSent: 'Specific PMID string requested by user',
          purpose: 'Fetch article bibliographic metadata and publication type'
        }
      ]
    };
  }

  // Clear all cached network lookups
  static async clearNetworkCache() {
    const allData = await storage.get(null);
    const keysToRemove = Object.keys(allData).filter(k => k.startsWith('cache_meta_'));
    await storage.remove(keysToRemove);
    return keysToRemove.length;
  }
}
