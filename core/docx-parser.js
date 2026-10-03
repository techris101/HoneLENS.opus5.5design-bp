// Local DOCX Manuscript & Citation Auditor
// Parses .docx XML locally on-device. Zero upload. Strict rule-based checking.

import { MiniZip } from './minizip.js';

export const ISMP_DO_NOT_USE = [
  { pattern: /\bU\b/g, code: 'U', rationale: 'Mistaken for 0 (zero), the number 4, or cc.', replacement: 'Write "unit".' },
  { pattern: /\bIU\b/g, code: 'IU', rationale: 'Mistaken for IV (intravenous) or the number 10.', replacement: 'Write "International Unit".' },
  { pattern: /\bQ\.?D\.?\b/gi, code: 'Q.D.', rationale: 'Mistaken for Q.O.D. (every other day) if period is missed.', replacement: 'Write "daily".' },
  { pattern: /\bQ\.?O\.?D\.?\b/gi, code: 'Q.O.D.', rationale: 'Mistaken for Q.D. (daily) if "O" is poorly written.', replacement: 'Write "every other day".' },
  { pattern: /\b\d+\.0\s*(?:mg|g|mcg|mL|units?)\b/gi, code: 'Trailing Zero (X.0)', rationale: 'Decimal point may be overlooked, resulting in a 10-fold overdose.', replacement: 'Never use a trailing zero for medication doses (e.g., write 5 mg, not 5.0 mg).' },
  { pattern: /(?:^|[^\d])\.\d+\s*(?:mg|g|mcg|mL|units?)\b/gi, code: 'Lack of Leading Zero (.X)', rationale: 'Decimal point may be overlooked, resulting in a 10-fold overdose.', replacement: 'Always use a leading zero (e.g., write 0.5 mg, not .5 mg).' },
  { pattern: /\b(?:MS|MSO4)\b/g, code: 'MS / MSO4', rationale: 'Confused with MgSO4 (magnesium sulfate).', replacement: 'Write "morphine sulfate".' },
  { pattern: /\bMgSO4\b/g, code: 'MgSO4', rationale: 'Confused with morphine sulfate.', replacement: 'Write "magnesium sulfate".' },
  { pattern: /\bcc\b/gi, code: 'cc', rationale: 'Mistaken for U (units) when poorly written.', replacement: 'Write "mL" or "milliliters".' }
];

export class DocxParser {
  // Parse docx file buffer locally
  static async auditDocx(arrayBuffer, options = {}) {
    const files = await MiniZip.readZip(arrayBuffer);
    const docXmlBytes = files['word/document.xml'];
    if (!docXmlBytes) {
      throw new Error('Invalid DOCX file: word/document.xml not found.');
    }

    const xmlText = new TextDecoder('utf-8').decode(docXmlBytes);
    const paragraphs = this.extractParagraphs(xmlText);
    const fullText = paragraphs.join('\n');

    // Split body and References section
    const refIndex = paragraphs.findIndex(p => /^(references|reference list|works cited|bibliography)$/i.test(p.trim()));
    const bodyParagraphs = refIndex !== -1 ? paragraphs.slice(0, refIndex) : paragraphs;
    const refParagraphs = refIndex !== -1 ? paragraphs.slice(refIndex + 1) : [];

    // 1. Extract In-Text Citations
    const inTextCitations = this.extractInTextCitations(bodyParagraphs);

    // 2. Parse References
    const parsedReferences = this.parseReferencesList(refParagraphs);

    // 3. Match In-Text Citations to Reference Entries
    const matchedAnalysis = this.crossMatchCitations(inTextCitations, parsedReferences);

    // 4. APA 7 Compliance Checks on References
    const apaFormatIssues = this.checkApaFormatting(parsedReferences);

    // 5. Date Window Verification
    const dateIssues = this.checkDateWindows(parsedReferences, options.dateWindow || 5);

    // 6. ISMP "Do Not Use" Abbreviations Scan
    const abbreviationIssues = this.scanAbbreviations(fullText, options.customAbbreviations || []);

    return {
      fileName: options.fileName || 'manuscript.docx',
      analyzedAt: new Date().toISOString(),
      paragraphCount: paragraphs.length,
      hasReferencesSection: refIndex !== -1,
      inTextCitationCount: inTextCitations.length,
      referenceEntryCount: parsedReferences.length,
      inTextCitations,
      parsedReferences,
      matching: matchedAnalysis,
      apaFormatIssues,
      dateIssues,
      abbreviationIssues,
      totalIssuesCount: matchedAnalysis.unmatchedInText.length +
        matchedAnalysis.unreferencedBib.length +
        apaFormatIssues.length +
        dateIssues.length +
        abbreviationIssues.length
    };
  }

