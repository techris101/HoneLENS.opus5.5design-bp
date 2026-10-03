// HoneLENS Background Service Worker (Manifest V3)
// Coordinates context menus, page captures, side panel, and public metadata lookups.

import { storage } from '../core/storage.js';
import { metadataResolver } from '../core/metadata-resolver.js';
import { ActivityLog } from '../core/activity-log.js';

// Setup Context Menus on Installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'honelens_clip_text',
    title: 'Clip selection to HoneLENS',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'honelens_check_identifier',
    title: 'Check DOI / PMID with HoneLENS',
    contexts: ['selection', 'link']
  });

  chrome.contextMenus.create({
    id: 'honelens_create_card',
    title: 'Create Flashcard from selection',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'honelens_open_workspace',
    title: 'Open HoneLENS Full Workspace',
    contexts: ['page', 'action']
  });
});

// Handle Context Menu Actions
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'honelens_clip_text') {
    const clip = {
      text: info.selectionText,
      pageTitle: tab?.title || 'Web Page',
      pageUrl: tab?.url || '',
      capturedAt: new Date().toISOString(),
      studentNote: ''
    };
    await storage.addItem('clips', clip);
    await ActivityLog.record('Clipped text excerpt', { title: clip.pageTitle, url: clip.pageUrl });

    // Notify tab with subtle confirmation
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'CLIP_SUCCESS', text: clip.text }).catch(() => {});
    }
  } else if (info.menuItemId === 'honelens_create_card') {
    const cardDraft = {
      front: 'Clinical excerpt: "' + info.selectionText + '"',
      back: '',
      sourceTitle: tab?.title || '',
      sourceUrl: tab?.url || '',
      createdAt: new Date().toISOString()
    };
    await storage.set({ active_card_draft: cardDraft });
    // Open side panel or workspace
    if (tab?.id && chrome.sidePanel) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  } else if (info.menuItemId === 'honelens_check_identifier') {
    const target = info.selectionText || info.linkUrl || '';
    await storage.set({ quick_check_query: target });
    if (tab?.id && chrome.sidePanel) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  } else if (info.menuItemId === 'honelens_open_workspace') {
    chrome.tabs.create({ url: chrome.runtime.getURL('workspace/workspace.html') });
  }
});

// Handle Messages from Extension Pages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'CAPTURE_VISIBLE_TAB') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, async (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({ success: false, error: chrome.runtime.lastError?.message || 'Capture failed' });
        return;
      }
      const captureItem = {
        dataUrl,
        pageTitle: sender.tab?.title || 'Captured Screen',
        pageUrl: sender.tab?.url || '',
        capturedAt: new Date().toISOString()
      };
      await storage.addItem('captures', captureItem);
      await ActivityLog.record('Captured page screenshot', { title: captureItem.pageTitle });
      sendResponse({ success: true, capture: captureItem });
    });
    return true; // Keep message channel open for async response
  }

  if (request.action === 'RESOLVE_DOI') {
    metadataResolver.fetchCrossref(request.doi)
      .then(res => sendResponse({ success: true, data: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'RESOLVE_PMID') {
    metadataResolver.fetchPubMed(request.pmid)
      .then(res => sendResponse({ success: true, data: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'OPEN_WORKSPACE') {
    chrome.tabs.create({ url: chrome.runtime.getURL('workspace/workspace.html' + (request.route ? '#' + request.route : '')) });
    sendResponse({ success: true });
    return false;
  }

  if (request.action === 'OPEN_SIDEPANEL') {
    if (sender.tab?.id && chrome.sidePanel) {
      chrome.sidePanel.open({ tabId: sender.tab.id });
    }
    sendResponse({ success: true });
    return false;
  }
});
