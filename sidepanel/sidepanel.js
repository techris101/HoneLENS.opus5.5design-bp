// HoneLENS Side Panel Controller
import { metadataResolver } from '../core/metadata-resolver.js';
import { CriteriaEngine, EVIDENCE_FRAMEWORKS } from '../core/criteria-engine.js';
import { CitationMaker } from '../core/citation-maker.js';
import { FlashcardsEngine } from '../core/flashcards-engine.js';
import { storage } from '../core/storage.js';
import { ActivityLog } from '../core/activity-log.js';

let activeSource = null;

document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupActions();
  await inspectTab();

  // Check if draft card is waiting
  const draft = await storage.get(['active_card_draft']);
  if (draft.active_card_draft) {
    document.getElementById('card-front').value = draft.active_card_draft.front || '';
    // Switch to card tab
    document.querySelector('.hn-tab-btn[data-tab="sp-tab-card"]')?.click();
    await storage.remove(['active_card_draft']);
  }
});

function setupTabs() {
  const tabs = document.querySelectorAll('.hn-tab-bar .hn-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.sp-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
}

function setupActions() {
  document.getElementById('btn-open-full-workspace')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('workspace/workspace.html') });
  });

  document.getElementById('btn-refresh-active')?.addEventListener('click', inspectTab);

  document.getElementById('btn-sp-check')?.addEventListener('click', () => {
    const val = document.getElementById('sp-manual-doi').value.trim();
    if (val) resolveIdentifier(val);
  });

  document.getElementById('btn-sp-copy-apa')?.addEventListener('click', () => {
    if (activeSource) {
      const cite = CitationMaker.formatApa7(activeSource);
      navigator.clipboard.writeText(cite.plainText);
      alert('APA 7 reference copied to clipboard:\n' + cite.plainText);
    }
  });

  document.getElementById('btn-add-to-assignment')?.addEventListener('click', async () => {
    if (activeSource) {
      await storage.addItem('sources', activeSource);
      await ActivityLog.record('Added source to assignment workspace', { title: activeSource.title });
      alert('Source added to your HoneLENS research library and assignment matrix.');
    }
  });

  document.getElementById('btn-save-reading-sheet')?.addEventListener('click', async () => {
    const sheet = {
      question: document.getElementById('rs-question').value.trim(),
      design: document.getElementById('rs-design').value.trim(),
      sample: document.getElementById('rs-sample').value.trim(),
      findings: document.getElementById('rs-findings').value.trim(),
      limitations: document.getElementById('rs-limitations').value.trim(),
      clinicalRelevance: document.getElementById('rs-relevance').value.trim(),
      savedAt: new Date().toISOString()
    };

    if (activeSource) {
      activeSource.readingSheet = sheet;
      await storage.addItem('sources', activeSource);
    } else {
      await storage.addItem('notes', { type: 'reading_sheet', data: sheet, savedAt: new Date().toISOString() });
    }

    await ActivityLog.record('Completed appraisal reading sheet', { design: sheet.design });
    alert('Reading sheet successfully saved to your local EBP workspace.');
  });

  document.getElementById('btn-save-card')?.addEventListener('click', async () => {
    const front = document.getElementById('card-front').value.trim();
    const back = document.getElementById('card-back').value.trim();
    const locator = document.getElementById('card-locator').value.trim();

    if (!front || !back) {
      alert('Please enter both the question (front) and answer/rationale (back).');
      return;
    }

    await FlashcardsEngine.createCard({
      front,
      back,
      sourceTitle: activeSource?.title || 'Web Source',
      sourceUrl: activeSource?.url || '',
      pageLocator: locator
    });

    await ActivityLog.record('Created source-anchored flashcard', { question: front.substring(0, 40) });

    const status = document.getElementById('card-save-status');
    status.style.display = 'block';
    status.textContent = 'Card saved into Leitner Box 1 (Review Daily).';
    document.getElementById('card-front').value = '';
    document.getElementById('card-back').value = '';
    document.getElementById('card-locator').value = '';

    setTimeout(() => { status.style.display = 'none'; }, 3000);
  });
}

async function inspectTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_METADATA' }, async (response) => {
      if (chrome.runtime.lastError || !response?.metadata) {
        document.getElementById('sp-article-title').textContent = tab.title || 'Page Active';
        document.getElementById('sp-article-meta').textContent = tab.url;
        return;
      }

      const meta = response.metadata;
      if (meta.doi) {
        await resolveIdentifier(meta.doi);
      } else if (meta.pmid) {
        await resolveIdentifier(meta.pmid);
      } else {
        renderSource(meta);
      }
    });
  } catch (err) {
    // Non-fatal
  }
}

async function resolveIdentifier(id) {
  const isPmid = /^\d{7,9}$/.test(id);
  try {
    const source = isPmid ? await metadataResolver.fetchPubMed(id) : await metadataResolver.fetchCrossref(id);
    renderSource(source);
  } catch (err) {
    alert(err.message);
  }
}

function renderSource(source) {
  activeSource = source;
  document.getElementById('sp-article-title').textContent = source.title || 'Untitled Source';
  document.getElementById('sp-article-meta').textContent = `${(source.authors || []).join(', ')} • ${source.journal || ''} • ${source.year || 'n.d.'}`;

  // Evaluate against criteria
  const evalRes = CriteriaEngine.evaluateSource(source, {
    dateWindow: 5,
    requiredType: 'journal-article',
    framework: EVIDENCE_FRAMEWORKS.MELNYK
  });

  const card = document.getElementById('sp-eval-card');
  card.style.display = 'block';

  const badge = document.getElementById('sp-eval-badge');
  badge.textContent = evalRes.overallMatches ? 'Matches' : (evalRes.hasFailures ? 'Flagged' : 'Review Needed');
  badge.className = `hn-badge ${evalRes.overallMatches ? 'hn-badge-match' : (evalRes.hasFailures ? 'hn-badge-unmatch' : 'hn-badge-unknown')}`;

  const list = document.getElementById('sp-criteria-items');
  list.innerHTML = '';
  evalRes.results.forEach(r => {
    const div = document.createElement('div');
    div.className = 'criterion-item';
    div.innerHTML = `
      <div><b>${r.criterion}:</b> ${r.actual}</div>
      <span class="hn-badge ${r.status === 'matches' ? 'hn-badge-match' : 'hn-badge-unmatch'}">${r.status}</span>
    `;
    list.appendChild(div);
  });

  const alertBox = document.getElementById('sp-retraction-alert');
  if (source.retractionStatus === 'RETRACTED') {
    alertBox.style.display = 'block';
    alertBox.textContent = 'PATIENT SAFETY ALERT: Retraction notice found on record. Do not rely on findings.';
  } else {
    alertBox.style.display = 'none';
  }

  const frameBox = document.getElementById('sp-framework-box');
  if (evalRes.frameworkResult) {
    frameBox.style.display = 'block';
    frameBox.innerHTML = `<b>${evalRes.frameworkResult.level}:</b> ${evalRes.frameworkResult.description}`;
  } else {
    frameBox.style.display = 'none';
  }
}
