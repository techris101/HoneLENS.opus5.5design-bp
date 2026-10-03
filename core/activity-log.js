// Personal Research Trail & Activity Log
// Optional personal research audit trail. Zero surveillance. Can be disabled, exported, or wiped at any time.

import { storage } from './storage.js';

export class ActivityLog {
  // Check if logging is enabled
  static async isEnabled() {
    const settings = await storage.get(['activity_log_enabled']);
    return settings.activity_log_enabled !== false; // Default enabled
  }

  // Toggle logging state
  static async setEnabled(enabled) {
    await storage.set({ activity_log_enabled: !!enabled });
  }

  // Record an action taken inside HoneLENS
  static async record(action, details = {}) {
    const enabled = await this.isEnabled();
    if (!enabled) return null;

    const entry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toISOString(),
      action,
      details,
      disclaimer: 'Personal research trail. Not proof of authorship or external AI non-use.'
    };

    const logs = await storage.getCollection('activityLogs');
    // Keep last 500 entries locally
    logs.unshift(entry);
    if (logs.length > 500) logs.pop();
    await storage.saveCollection('activityLogs', logs);
    return entry;
  }

  // Get all logs
  static async getLogs() {
    return await storage.getCollection('activityLogs');
  }

  // Clear all logs
  static async clearLogs() {
    await storage.saveCollection('activityLogs', []);
  }

  // Export logs to plain text or JSON
  static async exportLogs() {
    const logs = await this.getLogs();
    return JSON.stringify(logs, null, 2);
  }
}
