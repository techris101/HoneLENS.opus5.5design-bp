// HoneLENS Popup Controller
import { metadataResolver } from '../core/metadata-resolver.js';
import { CriteriaEngine, EVIDENCE_FRAMEWORKS } from '../core/criteria-engine.js';
import { DosageEngine, PROBLEM_TYPES } from '../core/dosage-engine.js';
import { StatsEngine } from '../core/stats-engine.js';
import { CitationMaker } from '../core/citation-maker.js';
import { storage } from '../core/storage.js';
import { entitlement } from '../core/entitlement.js';
import { ActivityLog } from '../core/activity-log.js';

let currentEvaluatedSource = null;
let currentDosageProblem = null;
let activeTabMetadata = null;

document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupHeaderButtons();
  setupSourceCheck();
  setupDosageTrainer();
  setupStatsCalculator();
  setupCaptureAndClipper();
  await updatePlanBadge();

  // Try to inspect active tab
  inspectActiveTab();
});

// Tab navigation
function setupTabs() {
  const tabs = document.querySelectorAll('.popup-nav .hn-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.popup-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
}

// Header Workspace and Side Panel buttons
function setupHeaderButtons() {
  document.getElementById('btn-open-workspace')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('workspace/workspace.html') });
  });

  document.getElementById('btn-open-sidepanel')?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && chrome.sidePanel) {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  });

  document.getElementById('link-more-honenurse')?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('workspace/workspace.html#settings') });
  });
}

// Plan Badge
async function updatePlanBadge() {
  const isPlus = await entitlement.isPlus();
  const badge = document.getElementById('popup-plan-indicator');
  if (badge) {
    if (isPlus) {
      badge.textContent = 'HoneLENS Plus';
      badge.className = 'hn-badge hn-badge-match';
    } else {
      badge.textContent = 'HoneLENS Free';
      badge.className = 'hn-badge hn-badge-unknown';
    }
  }
}

// Inspect active tab for meta tags
async function inspectActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || tab.url.startsWith('chrome://')) return;

    chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_METADATA' }, (response) => {
      if (chrome.runtime.lastError || !response?.metadata) return;

      const meta = response.metadata;
      if (meta.doi || meta.pmid || (meta.title && meta.journal)) {
        activeTabMetadata = meta;
        const card = document.getElementById('detected-meta-card');
        card.style.display = 'block';
        document.getElementById('detected-title').textContent = meta.title || tab.title;
        document.getElementById('detected-type').textContent = meta.doi ? 'DOI Detected' : (meta.pmid ? 'PubMed Detected' : 'Article');
        document.getElementById('detected-authors').textContent = meta.journal || (meta.authors || []).join(', ') || 'Online Source';
        document.getElementById('detected-year').textContent = meta.year || 'Current';

        if (meta.doi) {
          document.getElementById('input-doi-pmid').value = meta.doi;
        } else if (meta.pmid) {
          document.getElementById('input-doi-pmid').value = meta.pmid;
        }
      }
    });
  } catch (err) {
    // Non-fatal tab query error
  }
}

// Source Check Tab
function setupSourceCheck() {
  const input = document.getElementById('input-doi-pmid');
  const btnCheck = document.getElementById('btn-check-source');
  const btnEvalActive = document.getElementById('btn-evaluate-active');

  btnCheck.addEventListener('click', () => runSourceCheck(input.value.trim()));
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') runSourceCheck(input.value.trim());
  });

  btnEvalActive?.addEventListener('click', () => {
    if (activeTabMetadata) {
      if (activeTabMetadata.doi) runSourceCheck(activeTabMetadata.doi);
      else if (activeTabMetadata.pmid) runSourceCheck(activeTabMetadata.pmid);
      else renderEvaluation(activeTabMetadata);
    }
  });

  document.getElementById('btn-save-to-library')?.addEventListener('click', async () => {
    if (currentEvaluatedSource) {
      await storage.addItem('sources', currentEvaluatedSource);
      await ActivityLog.record('Saved source to library', { title: currentEvaluatedSource.title });
      alert('Source saved to your local HoneLENS library.');
    }
  });

  document.getElementById('btn-copy-citation')?.addEventListener('click', () => {
    if (currentEvaluatedSource) {
      const cite = CitationMaker.formatApa7(currentEvaluatedSource);
      navigator.clipboard.writeText(cite.plainText);
      alert('APA 7 citation copied to clipboard:\n' + cite.plainText);
    }
  });
}

