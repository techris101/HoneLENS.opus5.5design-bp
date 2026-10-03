// Local-First Storage Layer for HoneLENS
// Backed by chrome.storage.local with automatic fallback for tests and standalone pages

class StorageService {
  constructor() {
    this.memoryStore = {};
    this.isChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  async get(keys) {
    if (this.isChromeStorage) {
      return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => resolve(result || {}));
      });
    }
    
    // In-memory or localStorage fallback
    if (typeof localStorage !== 'undefined') {
      const result = {};
      const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
      for (const k of keyList) {
        const item = localStorage.getItem('honelens_' + k);
        if (item !== null) {
          try { result[k] = JSON.parse(item); } catch (e) { result[k] = item; }
        } else if (keys && typeof keys === 'object' && !Array.isArray(keys) && k in keys) {
          result[k] = keys[k];
        }
      }
      return result;
    }

    const result = {};
    const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
    for (const k of keyList) {
      if (k in this.memoryStore) {
        result[k] = this.memoryStore[k];
      }
    }
    return result;
  }

  async set(items) {
    if (this.isChromeStorage) {
      return new Promise((resolve) => {
        chrome.storage.local.set(items, () => resolve());
      });
    }

    if (typeof localStorage !== 'undefined') {
      for (const [k, v] of Object.entries(items)) {
        localStorage.setItem('honelens_' + k, JSON.stringify(v));
      }
      return;
    }

    for (const [k, v] of Object.entries(items)) {
      this.memoryStore[k] = v;
    }
  }

  async remove(keys) {
    const keyList = Array.isArray(keys) ? keys : [keys];
    if (this.isChromeStorage) {
      return new Promise((resolve) => {
        chrome.storage.local.remove(keyList, () => resolve());
      });
    }
    if (typeof localStorage !== 'undefined') {
      for (const k of keyList) {
        localStorage.removeItem('honelens_' + k);
      }
      return;
    }
    for (const k of keyList) {
      delete this.memoryStore[k];
    }
  }

  // Collection-specific helpers
  async getCollection(collectionName) {
    const data = await this.get([collectionName]);
    return Array.isArray(data[collectionName]) ? data[collectionName] : [];
  }

  async saveCollection(collectionName, items) {
    await this.set({ [collectionName]: items });
  }

  async addItem(collectionName, item) {
    const items = await this.getCollection(collectionName);
    if (!item.id) {
      item.id = 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }
    if (!item.createdAt) {
      item.createdAt = new Date().toISOString();
    }
    item.updatedAt = new Date().toISOString();
    items.unshift(item);
    await this.saveCollection(collectionName, items);
    return item;
  }

  async updateItem(collectionName, id, updates) {
    const items = await this.getCollection(collectionName);
    const index = items.findIndex(x => x.id === id);
    if (index !== -1) {
      items[index] = { ...items[index], ...updates, updatedAt: new Date().toISOString() };
      await this.saveCollection(collectionName, items);
      return items[index];
    }
    return null;
  }

  async deleteItem(collectionName, id) {
    const items = await this.getCollection(collectionName);
    const filtered = items.filter(x => x.id !== id);
    await this.saveCollection(collectionName, filtered);
  }

  // Get total storage usage estimate
  async getStorageUsage() {
    if (this.isChromeStorage && chrome.storage.local.getBytesInUse) {
      return new Promise((resolve) => {
        chrome.storage.local.getBytesInUse(null, (bytes) => resolve(bytes));
      });
    }
    let total = 0;
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('honelens_')) {
          total += (localStorage.getItem(k) || '').length * 2;
        }
      }
    }
    return total;
  }
}

export const storage = new StorageService();
