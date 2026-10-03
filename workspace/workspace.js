// HoneLENS Full-Page Workspace Application Controller
import { metadataResolver } from '../core/metadata-resolver.js';
import { CriteriaEngine, EVIDENCE_FRAMEWORKS } from '../core/criteria-engine.js';
import { DosageEngine, PROBLEM_TYPES } from '../core/dosage-engine.js';
import { ExamSimulator } from '../core/exam-simulator.js';
import { StatsEngine } from '../core/stats-engine.js';
import { EbpBuilder } from '../core/ebp-builder.js';
import { SourceAuditor } from '../core/source-auditor.js';
import { DocxParser } from '../core/docx-parser.js';
import { CitationMaker } from '../core/citation-maker.js';
import { FlashcardsEngine } from '../core/flashcards-engine.js';
import { HonePack } from '../core/honepack.js';
import { ActivityLog } from '../core/activity-log.js';
import { PrivacyHub } from '../core/privacy-hub.js';
import { entitlement, PLANS } from '../core/entitlement.js';
import { storage } from '../core/storage.js';

// Application State
let activeAssignment = null;
let currentExam = null;
let examTimerInterval = null;
let currentTrainerProblem = null;
let activeStudyCard = null;
let dueCardsQueue = [];
let evaluatedSource = null;

document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupThemeToggle();
  await initSettingsAndEntitlements();
  await initSourceCheck();
  await initEbpBuilder();
  await initSourceAudit();
  await initDosageTrainer();
  await initDosageSimulator();
  await initStatsCalculator();
  await initLibrary();
  await initFlashcards();
  await initCitationMaker();
  await initActivityLog();
  await initPrivacyHub();
  await initBackupSettings();

  // Route by URL hash if present
  const hash = window.location.hash.replace('#', '');
  if (hash) {
    const matchingBtn = document.querySelector(`.nav-item[data-view="view-${hash}"]`);
    if (matchingBtn) matchingBtn.click();
  }
});

// Navigation Handling
function setupNavigation() {
  const navBtns = document.querySelectorAll('.sidebar-nav .nav-item');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.workspace-view').forEach(v => v.classList.remove('active'));

      btn.classList.add('active');
      const viewId = btn.dataset.view;
      const targetView = document.getElementById(viewId);
      if (targetView) targetView.classList.add('active');

      // Update Top Bar titles
      updateTopBarHeader(viewId);

      // Refresh view-specific content
      if (viewId === 'view-library') loadLibraryItems();
      if (viewId === 'view-flashcards') refreshFlashcardsView();
      if (viewId === 'view-activity-log') loadActivityLogs();
      if (viewId === 'view-privacy-hub') loadPrivacyData();

      // Update window hash
      window.location.hash = viewId.replace('view-', '');
    });
  });
}

function updateTopBarHeader(viewId) {
  const titles = {
    'view-source-check': { title: 'Source Check', sub: 'Evaluate research sources against assignment criteria and retraction records.' },
    'view-ebp-builder': { title: 'EBP Assignment Builder', sub: 'PICOT framework, PubMed search builder, synthesis matrix, and Word submission pack.' },
    'view-source-audit': { title: 'Source Audit & DOCX Checker', sub: 'Local manuscript parsing, citation matching, APA 7 formatting, and prohibited abbreviations.' },
    'view-citation-maker': { title: 'APA 7 Citation Maker', sub: 'Deterministic reference formatting and field completeness verification.' },
    'view-dosage-trainer': { title: 'Dosage Trainer', sub: 'Continuous nursing math practice with formula, dimensional analysis, and error classification.' },
    'view-dosage-simulator': { title: 'Dosage Exam Simulator', sub: 'Timed mock benchmark exams, mastery passing targets, and mistake analytics.' },
    'view-stats-calc': { title: 'Stats Calculator', sub: '2×2 contingency table effect measures, absolute risk reduction, NNT/NNH, and 95% CI interpreter.' },
    'view-library': { title: 'Research Library', sub: 'Organize sources, clipped findings, margin notes, and screen captures with literal search.' },
    'view-flashcards': { title: 'Leitner Spaced Repetition', sub: 'Source-anchored student-authored flashcards with fixed 5-box schedule and Anki export.' },
    'view-activity-log': { title: 'Research Trail', sub: 'Personal research audit trail. Zero surveillance. Fully exportable and clearable.' },
    'view-privacy-hub': { title: 'Privacy & Disclosures', sub: '100% on-device processing, zero AI calls, and complete network disclosure.' },
    'view-settings': { title: 'Backup & Settings', sub: 'Portable HonePack backup/restore, license activation, and Plus testing mode.' }
  };

  const header = titles[viewId] || { title: 'HoneLENS', sub: 'Sharpen your clinical judgment.' };
  document.getElementById('view-title').textContent = header.title;
  document.getElementById('view-subtitle').textContent = header.sub;
}

function setupThemeToggle() {
  const btn = document.getElementById('topbar-theme-toggle');
  btn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    storage.set({ theme_preference: newTheme });
  });

  storage.get(['theme_preference']).then(res => {
    if (res.theme_preference) {
      document.documentElement.setAttribute('data-theme', res.theme_preference);
    }
  });
}

// ============================================================================
// 1. SOURCE CHECK VIEW
// ============================================================================
async function initSourceCheck() {
  const btnLookup = document.getElementById('sc-btn-lookup');
  const inputId = document.getElementById('sc-identifier-input');

  btnLookup.addEventListener('click', () => doSourceCheck());
  inputId.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') doSourceCheck();
  });

  // Check if quick query from context menu exists
  const qq = await storage.get(['quick_check_query']);
  if (qq.quick_check_query) {
    inputId.value = qq.quick_check_query;
    await storage.remove(['quick_check_query']);
    doSourceCheck();
  }

  document.getElementById('sc-btn-save-lib').addEventListener('click', async () => {
    if (evaluatedSource) {
      await storage.addItem('sources', evaluatedSource);
      await ActivityLog.record('Saved source to library', { title: evaluatedSource.title, doi: evaluatedSource.doi });
      alert('Source saved to your local library.');
    }
  });

  document.getElementById('sc-btn-copy-apa').addEventListener('click', () => {
    if (evaluatedSource) {
      const cite = CitationMaker.formatApa7(evaluatedSource);
      navigator.clipboard.writeText(cite.plainText);
      alert('APA 7 citation copied to clipboard:\n' + cite.plainText);
    }
  });
}