async function runSourceCheck(query) {
  if (!query) {
    alert('Please enter a DOI or PMID.');
    return;
  }

  const btnCheck = document.getElementById('btn-check-source');
  btnCheck.textContent = 'Checking...';
  btnCheck.disabled = true;

  try {
    let sourceMeta = null;
    const isPmid = /^\d{7,9}$/.test(query);

    if (isPmid) {
      sourceMeta = await metadataResolver.fetchPubMed(query);
    } else {
      sourceMeta = await metadataResolver.fetchCrossref(query);
    }

    renderEvaluation(sourceMeta);
    await ActivityLog.record('Checked research source', { query, title: sourceMeta.title });
  } catch (err) {
    alert(err.message);
  } finally {
    btnCheck.textContent = 'Check';
    btnCheck.disabled = false;
  }
}

function renderEvaluation(source) {
  currentEvaluatedSource = source;
  const container = document.getElementById('source-eval-container');
  container.style.display = 'block';

  document.getElementById('result-source-title').textContent = source.title || 'Untitled Source';
  document.getElementById('result-source-meta').textContent = `${(source.authors || []).slice(0, 2).join(', ')} • ${source.journal || ''} • ${source.year || 'n.d.'}`;

  // Run Criteria Engine
  const criteria = {
    dateWindow: 5,
    requiredType: 'journal-article',
    framework: EVIDENCE_FRAMEWORKS.MELNYK
  };

  const evalResult = CriteriaEngine.evaluateSource(source, criteria);

  const statusBadge = document.getElementById('result-status-badge');
  if (evalResult.hasFailures) {
    statusBadge.textContent = 'Criteria Flagged';
    statusBadge.className = 'hn-badge hn-badge-unmatch';
  } else if (evalResult.overallMatches) {
    statusBadge.textContent = 'Criteria Matches';
    statusBadge.className = 'hn-badge hn-badge-match';
  } else {
    statusBadge.textContent = 'Review Needed';
    statusBadge.className = 'hn-badge hn-badge-unknown';
  }

  const listEl = document.getElementById('result-criteria-list');
  listEl.innerHTML = '';
  evalResult.results.forEach(res => {
    const item = document.createElement('div');
    item.className = 'criterion-item';
    const tagClass = res.status === 'matches' ? 'hn-badge-match' : (res.status === 'does_not_match' ? 'hn-badge-unmatch' : 'hn-badge-unknown');
    const label = res.status === 'matches' ? 'Matches' : (res.status === 'does_not_match' ? 'Mismatch' : 'Unknown');
    item.innerHTML = `
      <div>
        <b>${res.criterion}:</b> ${res.actual}
      </div>
      <span class="hn-badge ${tagClass}">${label}</span>
    `;
    listEl.appendChild(item);
  });

  // Retraction / Framework callout
  const retractBox = document.getElementById('result-retraction-box');
  if (source.retractionStatus === 'RETRACTED') {
    retractBox.style.display = 'block';
    retractBox.className = 'hn-callout hn-callout-danger';
    retractBox.innerHTML = '<b>PATIENT DANGER ALERT:</b> A matched retraction record was found for this DOI. Do not use for clinical recommendations.';
  } else {
    retractBox.style.display = 'none';
  }

  const frameBox = document.getElementById('result-framework-box');
  if (evalResult.frameworkResult) {
    frameBox.style.display = 'block';
    frameBox.innerHTML = `<b>${evalResult.frameworkResult.level}:</b> ${evalResult.frameworkResult.description} <br><span class="hn-text-xs hn-secondary">(${evalResult.frameworkResult.label})</span>`;
  } else {
    frameBox.style.display = 'none';
  }
}

// Dosage Trainer Tab
function setupDosageTrainer() {
  const btnNew = document.getElementById('btn-new-dosage');
  const btnCheck = document.getElementById('btn-check-dosage');
  const answerInput = document.getElementById('dosage-user-answer');

  btnNew.addEventListener('click', loadNewDosageProblem);
  btnCheck.addEventListener('click', verifyDosageAnswer);
  answerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') verifyDosageAnswer();
  });

  // Load first problem immediately
  loadNewDosageProblem();
}

function loadNewDosageProblem() {
  const types = Object.values(PROBLEM_TYPES);
  const randomType = types[Math.floor(Math.random() * types.length)];
  currentDosageProblem = DosageEngine.generateProblem(randomType);

  document.getElementById('dosage-prompt').textContent = currentDosageProblem.prompt;
  document.getElementById('dosage-target-unit').textContent = currentDosageProblem.targetUnit;
  document.getElementById('dosage-rounding-rule').textContent = currentDosageProblem.roundingRule;
  document.getElementById('dosage-user-answer').value = '';
  document.getElementById('dosage-feedback-card').style.display = 'none';
}

