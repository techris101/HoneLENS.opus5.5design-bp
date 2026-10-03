// Bibliographic Metadata & Retraction Resolver
// Pure metadata requests to public APIs (Crossref & PubMed E-utilities). Zero AI.

import { storage } from './storage.js';

export class MetadataResolver {
  constructor() {
    this.cachePrefix = 'cache_meta_';
  }

  // Extract clean DOI from text or URL
  static parseDOI(input) {
    if (!input) return null;
    const doiRegex = /\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)\b/;
    const match = input.match(doiRegex);
    return match ? match[1].replace(/[.,;)]+$/, '') : null;
  }

  // Extract clean PMID from text or URL
  static parsePMID(input) {
    if (!input) return null;
    const pmidRegex = /\b(\d{7,9})\b/;
    // Check if URL contains pubmed/
    const urlMatch = input.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
    if (urlMatch) return urlMatch[1];
    const match = input.match(pmidRegex);
    return match ? match[1] : null;
  }

  // Fetch Crossref metadata by DOI with explicit network disclosure
  async fetchCrossref(doi) {
    const cleanDoi = MetadataResolver.parseDOI(doi);
    if (!cleanDoi) throw new Error('Invalid DOI format.');

    const cacheKey = this.cachePrefix + 'doi_' + cleanDoi;
    const cached = await storage.get([cacheKey]);
    if (cached[cacheKey]) {
      return { ...cached[cacheKey], fromCache: true };
    }

    const endpoint = `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`;
    const disclosure = {
      service: 'Crossref Public API',
      url: endpoint,
      dataSent: cleanDoi,
      timestamp: new Date().toISOString()
    };

    try {
      const response = await fetch(endpoint, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'HoneLENS-NursingResearchTool/1.0 (mailto:support@honenurse.com)'
        }
      });

      if (!response.ok) {
        throw new Error(`Crossref returned HTTP ${response.status}`);
      }

      const json = await response.json();
      const message = json.message || {};

      // Parse fields
      const title = Array.isArray(message.title) && message.title.length > 0 ? message.title[0] : 'Untitled Source';
      const authors = (message.author || []).map(a => `${a.family || ''}, ${a.given || ''}`.trim().replace(/^,|,$/g, ''));
      const journal = Array.isArray(message['container-title']) && message['container-title'].length > 0 ? message['container-title'][0] : (message.publisher || '');
      
      let year = null;
      if (message['published-print']?.['date-parts']?.[0]?.[0]) {
        year = message['published-print']['date-parts'][0][0];
      } else if (message['published-online']?.['date-parts']?.[0]?.[0]) {
        year = message['published-online']['date-parts'][0][0];
      } else if (message.created?.['date-parts']?.[0]?.[0]) {
        year = message.created['date-parts'][0][0];
      }

      const volume = message.volume || '';
      const issue = message.issue || '';
      const page = message.page || '';
      const type = message.type || 'journal-article';

      // Check Crossref update / retraction records (Crossref assertion or update-to)
      let updateRecords = [];
      if (Array.isArray(message['update-to']) && message['update-to'].length > 0) {
        updateRecords = message['update-to'].map(u => ({
          type: u.type || 'update',
          doi: u.doi,
          label: u.label || 'Update notice'
        }));
      }

      // Check if this article itself is a retraction or has retractions noted
      const isRetracted = type.includes('retraction') || 
        (message.assertion || []).some(a => (a.name || '').toLowerCase().includes('retract'));

      const result = {
        id: 'doi_' + cleanDoi,
        doi: cleanDoi,
        title,
        authors,
        year,
        journal,
        volume,
        issue,
        page,
        type,
        url: message.URL || `https://doi.org/${cleanDoi}`,
        retractionStatus: isRetracted ? 'RETRACTED' : (updateRecords.length > 0 ? 'UPDATES_FOUND' : 'NO_MATCHING_RECORD'),
        updateRecords,
        disclosure,
        retrievedAt: new Date().toISOString()
      };

      await storage.set({ [cacheKey]: result });
      return result;
    } catch (err) {
      throw new Error(`Crossref lookup failed: ${err.message}. Network disclosure: sent '${cleanDoi}' to ${endpoint}`);
    }
  }

  // Fetch PubMed metadata by PMID with explicit network disclosure
  async fetchPubMed(pmid) {
    const cleanPmid = MetadataResolver.parsePMID(pmid);
    if (!cleanPmid) throw new Error('Invalid PMID format.');

    const cacheKey = this.cachePrefix + 'pmid_' + cleanPmid;
    const cached = await storage.get([cacheKey]);
    if (cached[cacheKey]) {
      return { ...cached[cacheKey], fromCache: true };
    }

    const endpoint = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${cleanPmid}&retmode=json`;
    const disclosure = {
      service: 'NCBI PubMed E-Utilities',
      url: endpoint,
      dataSent: cleanPmid,
      timestamp: new Date().toISOString()
    };

    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`PubMed API returned HTTP ${response.status}`);

      const json = await response.json();
      const doc = json.result?.[cleanPmid];
      if (!doc) throw new Error(`No PubMed record found for PMID ${cleanPmid}`);

      const title = doc.title || 'Untitled Source';
      const authors = (doc.authors || []).map(a => a.name);
      const journal = doc.source || '';
      let year = null;
      if (doc.pubdate) {
        const m = doc.pubdate.match(/\b(19\d\d|20\d\d)\b/);
        if (m) year = parseInt(m[1], 10);
      }
      const volume = doc.volume || '';
      const issue = doc.issue || '';
      const page = doc.pages || '';
      
      // Look for DOI in articleids
      let doi = null;
      if (Array.isArray(doc.articleids)) {
        const doiEntry = doc.articleids.find(id => id.idtype === 'doi');
        if (doiEntry) doi = doiEntry.value;
      }

      // Check pubtypes for retraction notices or reviews
      const pubtypes = doc.pubtype || [];
      const isRetracted = pubtypes.some(t => t.toLowerCase().includes('retracted') || t.toLowerCase().includes('retraction of publication'));

      const result = {
        id: 'pmid_' + cleanPmid,
        pmid: cleanPmid,
        doi,
        title,
        authors,
        year,
        journal,
        volume,
        issue,
        page,
        type: pubtypes.join(', ') || 'Journal Article',
        url: `https://pubmed.ncbi.nlm.nih.gov/${cleanPmid}/`,
        retractionStatus: isRetracted ? 'RETRACTED' : 'NO_MATCHING_RECORD',
        disclosure,
        retrievedAt: new Date().toISOString()
      };

      await storage.set({ [cacheKey]: result });
      return result;
    } catch (err) {
      throw new Error(`PubMed lookup failed: ${err.message}. Network disclosure: sent '${cleanPmid}' to ${endpoint}`);
    }
  }

  // Parse HTML metadata from document
  static extractPageMeta(doc = document) {
    const getMeta = (names) => {
      for (const name of names) {
        const el = doc.querySelector(`meta[name="${name}" i], meta[property="${name}" i]`);
        if (el && el.content) return el.content.trim();
      }
      return null;
    };

    const getAllMeta = (names) => {
      const results = [];
      for (const name of names) {
        const els = doc.querySelectorAll(`meta[name="${name}" i], meta[property="${name}" i]`);
        els.forEach(el => {
          if (el.content && el.content.trim()) results.push(el.content.trim());
        });
      }
      return results;
    };

    const title = getMeta(['citation_title', 'dc.title', 'og:title', 'twitter:title']) || doc.title || '';
    const authors = getAllMeta(['citation_author', 'dc.creator', 'author']);
    const dateStr = getMeta(['citation_date', 'citation_publication_date', 'dc.date', 'article:published_time']);
    let year = null;
    if (dateStr) {
      const ym = dateStr.match(/\b(19\d\d|20\d\d)\b/);
      if (ym) year = parseInt(ym[1], 10);
    }
    const journal = getMeta(['citation_journal_title', 'dc.source', 'og:site_name']) || '';
    const doi = getMeta(['citation_doi', 'dc.identifier']) || MetadataResolver.parseDOI(doc.location?.href || '');
    const pmid = getMeta(['citation_pmid']) || MetadataResolver.parsePMID(doc.location?.href || '');

    return {
      title,
      authors: authors.length > 0 ? authors : [],
      year,
      journal,
      doi: doi ? MetadataResolver.parseDOI(doi) : null,
      pmid: pmid ? MetadataResolver.parsePMID(pmid) : null,
      url: doc.location?.href || '',
      retrievedAt: new Date().toISOString()
    };
  }
}

export const metadataResolver = new MetadataResolver();
