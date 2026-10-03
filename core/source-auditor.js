// Batch Source List Auditor & Duplicate Detector
// Evaluates entire bibliography/source collections against assignment rubrics.

import { CriteriaEngine } from './criteria-engine.js';
import { DocxParser } from './docx-parser.js';

export class SourceAuditor {
  // Audit a batch collection of sources
  static auditSourceBatch(sources, criteria = {}) {
    const results = {
      auditedAt: new Date().toISOString(),
      totalSources: sources.length,
      duplicateDois: [],
      duplicatePmids: [],
      candidateDuplicateTitles: [],
      missingFields: [],
      retractionFlags: [],
      dateViolations: [],
      sourceEvaluations: []
    };

    const doiMap = new Map();
    const pmidMap = new Map();

    sources.forEach((src, idx) => {
      // 1. Check duplicate identifiers
      if (src.doi) {
        const normDoi = src.doi.toLowerCase().trim();
        if (doiMap.has(normDoi)) {
          results.duplicateDois.push({
            doi: src.doi,
            firstIndex: doiMap.get(normDoi),
            secondIndex: idx,
            titleA: sources[doiMap.get(normDoi)].title,
            titleB: src.title
          });
        } else {
          doiMap.set(normDoi, idx);
        }
      }

      if (src.pmid) {
        const normPmid = src.pmid.trim();
        if (pmidMap.has(normPmid)) {
          results.duplicatePmids.push({
            pmid: src.pmid,
            firstIndex: pmidMap.get(normPmid),
            secondIndex: idx,
            titleA: sources[pmidMap.get(normPmid)].title,
            titleB: src.title
          });
        } else {
          pmidMap.set(normPmid, idx);
        }
      }

      // 2. Check candidate duplicate titles (Token comparison)
      for (let j = idx + 1; j < sources.length; j++) {
        const other = sources[j];
        if (this.areTitlesSimilar(src.title, other.title)) {
          results.candidateDuplicateTitles.push({
            indexA: idx,
            indexB: j,
            titleA: src.title,
            titleB: other.title,
            label: 'Candidate duplicate—confirm with authors and year'
          });
        }
      }

      // 3. Check missing fields
      const missing = [];
      if (!src.title) missing.push('Title');
      if (!src.authors || src.authors.length === 0) missing.push('Authors');
      if (!src.year) missing.push('Publication Year');
      if (!src.journal && !src.publisher) missing.push('Journal / Publisher');
      if (!src.doi && !src.url) missing.push('DOI or URL');

      if (missing.length > 0) {
        results.missingFields.push({
          sourceIndex: idx,
          title: src.title || 'Untitled',
          missing
        });
      }

      // 4. Check retraction status
      if (src.retractionStatus === 'RETRACTED') {
        results.retractionFlags.push({
          sourceIndex: idx,
          title: src.title,
          doi: src.doi,
          type: 'Retraction notice found',
          severity: 'DANGER'
        });
      } else if (src.retractionStatus === 'UPDATES_FOUND') {
        results.retractionFlags.push({
          sourceIndex: idx,
          title: src.title,
          doi: src.doi,
          type: 'Update / Erratum found',
          severity: 'CAUTION'
        });
      }

      // 5. Evaluate against criteria
      const evalRes = CriteriaEngine.evaluateSource(src, criteria);
      results.sourceEvaluations.push({
        sourceIndex: idx,
        source: src,
        evaluation: evalRes
      });

      const dateEval = evalRes.results.find(r => r.criterion === 'Publication Date Window');
      if (dateEval && dateEval.status === 'does_not_match') {
        results.dateViolations.push({
          sourceIndex: idx,
          title: src.title,
          year: src.year,
          detail: dateEval.actual
        });
      }
    });

    results.hasIssues = results.duplicateDois.length > 0 ||
      results.duplicatePmids.length > 0 ||
      results.candidateDuplicateTitles.length > 0 ||
      results.missingFields.length > 0 ||
      results.retractionFlags.length > 0 ||
      results.dateViolations.length > 0;

    return results;
  }

  // Token-based title similarity check (no ML/embeddings)
  static areTitlesSimilar(titleA, titleB) {
    if (!titleA || !titleB) return false;
    const cleanA = titleA.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const cleanB = titleB.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (cleanA === cleanB && cleanA.length > 10) return true;

    const tokensA = new Set(cleanA.split(/\s+/).filter(w => w.length > 3));
    const tokensB = new Set(cleanB.split(/\s+/).filter(w => w.length > 3));

    if (tokensA.size === 0 || tokensB.size === 0) return false;

    let overlap = 0;
    for (const token of tokensA) {
      if (tokensB.has(token)) overlap++;
    }

    const similarity = (2 * overlap) / (tokensA.size + tokensB.size);
    return similarity > 0.85; // High confidence literal token overlap
  }

  // Run full manuscript audit
  static async auditManuscriptFile(arrayBuffer, options = {}) {
    return await DocxParser.auditDocx(arrayBuffer, options);
  }
}