  // Extract clean paragraphs from Word XML
  static extractParagraphs(xmlText) {
    const pRegex = /<w:p(?:\s+[^>]*)?>([\s\S]*?)<\/w:p>/g;
    const tRegex = /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g;
    const paragraphs = [];

    let pMatch;
    while ((pMatch = pRegex.exec(xmlText)) !== null) {
      const pXml = pMatch[1];
      let tMatch;
      let pText = '';
      while ((tMatch = tRegex.exec(pXml)) !== null) {
        pText += tMatch[1];
      }
      if (pText.trim()) {
        paragraphs.push(pText.trim());
      }
    }
    return paragraphs;
  }

  // Extract APA In-Text Citations from body paragraphs
  static extractInTextCitations(paragraphs) {
    const citations = [];
    // Match (Author, Year) or (Author et al., Year) or (Author & Author, Year)
    const parenRegex = /\(([^)]*?\b(?:19\d\d|20\d\d)[a-z]?[^)]*?)\)/g;
    // Match narrative: Author (Year)
    const narrRegex = /\b([A-Z][a-zA-Z\-]+(?:\s+et\s+al\.)?)\s+\(((?:19\d\d|20\d\d)[a-z]?)\)/g;

    paragraphs.forEach((pText, pIdx) => {
      let match;
      while ((match = parenRegex.exec(pText)) !== null) {
        const inner = match[1];
        // Split if multiple citations separated by semicolon: (Jones, 2020; Smith, 2019)
        const parts = inner.split(';');
        for (const part of parts) {
          const trimmed = part.trim();
          const yearMatch = trimmed.match(/\b(19\d\d|20\d\d)[a-z]?\b/);
          if (yearMatch) {
            const year = yearMatch[0];
            const authorPart = trimmed.replace(/\b(19\d\d|20\d\d)[a-z]?\b/, '').replace(/[,p\.\d\s\-]+/g, ' ').trim();
            citations.push({
              raw: `(${trimmed})`,
              author: authorPart || 'Unknown',
              year,
              paragraphIndex: pIdx,
              type: 'parenthetical'
            });
          }
        }
      }

      while ((match = narrRegex.exec(pText)) !== null) {
        citations.push({
          raw: `${match[1]} (${match[2]})`,
          author: match[1].replace(/\s+et\s+al\./i, '').trim(),
          year: match[2],
          paragraphIndex: pIdx,
          type: 'narrative'
        });
      }
    });

    return citations;
  }

  // Parse Reference list paragraphs
  static parseReferencesList(refParagraphs) {
    const references = [];
    refParagraphs.forEach((p, idx) => {
      // Clean up whitespace
      const clean = p.replace(/\s+/g, ' ').trim();
      if (clean.length < 15) return; // Ignore headers or short noise

      // Match author and year (e.g. Smith, J. D. (2021) or American Nurses Association. (2020))
      const yearMatch = clean.match(/\(((?:19\d\d|20\d\d|n\.d\.)[a-z]?)\)/);
      const year = yearMatch ? yearMatch[1] : null;

      let author = 'Unknown';
      if (yearMatch && yearMatch.index > 0) {
        author = clean.substring(0, yearMatch.index).trim().replace(/[.,]$/, '');
      } else {
        const firstWords = clean.split(' ').slice(0, 3).join(' ');
        author = firstWords;
      }

      const hasDoi = /https?:\/\/doi\.org\/[^\s]+/i.test(clean) || /\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/i.test(clean);
      const hasUrl = /https?:\/\/[^\s]+/i.test(clean);

      references.push({
        id: 'ref_' + idx,
        raw: clean,
        author,
        year,
        hasDoi,
        hasUrl,
        index: idx
      });
    });

    return references;
  }

  // Match in-text citations against reference entries
  static crossMatchCitations(inTextCitations, references) {
    const matchedPairs = [];
    const unmatchedInText = [];
    const referencedBibIds = new Set();

    for (const cite of inTextCitations) {
      const citeAuthorNorm = cite.author.toLowerCase().replace(/[^a-z]/g, '');
      const citeYear = cite.year.substring(0, 4);

      let foundRef = null;
      for (const ref of references) {
        const refAuthorNorm = ref.author.toLowerCase().replace(/[^a-z]/g, '');
        const refYear = ref.year ? ref.year.substring(0, 4) : '';

        // Check author substring and year match
        if (citeYear === refYear && (refAuthorNorm.includes(citeAuthorNorm) || citeAuthorNorm.includes(refAuthorNorm.substring(0, 5)))) {
          foundRef = ref;
          referencedBibIds.add(ref.id);
          break;
        }
      }

      if (foundRef) {
        matchedPairs.push({ citation: cite, reference: foundRef });
      } else {
        unmatchedInText.push({
          citation: cite,
          reason: `No matching reference found in References list for '${cite.raw}'.`
        });
      }
    }

    const unreferencedBib = references.filter(r => !referencedBibIds.has(r.id)).map(r => ({
      reference: r,
      reason: `Reference is listed in bibliography but no matching in-text citation was detected in manuscript paragraphs.`
    }));

    return {
      matchedPairs,
      unmatchedInText,
      unreferencedBib
    };
  }

  // Check APA 7 Formatting on References
  static checkApaFormatting(references) {
    const issues = [];
    for (const ref of references) {
      if (!ref.year) {
        issues.push({
          reference: ref,
          issue: 'Missing Publication Year',
          details: 'Could not detect a publication year in parentheses (e.g., "(2022)" or "(n.d.)").'
        });
      }
      if (!ref.hasDoi && !ref.hasUrl && ref.raw.toLowerCase().includes('journal')) {
        issues.push({
          reference: ref,
          issue: 'Missing DOI / Permalink',
          details: 'APA 7 requires a DOI (https://doi.org/...) for journal articles when available.'
        });
      }
      if (/http:\/\/doi\.org/i.test(ref.raw)) {
        issues.push({
          reference: ref,
          issue: 'Insecure DOI Protocol',
          details: 'APA 7 specifies DOIs must use secure https (https://doi.org/...) rather than http.'
        });
      }
    }
    return issues;
  }

  // Check Date Windows
  static checkDateWindows(references, maxAgeYears = 5) {
    const currentYear = new Date().getFullYear();
    const cutoffYear = currentYear - maxAgeYears;
    const issues = [];

    for (const ref of references) {
      if (ref.year && /^\d{4}$/.test(ref.year)) {
        const y = parseInt(ref.year, 10);
        if (y < cutoffYear) {
          issues.push({
            reference: ref,
            year: y,
            ageYears: currentYear - y,
            issue: `Source is older than ${maxAgeYears} years (${y})`,
            details: `Published in ${y} (${currentYear - y} years ago). Assignment cutoff requires ≤ ${maxAgeYears} years (≥ ${cutoffYear}). Check for landmark study exception.`
          });
        }
      }
    }
    return issues;
  }

  // Scan ISMP / Joint Commission Prohibited Abbreviations
  static scanAbbreviations(text, customList = []) {
    const issues = [];
    const allRules = [...ISMP_DO_NOT_USE, ...customList];

    for (const rule of allRules) {
      let match;
      rule.pattern.lastIndex = 0;
      while ((match = rule.pattern.exec(text)) !== null) {
        // Extract surrounding context (30 chars before and after)
        const start = Math.max(0, match.index - 30);
        const end = Math.min(text.length, match.index + match[0].length + 30);
        const excerpt = '...' + text.substring(start, end).replace(/\n/g, ' ') + '...';

        issues.push({
          abbreviation: match[0],
          code: rule.code,
          rationale: rule.rationale,
          recommendation: rule.replacement,
          context: excerpt
        });
      }
    }

    return issues;
  }
}
