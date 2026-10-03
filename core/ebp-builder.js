// EBP Assignment Builder & Synthesis Matrix Manager
// Manages courses, assignments, PICOT synthesis, PubMed query building, and export dossiers.

import { storage } from './storage.js';
import { DocxGenerator } from './docx-generator.js';

export class EbpBuilder {
  // Get all assignments
  static async getAssignments() {
    return await storage.getCollection('assignments');
  }

  // Get specific assignment
  static async getAssignment(id) {
    const assignments = await this.getAssignments();
    return assignments.find(a => a.id === id) || null;
  }

  // Save or update assignment
  static async saveAssignment(assignment) {
    if (!assignment.id) {
      assignment.id = 'assign_' + Date.now();
      return await storage.addItem('assignments', assignment);
    } else {
      return await storage.updateItem('assignments', assignment.id, assignment);
    }
  }

  // Delete assignment
  static async deleteAssignment(id) {
    await storage.deleteItem('assignments', id);
  }

  // Construct PubMed Boolean Search Query from student PICOT terms
  static buildPubMedQuery(picot = {}, options = {}) {
    const parts = [];

    const formatGroup = (terms, field = '[tiab]') => {
      if (!terms || terms.trim().length === 0) return null;
      const rawTerms = terms.split(/[,;\n]+/).map(t => t.trim()).filter(Boolean);
      if (rawTerms.length === 0) return null;
      const wrapped = rawTerms.map(t => {
        const clean = t.replace(/[()]/g, '');
        return clean.includes(' ') ? `"${clean}"${field}` : `${clean}${field}`;
      });
      return wrapped.length === 1 ? wrapped[0] : `(${wrapped.join(' OR ')})`;
    };

    const pGroup = formatGroup(picot.populationTerms || picot.population);
    if (pGroup) parts.push(pGroup);

    const iGroup = formatGroup(picot.interventionTerms || picot.intervention);
    if (iGroup) parts.push(iGroup);

    const cGroup = formatGroup(picot.comparisonTerms || picot.comparison);
    if (cGroup && options.includeComparison) parts.push(cGroup);

    const oGroup = formatGroup(picot.outcomeTerms || picot.outcome);
    if (oGroup) parts.push(oGroup);

    if (parts.length === 0) return '';

    let query = parts.join(' AND ');

    // Date limit filter
    if (options.dateLimitYears) {
      query += ` AND ("last ${options.dateLimitYears} years"[dp])`;
    }

    // Nursing journals filter
    if (options.nursingSubset) {
      query += ' AND nursing[sb]';
    }

    return query;
  }

  // Generate PubMed search URL
  static getPubMedSearchUrl(query) {
    if (!query) return 'https://pubmed.ncbi.nlm.nih.gov/';
    return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query)}`;
  }

  // Export Synthesis Matrix to CSV
  static exportMatrixToCsv(assignment) {
    const rows = assignment.matrixRows || [];
    const headers = ['Study Author/Year', 'Title', 'Design', 'Level', 'Sample & Setting', 'Findings & Effect', 'Student Appraisal', 'Relevance'];
    
    const escapeCsv = (val) => {
      const s = String(val || '').replace(/"/g, '""');
      return `"${s}"`;
    };

    const csvLines = [
      headers.map(escapeCsv).join(','),
      ...rows.map(r => [
        r.authorYear,
        r.title,
        r.design,
        r.level,
        r.sampleSetting,
        r.findings,
        r.studentAppraisal,
        r.relevance
      ].map(escapeCsv).join(','))
    ];

    return csvLines.join('\n');
  }

  // Export full Submission Pack to Word .docx
  static async exportToDocx(assignment, options = {}) {
    return await DocxGenerator.createSubmissionPack(assignment, options);
  }
}