function verifyDosageAnswer() {
  if (!currentDosageProblem) return;
  const val = document.getElementById('dosage-user-answer').value;
  const result = DosageEngine.checkAnswer(currentDosageProblem, val);

  const card = document.getElementById('dosage-feedback-card');
  card.style.display = 'block';

  const badge = document.getElementById('dosage-feedback-badge');
  const ansEl = document.getElementById('dosage-correct-answer');
  const stepsEl = document.getElementById('dosage-worked-steps');

  if (result.isCorrect) {
    badge.textContent = 'Correct';
    badge.className = 'hn-badge hn-badge-match';
    ansEl.textContent = `${result.correctAnswer} ${currentDosageProblem.targetUnit}`;
  } else {
    badge.textContent = result.mistakeCategory || 'Incorrect';
    badge.className = 'hn-badge hn-badge-unmatch';
    ansEl.textContent = `Target: ${result.correctAnswer} ${currentDosageProblem.targetUnit}`;
  }

  const s = currentDosageProblem.steps;
  stepsEl.innerHTML = `
    <b>Worked Solution:</b><br>
    ${s.formula ? `• Formula: ${s.formula}<br>` : ''}
    ${s.dimensionalAnalysis ? `• Dimensional Analysis: ${s.dimensionalAnalysis}<br>` : ''}
    ${s.explanation ? `• Note: ${s.explanation}` : ''}
  `;
}

// Stats Calculator Tab
function setupStatsCalculator() {
  document.getElementById('btn-calc-stats').addEventListener('click', () => {
    const a = document.getElementById('stats-a').value;
    const b = document.getElementById('stats-b').value;
    const c = document.getElementById('stats-c').value;
    const d = document.getElementById('stats-d').value;

    try {
      const res = StatsEngine.calculate2x2({ a, b, c, d });
      const box = document.getElementById('stats-result-box');
      box.style.display = 'block';

      document.getElementById('stat-rr').textContent = res.rr ? res.rr.toFixed(2) : 'N/A';
      document.getElementById('stat-or').textContent = res.or ? res.or.toFixed(2) : 'N/A';
      document.getElementById('stat-arr').textContent = res.arrPct;
      document.getElementById('stat-nnt').textContent = res.nnt ? `NNT = ${res.nnt}` : (res.nnh ? `NNH = ${res.nnh}` : 'N/A');
      document.getElementById('stat-interpretation').textContent = res.interpretation;
    } catch (err) {
      alert(err.message);
    }
  });
}

// Capture and Clipper Tab
function setupCaptureAndClipper() {
  const btnCapture = document.getElementById('btn-capture-tab');
  const btnClip = document.getElementById('btn-clip-active-tab');
  const statusBox = document.getElementById('capture-status-box');

  btnCapture.addEventListener('click', () => {
    btnCapture.disabled = true;
    btnCapture.textContent = 'Capturing...';

    chrome.runtime.sendMessage({ action: 'CAPTURE_VISIBLE_TAB' }, (response) => {
      btnCapture.disabled = false;
      btnCapture.textContent = 'Capture Visible Tab';

      if (response?.success) {
        statusBox.style.display = 'block';
        statusBox.className = 'hn-callout';
        statusBox.textContent = `Screenshot captured successfully (${new Date().toLocaleTimeString()}). View in Workspace Library.`;
      } else {
        statusBox.style.display = 'block';
        statusBox.className = 'hn-callout hn-callout-amber';
        statusBox.textContent = response?.error || 'Unable to capture tab.';
      }
    });
  });

  btnClip.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { action: 'GET_SELECTED_TEXT' }, async (response) => {
      const text = response?.text;
      if (!text || text.trim().length === 0) {
        alert('Please highlight or select text on the webpage first, then click Clip.');
        return;
      }

      await storage.addItem('clips', {
        text: text.trim(),
        pageTitle: tab.title || 'Web Page',
        pageUrl: tab.url || '',
        capturedAt: new Date().toISOString()
      });
      await ActivityLog.record('Clipped selection to library', { title: tab.title });

      statusBox.style.display = 'block';
      statusBox.className = 'hn-callout';
      statusBox.textContent = 'Excerpt saved to your HoneLENS research library.';
    });
  });
}