async function doSourceCheck() {
  const val = document.getElementById('sc-identifier-input').value.trim();
  if (!val) {
    alert('Please enter a DOI or PMID.');
    return;
  }

  const btnLookup = document.getElementById('sc-btn-lookup');
  btnLookup.textContent = 'Resolving...';
  btnLookup.disabled = true;

  try {
    const isPmid = /^\d{7,9}$/.test(val);
    evaluatedSource = isPmid ? await metadataResolver.fetchPubMed(val) : await metadataResolver.fetchCrossref(val);

    renderSourceCheckResults(evaluatedSource);
    await ActivityLog.record('Resolved source metadata', { identifier: val, title: evaluatedSource.title });
  } catch (err) {
    alert(err.message);
  } finally {
    btnLookup.textContent = 'Resolve';
    btnLookup.disabled = false;
  }
}

function renderSourceCheckResults(source) {
  document.getElementById('sc-empty-state').style.display = 'none';
  const resCard = document.getElementById('sc-results-card');
  resCard.style.display = 'block';

  document.getElementById('sc-res-title').textContent = source.title || 'Untitled Source';
  document.getElementById('sc-res-meta').textContent = `Authors: ${(source.authors || []).join(', ') || 'N/A'} • Journal: ${source.journal || 'N/A'} • Year: ${source.year || 'n.d.'} • Type: ${source.type || 'Article'}`;
  document.getElementById('sc-badge-time').textContent = `Retrieved: ${new Date().toLocaleTimeString()}`;

  const criteria = {
    dateWindow: parseInt(document.getElementById('sc-date-window').value, 10),
    requiredType: 'journal-article',
    framework: document.getElementById('sc-framework-select').value,
    questionType: document.getElementById('sc-question-type').value
  };

  const evalRes = CriteriaEngine.evaluateSource(source, criteria);

  const badge = document.getElementById('sc-badge-status');
  if (evalRes.hasFailures) {
    badge.textContent = 'Criteria Flagged';
    badge.className = 'hn-badge hn-badge-unmatch';
  } else if (evalRes.overallMatches) {
    badge.textContent = 'Criteria Matches';
    badge.className = 'hn-badge hn-badge-match';
  } else {
    badge.textContent = 'Verification Needed';
    badge.className = 'hn-badge hn-badge-unknown';
  }

  // Criteria Table
  const tableContainer = document.getElementById('sc-criteria-table-container');
  let tableHtml = `<table class="hn-table"><thead><tr><th>Assignment Criterion</th><th>Rule &amp; Evaluated Metadata</th><th>Status</th><th>What this check means</th></tr></thead><tbody>`;

  evalRes.results.forEach(r => {
    const tag = r.status === 'matches' ? 'hn-badge-match' : (r.status === 'does_not_match' ? 'hn-badge-unmatch' : 'hn-badge-unknown');
    const label = r.status === 'matches' ? 'Matches' : (r.status === 'does_not_match' ? 'Mismatch' : 'Unknown');
    tableHtml += `
      <tr>
        <td><b>${r.criterion}</b></td>
        <td><span class="hn-secondary hn-text-xs">Rule: ${r.rule}</span><br>${r.actual}</td>
        <td><span class="hn-badge ${tag}">${label}</span></td>
        <td class="hn-secondary hn-text-xs">${r.meaning}</td>
      </tr>
    `;
  });
  tableHtml += '</tbody></table>';
  tableContainer.innerHTML = tableHtml;

  // Retraction Notice
  const retAlert = document.getElementById('sc-retraction-alert');
  if (source.retractionStatus === 'RETRACTED') {
    retAlert.style.display = 'block';
    retAlert.innerHTML = `<b>PATIENT SAFETY ALERT:</b> Retraction record matches this article. Never rely on retracted literature for patient care guidelines.`;
  } else {
    retAlert.style.display = 'none';
  }

  // Framework Mapping
  const frameAlert = document.getElementById('sc-framework-alert');
  if (evalRes.frameworkResult) {
    frameAlert.style.display = 'block';
    frameAlert.innerHTML = `<b>Provisional Hierarchy Match:</b> ${evalRes.frameworkResult.level} — ${evalRes.frameworkResult.description}<br><span class="hn-text-xs hn-secondary">(${evalRes.frameworkResult.meaning})</span>`;
  } else {
    frameAlert.style.display = 'none';
  }
}

