// HoneLENS Content Script
// Reads in-page bibliographic metadata and provides discreet clipping feedback.

(() => {
  // Extract bibliographic metadata from current web page
  function extractPageMetadata() {
    const getMeta = (names) => {
      for (const name of names) {
        const el = document.querySelector(`meta[name="${name}" i], meta[property="${name}" i]`);
        if (el && el.content) return el.content.trim();
      }
      return null;
    };

    const doiRegex = /\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)\b/;
    let doi = getMeta(['citation_doi', 'dc.identifier', 'bepress_citation_doi']);
    if (!doi) {
      const match = (document.body?.innerText || '').match(doiRegex) || window.location.href.match(doiRegex);
      if (match) doi = match[1];
    }

    let pmid = getMeta(['citation_pmid']);
    if (!pmid) {
      const pmidMatch = window.location.href.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
      if (pmidMatch) pmid = pmidMatch[1];
    }

    const title = getMeta(['citation_title', 'dc.title', 'og:title']) || document.title || '';
    const journal = getMeta(['citation_journal_title', 'dc.source', 'og:site_name']) || '';
    const dateStr = getMeta(['citation_publication_date', 'citation_date', 'dc.date', 'article:published_time']) || '';

    let year = null;
    if (dateStr) {
      const ym = dateStr.match(/\b(19\d\d|20\d\d)\b/);
      if (ym) year = parseInt(ym[1], 10);
    }

    return {
      title,
      journal,
      year,
      doi: doi ? doi.replace(/[.,;)]+$/, '') : null,
      pmid: pmid || null,
      url: window.location.href,
      pageTextLength: (document.body?.innerText || '').length
    };
  }

  // Show restrained HoneNurse toast notification
  function showToast(message, isSuccess = true) {
    let toast = document.getElementById('honelens-toast-notice');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'honelens-toast-notice';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = `honelens-toast-active ${isSuccess ? 'honelens-toast-success' : 'honelens-toast-warn'}`;

    setTimeout(() => {
      toast.className = '';
    }, 2500);
  }

  // Listen for messages from background service worker or popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET_PAGE_METADATA') {
      const meta = extractPageMetadata();
      sendResponse({ success: true, metadata: meta });
      return false;
    }

    if (request.action === 'CLIP_SUCCESS') {
      showToast('Clipped to HoneLENS research library');
      sendResponse({ success: true });
      return false;
    }

    if (request.action === 'GET_SELECTED_TEXT') {
      const sel = window.getSelection()?.toString() || '';
      sendResponse({ success: true, text: sel });
      return false;
    }
  });
})();
