// Word (.docx) Submission Pack Exporter
// Builds standard OpenXML documents locally using MiniZip. Zero server calls.

import { MiniZip } from './minizip.js';

export class DocxGenerator {
  // Generate .docx Uint8Array for EBP Submission Pack
  static async createSubmissionPack(assignment, options = {}) {
    const title = assignment.title || 'Evidence-Based Practice Submission Pack';
    const course = assignment.courseName || 'Nursing Research & EBP';
    const studentName = options.studentName || 'Nursing Student';
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const picot = assignment.picot || {};
    const sources = assignment.sources || [];
    const matrixRows = assignment.matrixRows || [];

    // Escape XML entities
    const escapeXml = (str) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    // Helper to build Word paragraphs
    const p = (text, style = null) => {
      const styleTag = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
      return `<w:p>${styleTag}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
    };

    const quoteP = (text) => {
      return `<w:p><w:pPr><w:ind w:left="720" w:right="720"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="12" w:color="1F6F78"/></w:pBdr></w:pPr><w:r><w:rPr><w:i/><w:color w:val="5E6A72"/></w:rPr><w:t xml:space="preserve">“${escapeXml(text)}”</w:t></w:r></w:p>`;
    };

    // Table cell helper
    const tc = (content, width = 2400) => {
      return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>${content}</w:tc>`;
    };

    // Build document body XML
    let bodyXml = '';

    // Document Title
    bodyXml += p(title, 'Title');
    bodyXml += p(`${course} — Submission Dossier`, 'Subtitle');
    bodyXml += p(`Prepared by: ${studentName} | Date: ${dateStr}`, 'Subtitle');
    bodyXml += `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="8" w:color="D3D1C7"/></w:pBdr></w:pPr></w:p>`;

    // 1. PICOT Question Section
    bodyXml += p('1. Clinical PICOT Question', 'Heading1');
    bodyXml += p('Patient / Population, Intervention, Comparison, Outcome, and Timeframe defined by student:');

    let picotRows = `
      <w:tr>
        ${tc(p('Component', 'TableHeader'), 2000)}
        ${tc(p('Student Formulation', 'TableHeader'), 7000)}
      </w:tr>
      <w:tr>
        ${tc(p('P — Population / Patient'), 2000)}
        ${tc(p(picot.population || 'Not specified'), 7000)}
      </w:tr>
      <w:tr>
        ${tc(p('I — Intervention'), 2000)}
        ${tc(p(picot.intervention || 'Not specified'), 7000)}
      </w:tr>
      <w:tr>
        ${tc(p('C — Comparison'), 2000)}
        ${tc(p(picot.comparison || 'Usual care / Standard protocol'), 7000)}
      </w:tr>
      <w:tr>
        ${tc(p('O — Outcome'), 2000)}
        ${tc(p(picot.outcome || 'Not specified'), 7000)}
      </w:tr>
      <w:tr>
        ${tc(p('T — Timeframe / Type'), 2000)}
        ${tc(p(picot.timeframe || 'Not specified'), 7000)}
      </w:tr>
    `;

    bodyXml += `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D3D1C7"/><w:bottom w:val="single" w:sz="4" w:color="D3D1C7"/><w:insideH w:val="single" w:sz="4" w:color="EFEFEA"/></w:tblBorders></w:tblPr>${picotRows}</w:tbl>`;

    // 2. PubMed Search Strategy
    if (assignment.pubmedQuery) {
      bodyXml += p('2. Search Strategy & Boolean Query', 'Heading1');
      bodyXml += p('PubMed starting search query constructed by student (disclosed as starting point, not exhaustive librarian search):');
      bodyXml += `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="EFEFEA"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:color w:val="18324A"/></w:rPr><w:t xml:space="preserve">${escapeXml(assignment.pubmedQuery)}</w:t></w:r></w:p>`;
    }

    // 3. Multi-Study Evidence Synthesis Matrix
    bodyXml += p('3. Multi-Study Evidence Synthesis Matrix', 'Heading1');
    bodyXml += p('Comparison across evaluated research studies:');

    if (matrixRows.length > 0) {
      let matrixTableRows = `
        <w:tr>
          ${tc(p('Study / Authors / Year', 'TableHeader'), 2200)}
          ${tc(p('Design & Level', 'TableHeader'), 1800)}
          ${tc(p('Sample & Setting', 'TableHeader'), 2000)}
          ${tc(p('Key Findings & Effect', 'TableHeader'), 2500)}
          ${tc(p('Student Appraisal & Relevance', 'TableHeader'), 2500)}
        </w:tr>
      `;

      for (const row of matrixRows) {
        matrixTableRows += `
          <w:tr>
            ${tc(p(`${row.authorYear || 'Study'} \n${row.title ? row.title.substring(0, 50) + '...' : ''}`), 2200)}
            ${tc(p(`${row.design || 'Unspecified'} \nLevel: ${row.level || 'N/A'}`), 1800)}
            ${tc(p(row.sampleSetting || 'N/A'), 2000)}
            ${tc(p(row.findings || 'N/A'), 2500)}
            ${tc(p(row.studentAppraisal || 'N/A'), 2500)}
          </w:tr>
        `;
      }
      bodyXml += `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D3D1C7"/><w:bottom w:val="single" w:sz="4" w:color="D3D1C7"/><w:insideH w:val="single" w:sz="4" w:color="EFEFEA"/></w:tblBorders></w:tblPr>${matrixTableRows}</w:tbl>`;
    } else {
      bodyXml += p('[No matrix rows saved yet for this assignment.]');
    }

    // 4. Source Appraisals & Quoted Material
    bodyXml += p('4. Detailed Study Appraisals & Quoted Evidence', 'Heading1');
    bodyXml += p('Distinction maintained between quoted source text and student-authored reasoning:');

    if (sources.length > 0) {
      for (const src of sources) {
        bodyXml += p(`${src.title || 'Source'} (${src.year || 'n.d.'})`, 'Heading2');
        bodyXml += p(`Authors: ${(src.authors || []).join(', ') || 'Unknown'}`);
        bodyXml += p(`Journal: ${src.journal || 'N/A'} | DOI: ${src.doi || 'N/A'}`);

        if (src.readingSheet) {
          bodyXml += p('Original Design-Specific Appraisal Prompts:', 'Heading3');
          if (src.readingSheet.question) bodyXml += p(`• Clinical Research Question: ${src.readingSheet.question}`);
          if (src.readingSheet.sampling) bodyXml += p(`• Sampling & Recruitment: ${src.readingSheet.sampling}`);
          if (src.readingSheet.measurement) bodyXml += p(`• Measurement & Data Collection: ${src.readingSheet.measurement}`);
          if (src.readingSheet.findings) bodyXml += p(`• Key Findings & Effect Sizes: ${src.readingSheet.findings}`);
          if (src.readingSheet.limitations) bodyXml += p(`• Methodological Limitations & Bias: ${src.readingSheet.limitations}`);
          if (src.readingSheet.clinicalRelevance) bodyXml += p(`• Clinical Relevance to Nursing Practice: ${src.readingSheet.clinicalRelevance}`);
        }

        if (Array.isArray(src.quotes) && src.quotes.length > 0) {
          bodyXml += p('Anchored Direct Quotations (Source-Verbatim):', 'Heading3');
          for (const q of src.quotes) {
            bodyXml += quoteP(q.text);
            if (q.studentNote) {
              bodyXml += p(`Student Rationale: ${q.studentNote}`);
            }
          }
        }
      }
    } else {
      bodyXml += p('[No detailed source appraisals recorded.]');
    }

    // 5. Academic Integrity & Non-AI Transparency Disclosure
    bodyXml += p('5. Methodology & Non-AI Transparency Statement', 'Heading1');
    bodyXml += p('Generated with HoneLENS (HoneNurse Clinical Learning Tools). This submission packet was compiled using local-first bibliographic metadata and explicit formulas. No generative AI, language models, or auto-written conclusions were utilized in the creation of these student appraisals.');

    // Build the complete OpenXML file structure
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
  </w:body>
</w:document>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
      <w:sz w:val="24"/>
      <w:color w:val="18324A"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:b/>
      <w:sz w:val="48"/>
      <w:color w:val="18324A"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:sz w:val="22"/>
      <w:color w:val="5E6A72"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:b/>
      <w:sz w:val="32"/>
      <w:color w:val="18324A"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="Heading 2"/>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:b/>
      <w:sz w:val="26"/>
      <w:color w:val="1F6F78"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="Heading 3"/>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:b/>
      <w:sz w:val="22"/>
      <w:color w:val="18324A"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="TableHeader">
    <w:name w:val="TableHeader"/>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:b/>
      <w:sz w:val="20"/>
      <w:color w:val="18324A"/>
    </w:rPr>
  </w:style>
</w:styles>`;

    const zipFiles = {
      '[Content_Types].xml': contentTypesXml,
      '_rels/.rels': relsXml,
      'word/_rels/document.xml.rels': docRelsXml,
      'word/document.xml': documentXml,
      'word/styles.xml': stylesXml
    };

    return await MiniZip.createZip(zipFiles);
  }
}