// ============================================================================
// 2. EBP ASSIGNMENT BUILDER VIEW
// ============================================================================
async function initEbpBuilder() {
  await loadAssignmentsDropdown();

  document.getElementById('ebp-btn-new-assignment').addEventListener('click', async () => {
    const title = prompt('Enter EBP Assignment Name:', 'Fall Prevention Protocol EBP');
    if (!title) return;
    const newAss = {
      title,
      courseName: 'NURS 410 Evidence-Based Practice',
      picot: {},
      pubmedQuery: '',
      matrixRows: [],
      sources: []
    };
    activeAssignment = await EbpBuilder.saveAssignment(newAss);
    await ActivityLog.record('Created new assignment workspace', { title });
    await loadAssignmentsDropdown();
  });

  document.getElementById('ebp-select-assignment').addEventListener('change', async (e) => {
    activeAssignment = await EbpBuilder.getAssignment(e.target.value);
    populateAssignmentFields();
  });

  document.getElementById('ebp-btn-save-picot').addEventListener('click', async () => {
    if (!activeAssignment) return;
    activeAssignment.picot = {
      population: document.getElementById('picot-p').value.trim(),
      intervention: document.getElementById('picot-i').value.trim(),
      comparison: document.getElementById('picot-c').value.trim(),
      outcome: document.getElementById('picot-o').value.trim(),
      timeframe: document.getElementById('picot-t').value.trim()
    };
    await EbpBuilder.saveAssignment(activeAssignment);
    await ActivityLog.record('Updated PICOT formulation', { assignment: activeAssignment.title });
    alert('PICOT formulation saved successfully.');
  });

  document.getElementById('ebp-btn-generate-query').addEventListener('click', () => {
    if (!activeAssignment) return;
    const picot = {
      population: document.getElementById('picot-p').value.trim(),
      intervention: document.getElementById('picot-i').value.trim(),
      comparison: document.getElementById('picot-c').value.trim(),
      outcome: document.getElementById('picot-o').value.trim()
    };
    const query = EbpBuilder.buildPubMedQuery(picot, { dateLimitYears: 5, nursingSubset: true });
    activeAssignment.pubmedQuery = query;
    document.getElementById('ebp-pubmed-query-box').value = query;

    const link = document.getElementById('ebp-link-pubmed');
    link.style.display = 'inline-flex';
    link.href = EbpBuilder.getPubMedSearchUrl(query);
  });

  document.getElementById('ebp-btn-add-matrix-row').addEventListener('click', () => {
    if (!activeAssignment) return;
    const authorYear = prompt('Author & Year (e.g. Mitchell et al., 2022):');
    if (!authorYear) return;
    const design = prompt('Study Design (e.g. Randomized Controlled Trial):', 'Randomized Controlled Trial');
    const findings = prompt('Key Clinical Findings:', 'Significant 34% reduction in fall rates (p = 0.012).');

    if (!activeAssignment.matrixRows) activeAssignment.matrixRows = [];
    activeAssignment.matrixRows.push({
      id: 'row_' + Date.now(),
      authorYear,
      design,
      level: 'Level II',
      sampleSetting: '340 adult inpatients, acute medical units',
      findings,
      studentAppraisal: 'High internal validity, double-blinded, intention-to-treat analysis.',
      relevance: 'Directly supports unit fall-prevention bundle protocol.'
    });

    EbpBuilder.saveAssignment(activeAssignment).then(() => {
      renderMatrixTable();
    });
  });

  document.getElementById('ebp-btn-export-csv').addEventListener('click', () => {
    if (!activeAssignment) return;
    const csv = EbpBuilder.exportMatrixToCsv(activeAssignment);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeAssignment.title.replace(/\s+/g, '_')}_Matrix.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('ebp-btn-export-docx').addEventListener('click', async () => {
    if (!activeAssignment) return;
    const btn = document.getElementById('ebp-btn-export-docx');
    btn.textContent = 'Generating .docx...';
    btn.disabled = true;

    try {
      const docxUint8 = await EbpBuilder.exportToDocx(activeAssignment);
      const blob = new Blob([docxUint8], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeAssignment.title.replace(/\s+/g, '_')}_Submission_Pack.docx`;
      a.click();
      URL.revokeObjectURL(url);
      await ActivityLog.record('Exported Word Submission Pack', { title: activeAssignment.title });
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      btn.textContent = 'Export Word Submission Pack (.docx)';
      btn.disabled = false;
    }
  });
}

async function loadAssignmentsDropdown() {
  const assignments = await EbpBuilder.getAssignments();
  const select = document.getElementById('ebp-select-assignment');
  select.innerHTML = '';

  if (assignments.length === 0) {
    const defaultAss = {
      title: 'EBP Practice Assignment 1',
      courseName: 'Nursing Research & Evidence-Based Practice',
      picot: {
        population: 'Hospitalized adult patients at risk for pressure injuries',
        intervention: 'Nurse-driven automated repositioning schedule with silicone foam dressings',
        comparison: 'Standard manual 2-hour turn schedule alone',
        outcome: 'Incidence of hospital-acquired stage 2+ pressure injuries',
        timeframe: 'During inpatient admission duration'
      },
      pubmedQuery: '("pressure injury"[tiab] OR "pressure ulcer"[tiab]) AND ("repositioning"[tiab] OR "silicone foam"[tiab]) AND nursing[sb]',
      matrixRows: [
        {
          id: 'row_1',
          authorYear: 'Anderson & Clark (2023)',
          title: 'Effectiveness of prophylactic silicone foam dressings on sacral pressure injuries',
          design: 'Randomized Controlled Trial',
          level: 'Level II',
          sampleSetting: 'N = 280 ICU patients across 2 medical centers',
          findings: 'Incidence was 2.8% in dressing group vs 10.7% in standard care (RR 0.26, 95% CI [0.11, 0.62], p < 0.001).',
          studentAppraisal: 'Adequate sample size, intention-to-treat analysis, blinding of outcome assessors.',
          relevance: 'Demonstrates strong statistical and clinical benefit for ICU sacral protection.'
        }
      ],
      sources: []
    };
    activeAssignment = await EbpBuilder.saveAssignment(defaultAss);
    assignments.push(activeAssignment);
  } else {
    activeAssignment = assignments[0];
  }

  assignments.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.title;
    select.appendChild(opt);
  });

  populateAssignmentFields();
}

function populateAssignmentFields() {
  if (!activeAssignment) return;
  const p = activeAssignment.picot || {};
  document.getElementById('picot-p').value = p.population || '';
  document.getElementById('picot-i').value = p.intervention || '';
  document.getElementById('picot-c').value = p.comparison || '';
  document.getElementById('picot-o').value = p.outcome || '';
  document.getElementById('picot-t').value = p.timeframe || '';

  document.getElementById('ebp-pubmed-query-box').value = activeAssignment.pubmedQuery || '';
  renderMatrixTable();
}

function renderMatrixTable() {
  const tbody = document.getElementById('ebp-matrix-tbody');
  tbody.innerHTML = '';
  const rows = activeAssignment.matrixRows || [];

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--hn-slate);">No study matrix rows yet. Click "+ Add Study Row" above.</td></tr>';
    return;
  }

  rows.forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${r.authorYear}</b></td>
      <td>${r.design}<br><span class="hn-badge hn-badge-unknown">${r.level}</span></td>
      <td>${r.sampleSetting}</td>
      <td>${r.findings}</td>
      <td>${r.studentAppraisal}</td>
      <td><button class="hn-btn hn-btn-sm hn-btn-danger btn-del-row" data-idx="${idx}">&times;</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-del-row').forEach(b => {
    b.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      activeAssignment.matrixRows.splice(idx, 1);
      EbpBuilder.saveAssignment(activeAssignment).then(() => renderMatrixTable());
    });
  });
}

// ============================================================================
// 3. SOURCE AUDIT & DOCX CHECKER VIEW
// ============================================================================
async function initSourceAudit() {
  const dropZone = document.getElementById('docx-drop-zone');
  const fileInput = document.getElementById('docx-file-input');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files?.length > 0) {
      processDocxFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files?.length > 0) {
      processDocxFile(e.target.files[0]);
    }
  });
}

async function processDocxFile(file) {
  if (!file.name.endsWith('.docx')) {
    alert('Please select a Microsoft Word (.docx) document.');
    return;
  }

  const spinner = document.getElementById('audit-loading-spinner');
  spinner.style.display = 'block';

  try {
    const buffer = await file.arrayBuffer();
    const audit = await SourceAuditor.auditManuscriptFile(buffer, { fileName: file.name, dateWindow: 5 });

    renderAuditResults(audit);
    await ActivityLog.record('Audited DOCX manuscript locally', { file: file.name, issuesFound: audit.totalIssuesCount });
  } catch (err) {
    alert('Failed to audit manuscript: ' + err.message);
  } finally {
    spinner.style.display = 'none';
  }
}

function renderAuditResults(audit) {
  document.getElementById('audit-results-container').style.display = 'block';
  document.getElementById('audit-report-filename').textContent = audit.fileName;

  const totalBadge = document.getElementById('audit-total-issues-badge');
  totalBadge.textContent = audit.totalIssuesCount === 0 ? 'Clean Audit — 0 Issues' : `${audit.totalIssuesCount} Flags Found`;
  totalBadge.className = `hn-badge ${audit.totalIssuesCount === 0 ? 'hn-badge-match' : 'hn-badge-unmatch'}`;

  document.getElementById('stat-citations-count').textContent = audit.inTextCitationCount;
  document.getElementById('stat-references-count').textContent = audit.referenceEntryCount;
  document.getElementById('stat-unmatched-intext').textContent = audit.matching.unmatchedInText.length;
  document.getElementById('stat-unreferenced-bib').textContent = audit.matching.unreferencedBib.length;
  document.getElementById('stat-abbrev-count').textContent = audit.abbreviationIssues.length;

  // Unmatched in-text
  const unInTextList = document.getElementById('audit-unmatched-intext-list');
  unInTextList.innerHTML = audit.matching.unmatchedInText.length === 0
    ? '<p class="hn-secondary hn-text-xs">All in-text citations matched a reference entry.</p>'
    : audit.matching.unmatchedInText.map(i => `<div class="hn-callout hn-callout-amber" style="margin-bottom: 6px;"><b>${i.citation.raw}</b>: ${i.reason}</div>`).join('');

  // Unreferenced bib
  const unBibList = document.getElementById('audit-unreferenced-bib-list');
  unBibList.innerHTML = audit.matching.unreferencedBib.length === 0
    ? '<p class="hn-secondary hn-text-xs">All bibliography entries were cited in the body text.</p>'
    : audit.matching.unreferencedBib.map(b => `<div class="hn-callout hn-callout-amber" style="margin-bottom: 6px;"><b>${b.reference.raw.substring(0, 100)}...</b>: ${b.reason}</div>`).join('');

  // Prohibited abbreviations
  const abbrevList = document.getElementById('audit-abbreviations-list');
  abbrevList.innerHTML = audit.abbreviationIssues.length === 0
    ? '<p class="hn-secondary hn-text-xs">No prohibited Joint Commission / ISMP "Do Not Use" abbreviations detected.</p>'
    : audit.abbreviationIssues.map(a => `
        <div class="hn-callout hn-callout-danger" style="margin-bottom: 6px;">
          <b>Prohibited: "${a.abbreviation}" (${a.code})</b> — ${a.rationale}<br>
          <span class="hn-secondary hn-text-xs">Context: ${a.context}</span><br>
          <b>Correction:</b> ${a.recommendation}
        </div>
      `).join('');

  // Date & APA 7 Flags
  const dateApaList = document.getElementById('audit-date-apa-list');
  const allDateApa = [...audit.dateIssues, ...audit.apaFormatIssues];
  dateApaList.innerHTML = allDateApa.length === 0
    ? '<p class="hn-secondary hn-text-xs">All sources meet the 5-year assignment date window and APA 7 required elements.</p>'
    : allDateApa.map(d => `<div class="hn-callout" style="margin-bottom: 6px;"><b>${d.issue}</b>: ${d.details}</div>`).join('');
}

// ============================================================================
// 4. DOSAGE TRAINER VIEW
// ============================================================================
async function initDosageTrainer() {
  document.getElementById('dt-btn-generate').addEventListener('click', loadNewTrainerItem);
  document.getElementById('dt-btn-submit').addEventListener('click', verifyTrainerItem);
  document.getElementById('dt-answer-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') verifyTrainerItem();
  });

  loadNewTrainerItem();
}

function loadNewTrainerItem() {
  const type = document.getElementById('dt-select-type').value;
  currentTrainerProblem = DosageEngine.generateProblem(type);

  document.getElementById('dt-prompt-display').textContent = currentTrainerProblem.prompt;
  document.getElementById('dt-rounding-rule-display').textContent = currentTrainerProblem.roundingRule;
  document.getElementById('dt-target-unit-label').textContent = currentTrainerProblem.targetUnit;
  document.getElementById('dt-answer-input').value = '';
  document.getElementById('dt-feedback-panel').style.display = 'none';
  document.getElementById('dt-feedback-empty').style.display = 'block';
}

function verifyTrainerItem() {
  if (!currentTrainerProblem) return;
  const val = document.getElementById('dt-answer-input').value;
  const res = DosageEngine.checkAnswer(currentTrainerProblem, val);

  document.getElementById('dt-feedback-empty').style.display = 'none';
  const panel = document.getElementById('dt-feedback-panel');
  panel.style.display = 'block';

  const badge = document.getElementById('dt-badge-result');
  badge.textContent = res.isCorrect ? 'Correct Calculation' : (res.mistakeCategory || 'Incorrect');
  badge.className = `hn-badge ${res.isCorrect ? 'hn-badge-match' : 'hn-badge-unmatch'}`;

  document.getElementById('dt-correct-val').textContent = `Target: ${res.correctAnswer} ${currentTrainerProblem.targetUnit}`;

  const mistakeCallout = document.getElementById('dt-mistake-callout');
  if (!res.isCorrect && res.mistakeCategory) {
    mistakeCallout.style.display = 'block';
    mistakeCallout.textContent = `Identified Discrepancy: ${res.mistakeCategory}. Review the dimensional analysis below.`;
  } else {
    mistakeCallout.style.display = 'none';
  }

  const s = currentTrainerProblem.steps;
  document.getElementById('dt-step-formula').innerHTML = `<b>Formula Method:</b><br>${s.formula || 'Direct conversion formula'}`;
  document.getElementById('dt-step-dimensional').innerHTML = `<b>Dimensional Analysis:</b><br>${s.dimensionalAnalysis || 'Step-by-step unit factors'}`;
  document.getElementById('dt-step-note').innerHTML = `<b>Clinical Rule:</b> ${s.explanation || currentTrainerProblem.roundingRule}`;
}

// ============================================================================
// 5. DOSAGE EXAM SIMULATOR VIEW
// ============================================================================
async function initDosageSimulator() {
  document.getElementById('exam-btn-start').addEventListener('click', startNewExam);
  document.getElementById('exam-btn-next').addEventListener('click', () => navigateExam(1));
  document.getElementById('exam-btn-prev').addEventListener('click', () => navigateExam(-1));
  document.getElementById('exam-btn-flag').addEventListener('click', toggleFlagCurrentQuestion);
  document.getElementById('exam-btn-submit-exam').addEventListener('click', submitExamFinal);
  document.getElementById('exam-btn-retake').addEventListener('click', resetExamConfig);
}

function startNewExam() {
  const qCount = parseInt(document.getElementById('exam-question-count').value, 10);
  const passTarget = parseInt(document.getElementById('exam-pass-target').value, 10);

  currentExam = ExamSimulator.createExam({ questionCount: qCount, passTargetPct: passTarget });

  document.getElementById('exam-config-panel').style.display = 'none';
  document.getElementById('exam-results-panel').style.display = 'none';
  document.getElementById('exam-active-panel').style.display = 'block';

  document.getElementById('exam-q-total').textContent = currentExam.questionCount;
  renderExamActiveQuestion();

  // Start timer
  if (examTimerInterval) clearInterval(examTimerInterval);
  examTimerInterval = setInterval(() => {
    currentExam.timeRemainingSeconds--;
    const mins = Math.floor(currentExam.timeRemainingSeconds / 60);
    const secs = currentExam.timeRemainingSeconds % 60;
    document.getElementById('exam-timer-display').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    if (currentExam.timeRemainingSeconds <= 0) {
      clearInterval(examTimerInterval);
      alert('Time expired! Submitting exam for grading.');
      submitExamFinal();
    }
  }, 1000);
}

function renderExamActiveQuestion() {
  if (!currentExam) return;
  const q = currentExam.questions[currentExam.currentQuestionIndex];
  document.getElementById('exam-q-current').textContent = q.number;
  document.getElementById('exam-q-category').textContent = q.type.replace('_', ' ').toUpperCase();
  document.getElementById('exam-active-prompt').textContent = q.prompt;
  document.getElementById('exam-active-rounding').textContent = q.roundingRule;
  document.getElementById('exam-active-unit').textContent = q.targetUnit;
  document.getElementById('exam-active-input').value = q.userAnswer !== null ? q.userAnswer : '';

  const flagBtn = document.getElementById('exam-btn-flag');
  flagBtn.textContent = q.isFlagged ? 'Flagged ★' : 'Flag Question';
  flagBtn.className = `hn-btn hn-btn-sm ${q.isFlagged ? 'hn-btn-accent' : 'hn-btn-secondary'}`;
}

function saveCurrentQuestionAnswer() {
  if (!currentExam) return;
  const q = currentExam.questions[currentExam.currentQuestionIndex];
  const val = document.getElementById('exam-active-input').value;
  q.userAnswer = val !== '' ? parseFloat(val) : null;
}

function navigateExam(direction) {
  saveCurrentQuestionAnswer();
  const nextIdx = currentExam.currentQuestionIndex + direction;
  if (nextIdx >= 0 && nextIdx < currentExam.questionCount) {
    currentExam.currentQuestionIndex = nextIdx;
    renderExamActiveQuestion();
  }
}

function toggleFlagCurrentQuestion() {
  if (!currentExam) return;
  const q = currentExam.questions[currentExam.currentQuestionIndex];
  q.isFlagged = !q.isFlagged;
  renderExamActiveQuestion();
}

async function submitExamFinal() {
  saveCurrentQuestionAnswer();
  if (examTimerInterval) clearInterval(examTimerInterval);

  const graded = await ExamSimulator.gradeExam(currentExam);

  document.getElementById('exam-active-panel').style.display = 'none';
  const resPanel = document.getElementById('exam-results-panel');
  resPanel.style.display = 'block';

  const badge = document.getElementById('exam-score-badge');
  badge.textContent = graded.score.passed ? 'PASSED — Benchmark Met' : 'DID NOT MEET BENCHMARK';
  badge.className = `hn-badge ${graded.score.passed ? 'hn-badge-match' : 'hn-badge-danger'}`;

  document.getElementById('exam-score-pct').textContent = `${graded.score.pct}%`;
  document.getElementById('exam-score-raw').textContent = `${graded.score.correct} / ${graded.score.total}`;
  document.getElementById('exam-target-pct').textContent = `${graded.score.passTargetPct}%`;
  document.getElementById('exam-weak-area').textContent = graded.analytics.primaryWeakArea.replace('_', ' ');

  // Review List
  const reviewContainer = document.getElementById('exam-review-questions-list');
  reviewContainer.innerHTML = '';

  graded.questions.forEach(q => {
    const qDiv = document.createElement('div');
    qDiv.className = 'hn-card';
    qDiv.style.marginBottom = '12px';
    const isCorr = q.result.isCorrect;
    qDiv.innerHTML = `
      <div class="hn-flex-between">
        <b>Q${q.number}: ${q.type.replace('_', ' ')}</b>
        <span class="hn-badge ${isCorr ? 'hn-badge-match' : 'hn-badge-unmatch'}">${isCorr ? 'Correct' : (q.result.mistakeCategory || 'Incorrect')}</span>
      </div>
      <p style="margin: 6px 0;">${q.prompt}</p>
      <div class="hn-secondary hn-text-xs">Your Answer: <b>${q.userAnswer !== null ? q.userAnswer : 'None'}</b> | Correct: <b>${q.roundedAnswer} ${q.targetUnit}</b></div>
      <div class="worked-steps-box" style="margin-top: 8px;">
        • ${q.steps.formula || ''}<br>
        • ${q.steps.dimensionalAnalysis || ''}
      </div>
    `;
    reviewContainer.appendChild(qDiv);
  });

  await ActivityLog.record('Completed dosage practice exam', { score: `${graded.score.pct}%`, passed: graded.score.passed });
}

function resetExamConfig() {
  document.getElementById('exam-results-panel').style.display = 'none';
  document.getElementById('exam-config-panel').style.display = 'block';
}

// ============================================================================
// 6. STATS CALCULATOR VIEW
// ============================================================================
async function initStatsCalculator() {
  document.getElementById('ws-btn-calc-stats').addEventListener('click', () => {
    const a = document.getElementById('ws-stats-a').value;
    const b = document.getElementById('ws-stats-b').value;
    const c = document.getElementById('ws-stats-c').value;
    const d = document.getElementById('ws-stats-d').value;
    const dir = document.getElementById('ws-stats-outcome-type').value;
    const name = document.getElementById('ws-stats-outcome-name').value || 'outcome';

    try {
      const res = StatsEngine.calculate2x2({ a, b, c, d, outcomeDirection: dir, outcomeName: name });
      document.getElementById('ws-stats-results-panel').style.display = 'block';

      document.getElementById('res-eer').textContent = `${res.eer} (${res.eerPct})`;
      document.getElementById('res-cer').textContent = `${res.cer} (${res.cerPct})`;
      document.getElementById('res-rr').textContent = res.rr ? res.rr.toFixed(3) : 'N/A';
      document.getElementById('res-rr-ci').textContent = res.rrCI ? `[95% CI: ${res.rrCI.lower}, ${res.rrCI.upper}]` : '';
      document.getElementById('res-or').textContent = res.or ? res.or.toFixed(3) : 'N/A';
      document.getElementById('res-or-ci').textContent = res.orCI ? `[95% CI: ${res.orCI.lower}, ${res.orCI.upper}]` : '';
      document.getElementById('res-arr').textContent = `${res.arr} (${res.arrPct})`;
      document.getElementById('res-rrr').textContent = res.rrrPct ? res.rrrPct : 'N/A';
      document.getElementById('res-nnt').textContent = res.nnt ? res.nnt : 'N/A';
      document.getElementById('res-nnh').textContent = res.nnh ? res.nnh : 'N/A';
      document.getElementById('res-stat-interpretation').textContent = res.interpretation;
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('btn-ci-eval').addEventListener('click', () => {
    const type = document.getElementById('ci-type-select').value;
    const est = document.getElementById('ci-est-input').value;
    const low = document.getElementById('ci-low-input').value;
    const up = document.getElementById('ci-up-input').value;

    try {
      const res = StatsEngine.interpretReportedCI({ type, estimate: est, ciLower: low, ciUpper: up });
      const box = document.getElementById('ci-interpretation-box');
      box.style.display = 'block';
      box.className = res.crossesNull ? 'hn-callout hn-callout-amber' : 'hn-callout';
      box.innerHTML = `<b>${res.relativeMeaning}</b><br><br>${res.explanation}`;
    } catch (err) {
      alert(err.message);
    }
  });
}

// ============================================================================
// 7. RESEARCH LIBRARY VIEW
// ============================================================================
async function initLibrary() {
  document.getElementById('lib-search-input').addEventListener('input', loadLibraryItems);
  document.getElementById('lib-filter-type').addEventListener('change', loadLibraryItems);
  loadLibraryItems();
}

async function loadLibraryItems() {
  const container = document.getElementById('lib-items-container');
  const search = (document.getElementById('lib-search-input')?.value || '').toLowerCase().trim();
  const filter = document.getElementById('lib-filter-type')?.value || 'all';

  const sources = await storage.getCollection('sources');
  const clips = await storage.getCollection('clips');
  const captures = await storage.getCollection('captures');

  let items = [];

  if (filter === 'all' || filter === 'journal-article') {
    items.push(...sources.map(s => ({ ...s, itemType: 'source' })));
  }
  if (filter === 'all' || filter === 'clips') {
    items.push(...clips.map(c => ({ ...c, itemType: 'clip' })));
  }
  if (filter === 'all' || filter === 'captures') {
    items.push(...captures.map(cp => ({ ...cp, itemType: 'capture' })));
  }

  // Literal search filter
  if (search) {
    items = items.filter(it => {
      const full = `${it.title || ''} ${it.text || ''} ${it.journal || ''} ${(it.authors || []).join(' ')} ${it.pageTitle || ''}`.toLowerCase();
      return full.includes(search);
    });
  }

  if (items.length === 0) {
    container.innerHTML = '<div class="hn-panel-quiet" style="text-align: center; padding: 24px;">No items match your literal library search criteria.</div>';
    return;
  }

  container.innerHTML = '';
  items.forEach(it => {
    const card = document.createElement('div');
    card.className = 'hn-card';
    card.style.marginBottom = '10px';

    if (it.itemType === 'source') {
      card.innerHTML = `
        <div class="hn-flex-between">
          <span class="hn-badge hn-badge-match">Research Source</span>
          <span class="hn-secondary hn-text-xs">${it.doi ? 'DOI: ' + it.doi : ''}</span>
        </div>
        <h3 style="margin: 6px 0 2px;">${it.title}</h3>
        <div class="hn-secondary hn-text-xs">${(it.authors || []).join(', ')} • ${it.journal || ''} • ${it.year || ''}</div>
      `;
    } else if (it.itemType === 'clip') {
      card.innerHTML = `
        <div class="hn-flex-between">
          <span class="hn-badge hn-badge-unknown">Clipped Quotation</span>
          <span class="hn-secondary hn-text-xs">${new Date(it.capturedAt).toLocaleDateString()}</span>
        </div>
        <blockquote style="margin: 8px 0; border-left: 3px solid var(--hn-teal); padding-left: 10px; font-style: italic;">“${it.text}”</blockquote>
        <div class="hn-secondary hn-text-xs">Source: <a href="${it.pageUrl}" target="_blank">${it.pageTitle}</a></div>
      `;
    } else if (it.itemType === 'capture') {
      card.innerHTML = `
        <div class="hn-flex-between">
          <span class="hn-badge hn-badge-unknown">Screen Capture</span>
          <span class="hn-secondary hn-text-xs">${new Date(it.capturedAt).toLocaleTimeString()}</span>
        </div>
        <div style="margin: 8px 0;"><img src="${it.dataUrl}" style="max-height: 140px; border-radius: 4px; border: 1px solid var(--hn-hair);"></div>
        <div class="hn-secondary hn-text-xs">${it.pageTitle}</div>
      `;
    }
    container.appendChild(card);
  });
}

// ============================================================================
// 8. FLASHCARDS VIEW
// ============================================================================
async function initFlashcards() {
  document.getElementById('fc-btn-flip').addEventListener('click', () => {
    document.getElementById('fc-back-side').style.display = 'block';
    document.getElementById('fc-btn-flip').style.display = 'none';
  });

  document.getElementById('fc-btn-correct').addEventListener('click', async () => {
    if (!activeStudyCard) return;
    await FlashcardsEngine.recordReview(activeStudyCard.id, true);
    await ActivityLog.record('Mastered flashcard review', { box: activeStudyCard.box + 1 });
    loadNextDueCard();
  });

  document.getElementById('fc-btn-wrong').addEventListener('click', async () => {
    if (!activeStudyCard) return;
    await FlashcardsEngine.recordReview(activeStudyCard.id, false);
    await ActivityLog.record('Reset flashcard to Box 1', { id: activeStudyCard.id });
    loadNextDueCard();
  });

  document.getElementById('fc-btn-create-card').addEventListener('click', async () => {
    const front = document.getElementById('fc-new-front').value.trim();
    const back = document.getElementById('fc-new-back').value.trim();
    const src = document.getElementById('fc-new-source').value.trim();

    if (!front || !back) {
      alert('Please fill in both the Question (Front) and Answer (Back).');
      return;
    }

    await FlashcardsEngine.createCard({ front, back, sourceTitle: src });
    document.getElementById('fc-new-front').value = '';
    document.getElementById('fc-new-back').value = '';
    document.getElementById('fc-new-source').value = '';
    await ActivityLog.record('Created Leitner flashcard', { question: front.substring(0, 30) });
    alert('Flashcard added to Box 1.');
    refreshFlashcardsView();
  });

  document.getElementById('fc-btn-export-anki').addEventListener('click', async () => {
    const txt = await FlashcardsEngine.exportToAnki();
    const blob = new Blob([txt], { type: 'text/tab-separated-values' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'HoneLENS_Flashcards_Anki.txt';
    a.click();
    URL.revokeObjectURL(url);
  });

  refreshFlashcardsView();
}

async function refreshFlashcardsView() {
  const stats = await FlashcardsEngine.getBoxStats();
  const boxBar = document.getElementById('leitner-boxes-tracker');
  boxBar.innerHTML = '';

  for (let b = 1; b <= 5; b++) {
    const pill = document.createElement('div');
    pill.className = `leitner-box-pill ${b === 1 && stats[1] > 0 ? 'has-due' : ''}`;
    pill.innerHTML = `<b>Box ${b}</b><br>${stats[b]} cards`;
    boxBar.appendChild(pill);
  }

  dueCardsQueue = await FlashcardsEngine.getDueCards();
  loadNextDueCard();
}

function loadNextDueCard() {
  if (dueCardsQueue.length === 0) {
    activeStudyCard = null;
    document.getElementById('fc-front-text').textContent = 'All due cards completed for today! Great job.';
    document.getElementById('fc-card-box-label').textContent = 'Session Complete';
    document.getElementById('fc-back-side').style.display = 'none';
    document.getElementById('fc-btn-flip').style.display = 'none';
    return;
  }

  activeStudyCard = dueCardsQueue.shift();
  document.getElementById('fc-card-box-label').textContent = `Leitner Box ${activeStudyCard.box}`;
  document.getElementById('fc-front-text').textContent = activeStudyCard.front;
  document.getElementById('fc-back-text').textContent = activeStudyCard.back;
  document.getElementById('fc-source-anchor').textContent = activeStudyCard.sourceTitle ? `Source: ${activeStudyCard.sourceTitle}` : '';

  document.getElementById('fc-back-side').style.display = 'none';
  document.getElementById('fc-btn-flip').style.display = 'inline-block';
}

// ============================================================================
// 9. APA 7 CITATION MAKER VIEW
// ============================================================================
async function initCitationMaker() {
  document.getElementById('btn-format-cite').addEventListener('click', () => {
    const rawAuthors = document.getElementById('cite-authors').value.trim();
    const authors = rawAuthors ? rawAuthors.split(/[;,]+/).map(a => a.trim()).filter(Boolean) : [];
    const year = parseInt(document.getElementById('cite-year').value, 10);
    const title = document.getElementById('cite-title').value.trim();
    const journal = document.getElementById('cite-journal').value.trim();
    const vol = document.getElementById('cite-vol').value.trim();
    const issue = document.getElementById('cite-issue').value.trim();
    const pages = document.getElementById('cite-pages').value.trim();
    const doi = document.getElementById('cite-doi').value.trim();

    const formatted = CitationMaker.formatApa7({
      authors,
      year: isNaN(year) ? null : year,
      title,
      journal,
      volume: vol,
      issue,
      page: pages,
      doi
    });

    const box = document.getElementById('cite-output-box');
    box.style.display = 'block';

    document.getElementById('cite-formatted-html').innerHTML = formatted.htmlText;
    document.getElementById('cite-intext-paren').textContent = formatted.inTextParenthetical;
    document.getElementById('cite-intext-narr').textContent = formatted.inTextNarrative;

    const flagBox = document.getElementById('cite-missing-flags');
    if (formatted.missingFields.length > 0) {
      flagBox.style.display = 'block';
      flagBox.textContent = `Notice: Missing required APA fields: ${formatted.missingFields.join(', ')}.`;
    } else {
      flagBox.style.display = 'none';
    }

    document.getElementById('btn-copy-formatted-cite').onclick = () => {
      navigator.clipboard.writeText(formatted.plainText);
      alert('Reference entry copied to clipboard.');
    };
  });
}

// ============================================================================
// 10. RESEARCH TRAIL / ACTIVITY LOG VIEW
// ============================================================================
async function initActivityLog() {
  document.getElementById('log-btn-clear').addEventListener('click', async () => {
    if (confirm('Clear personal research activity logs?')) {
      await ActivityLog.clearLogs();
      loadActivityLogs();
    }
  });

  document.getElementById('log-btn-export').addEventListener('click', async () => {
    const json = await ActivityLog.exportLogs();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'HoneLENS_Research_Trail.json';
    a.click();
    URL.revokeObjectURL(url);
  });
}

async function loadActivityLogs() {
  const container = document.getElementById('log-entries-list');
  const logs = await ActivityLog.getLogs();

  if (logs.length === 0) {
    container.innerHTML = '<div class="hn-panel-quiet" style="text-align: center; padding: 24px;">No personal research activities recorded yet.</div>';
    return;
  }

  container.innerHTML = '';
  logs.forEach(l => {
    const row = document.createElement('div');
    row.className = 'hn-card';
    row.style.padding = '10px 14px';
    row.style.marginBottom = '6px';
    row.innerHTML = `
      <div class="hn-flex-between">
        <b>${l.action}</b>
        <span class="hn-secondary hn-text-xs">${new Date(l.timestamp).toLocaleString()}</span>
      </div>
      <div class="hn-secondary hn-text-xs" style="margin-top: 4px;">${JSON.stringify(l.details || {})}</div>
    `;
    container.appendChild(row);
  });
}

// ============================================================================
// 11. PRIVACY & DISCLOSURES VIEW
// ============================================================================
async function initPrivacyHub() {
  document.getElementById('priv-btn-clear-cache').addEventListener('click', async () => {
    const cleared = await PrivacyHub.clearNetworkCache();
    alert(`Cleared ${cleared} cached bibliographic metadata items.`);
    loadPrivacyData();
  });
}

async function loadPrivacyData() {
  const sum = await PrivacyHub.getSummary();
  document.getElementById('priv-storage-used').textContent = `${sum.storageUsedKb} KB`;
}

// ============================================================================
// 12. BACKUP & SETTINGS VIEW
// ============================================================================
async function initBackupSettings() {
  // Topbar quick backup
  document.getElementById('topbar-btn-backup')?.addEventListener('click', exportHonePack);
  document.getElementById('btn-export-honepack-json')?.addEventListener('click', exportHonePack);

  document.getElementById('btn-restore-honepack')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('honepack-file-input');
    if (!fileInput.files?.length) {
      alert('Please choose a .json HonePack file to restore.');
      return;
    }
    const file = fileInput.files[0];
    const text = await file.text();
    try {
      const res = await HonePack.restoreBackup(text, 'merge');
      alert(`Restored successfully! Added ${JSON.stringify(res.restoredItems)}.`);
      location.reload();
    } catch (err) {
      alert('Restore failed: ' + err.message);
    }
  });

  // Plus Testing Mode Toggle
  const chkTestPlus = document.getElementById('chk-test-plus');
  const isPlusMode = await entitlement.isPlus();
  chkTestPlus.checked = isPlusMode;

  chkTestPlus.addEventListener('change', async (e) => {
    await entitlement.setTestPlusUnlocked(e.target.checked);
    await updateWorkspaceEntitlementBadge();
    alert(e.target.checked ? 'HoneLENS Plus testing mode enabled. All features unlocked!' : 'HoneLENS Free mode active.');
  });

  // License Activation
  document.getElementById('btn-activate-license')?.addEventListener('click', async () => {
    const key = document.getElementById('input-license-key').value;
    try {
      const res = await entitlement.activateLicenseKey(key);
      alert(res.message);
      await updateWorkspaceEntitlementBadge();
    } catch (err) {
      alert(err.message);
    }
  });

  updateWorkspaceEntitlementBadge();
}

async function exportHonePack() {
  const json = await HonePack.exportBackup();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `HoneLENS_Backup_${new Date().toISOString().slice(0, 10)}.honepack.json`;
  a.click();
  URL.revokeObjectURL(url);
  await ActivityLog.record('Exported HonePack backup', {});
}

async function updateWorkspaceEntitlementBadge() {
  const status = await entitlement.getStatus();
  const badge = document.getElementById('ws-plan-badge');
  const display = document.getElementById('license-status-display');

  if (status.plan === PLANS.PLUS) {
    badge.textContent = status.isTestMode ? 'HoneLENS Plus (Test Mode)' : 'HoneLENS Plus';
    badge.className = 'hn-badge hn-badge-match';
    if (display) display.textContent = status.hasLicense ? `Active License: ${status.licenseKey}` : 'Plus features unlocked via testing mode.';
  } else {
    badge.textContent = 'HoneLENS Free';
    badge.className = 'hn-badge hn-badge-unknown';
    if (display) display.textContent = 'Standard free features active.';
  }
}

async function initSettingsAndEntitlements() {
  await entitlement.init();
}
