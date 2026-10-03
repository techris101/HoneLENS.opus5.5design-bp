// APA 7th Edition Citation Formatter & Field Validator
// Strictly deterministic formatting. Never guesses missing fields.

export class CitationMaker {
  // Format source metadata into APA 7 reference entry
  static formatApa7(source) {
    const missing = [];

    // Authors formatting
    let authorStr = '';
    if (Array.isArray(source.authors) && source.authors.length > 0) {
      const formattedAuthors = source.authors.map(a => {
        const parts = a.split(',');
        if (parts.length === 2) {
          const last = parts[0].trim();
          const firstInits = parts[1].trim().split(/\s+/).map(f => f[0] ? f[0].toUpperCase() + '.' : '').join(' ');
          return `${last}, ${firstInits}`.trim();
        }
        return a.trim();
      });

      if (formattedAuthors.length === 1) {
        authorStr = formattedAuthors[0];
      } else if (formattedAuthors.length === 2) {
        authorStr = `${formattedAuthors[0]} & ${formattedAuthors[1]}`;
      } else if (formattedAuthors.length <= 20) {
        authorStr = `${formattedAuthors.slice(0, -1).join(', ')}, & ${formattedAuthors[formattedAuthors.length - 1]}`;
      } else {
        // More than 20 authors: first 19 ... last
        authorStr = `${formattedAuthors.slice(0, 19).join(', ')} ... ${formattedAuthors[formattedAuthors.length - 1]}`;
      }
    } else {
      authorStr = source.organization || '[Unknown Author]';
      missing.push('Author(s)');
    }

    // Publication Year
    let yearStr = '';
    if (source.year) {
      yearStr = `(${source.year})`;
    } else {
      yearStr = '(n.d.)';
      missing.push('Publication Year (defaulted to n.d.)');
    }

    // Title (sentence case)
    const title = source.title ? this.toSentenceCase(source.title) : '[Untitled Source]';
    if (!source.title) missing.push('Title');

    // Journal & Publication details
    let pubDetails = '';
    let pubDetailsHtml = '';
    const journal = source.journal || source.publisher || '';
    if (!journal) missing.push('Journal / Periodical');

    if (journal) {
      let volIssue = '';
      if (source.volume) {
        volIssue += `, ${source.volume}`;
        if (source.issue) volIssue += `(${source.issue})`;
      } else {
        missing.push('Volume / Issue');
      }

      let pages = '';
      if (source.page) {
        pages = `, ${source.page}`;
      }

      pubDetails = `. ${journal}${volIssue}${pages}`;
      pubDetailsHtml = `. <i>${journal}</i>${source.volume ? `, <i>${source.volume}</i>` : ''}${source.issue ? `(${source.issue})` : ''}${pages}`;
    }

    // DOI / URL
    let linkStr = '';
    if (source.doi) {
      linkStr = `. https://doi.org/${source.doi}`;
    } else if (source.url) {
      linkStr = `. ${source.url}`;
    } else {
      missing.push('DOI / Permalink');
    }

    const plainText = `${authorStr}. ${yearStr}. ${title}${pubDetails}${linkStr}.`.replace(/\.{2,}/g, '.');
    const htmlText = `${authorStr}. ${yearStr}. ${title}${pubDetailsHtml}${linkStr ? `. <a href="${source.doi ? 'https://doi.org/' + source.doi : source.url}" target="_blank">${source.doi ? 'https://doi.org/' + source.doi : source.url}</a>` : ''}.`.replace(/\.{2,}/g, '.');

    // In-text parenthetical & narrative citations
    const inText = this.generateInTextCitations(source);

    return {
      plainText,
      htmlText,
      missingFields: missing,
      isComplete: missing.length === 0,
      inTextParenthetical: inText.parenthetical,
      inTextNarrative: inText.narrative
    };
  }

  // Generate In-Text Citation (Parenthetical & Narrative)
  static generateInTextCitations(source) {
    const year = source.year ? source.year : 'n.d.';
    let lead = 'Author';

    if (Array.isArray(source.authors) && source.authors.length > 0) {
      const firstLastName = source.authors[0].split(',')[0].trim();
      if (source.authors.length === 1) {
        return {
          parenthetical: `(${firstLastName}, ${year})`,
          narrative: `${firstLastName} (${year})`
        };
      } else if (source.authors.length === 2) {
        const secondLastName = source.authors[1].split(',')[0].trim();
        return {
          parenthetical: `(${firstLastName} & ${secondLastName}, ${year})`,
          narrative: `${firstLastName} and ${secondLastName} (${year})`
        };
      } else {
        return {
          parenthetical: `(${firstLastName} et al., ${year})`,
          narrative: `${firstLastName} et al. (${year})`
        };
      }
    }

    lead = source.organization || 'Unknown';
    return {
      parenthetical: `(${lead}, ${year})`,
      narrative: `${lead} (${year})`
    };
  }

  // Helper for APA Sentence Case title
  static toSentenceCase(str) {
    if (!str) return '';
    // Capitalize first letter, preserve proper nouns if already formatted
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
