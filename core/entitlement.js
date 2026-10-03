// HoneLENS Entitlement & Feature Gate Layer
// Manages Free vs HoneLENS Plus features with a testing toggle for immediate evaluation
import { storage } from './storage.js';

export const PLANS = {
  FREE: 'free',
  PLUS: 'plus'
};

export const FEATURES = {
  SOURCE_CHECK_SINGLE: 'source_check_single',
  DOSAGE_TRAINER: 'dosage_trainer',
  STATS_CALCULATOR: 'stats_calculator',
  PAGE_CAPTURE: 'page_capture',
  SOURCE_CLIPPER: 'source_clipper',
  LOCAL_LIBRARY: 'local_library',
  APA_CITATION_MAKER: 'apa_citation_maker',
  FLASHCARDS_LEITNER: 'flashcards_leitner',
  HONEPACK_PORTABILITY: 'honepack_portability',
  PRIVACY_HUB: 'privacy_hub',
  
  // Plus features
  EBP_MULTIPLE_WORKSPACES: 'ebp_multiple_workspaces',
  EBP_FULL_MATRIX: 'ebp_full_matrix',
  EBP_DOCX_EXPORT: 'ebp_docx_export',
  DOSAGE_EXAM_SIMULATOR: 'dosage_exam_simulator',
  SOURCE_AUDIT_BATCH: 'source_audit_batch',
  SOURCE_AUDIT_DOCX: 'source_audit_docx'
};

class EntitlementManager {
  constructor() {
    this.currentPlan = PLANS.FREE;
    this.isTestUnlocked = false; // Enabled for testing
    this.licenseData = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    const settings = await storage.get(['plan', 'test_plus_unlocked', 'license']);
    this.currentPlan = settings.plan || PLANS.FREE;
    // Default test unlock is TRUE for development and testing as requested by user
    this.isTestUnlocked = settings.test_plus_unlocked !== undefined ? settings.test_plus_unlocked : true;
    this.licenseData = settings.license || null;
    this.initialized = true;
  }

  async isPlus() {
    await this.init();
    return this.currentPlan === PLANS.PLUS || this.isTestUnlocked;
  }

  async canAccess(featureKey) {
    await this.init();
    const plusUnlocked = await this.isPlus();
    switch (featureKey) {
      case FEATURES.EBP_MULTIPLE_WORKSPACES:
      case FEATURES.EBP_FULL_MATRIX:
      case FEATURES.EBP_DOCX_EXPORT:
      case FEATURES.DOSAGE_EXAM_SIMULATOR:
      case FEATURES.SOURCE_AUDIT_BATCH:
      case FEATURES.SOURCE_AUDIT_DOCX:
        return plusUnlocked;
      default:
        return true; // All core clinical tools are free
    }
  }

  async setTestPlusUnlocked(enabled) {
    this.isTestUnlocked = !!enabled;
    await storage.set({ test_plus_unlocked: this.isTestUnlocked });
    return this.isTestUnlocked;
  }

  async activateLicenseKey(licenseKey) {
    await this.init();
    if (!licenseKey || licenseKey.trim().length < 8) {
      throw new Error('Please enter a valid HoneLENS Plus license key.');
    }
    const cleanKey = licenseKey.trim().toUpperCase();
    this.licenseData = {
      key: cleanKey,
      status: 'active',
      plan: PLANS.PLUS,
      activatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    };
    this.currentPlan = PLANS.PLUS;
    await storage.set({
      plan: PLANS.PLUS,
      license: this.licenseData
    });
    return { success: true, plan: PLANS.PLUS, message: 'HoneLENS Plus successfully activated.' };
  }

  async deactivateLicense() {
    this.currentPlan = PLANS.FREE;
    this.licenseData = null;
    await storage.set({
      plan: PLANS.FREE,
      license: null
    });
    return { success: true, plan: PLANS.FREE };
  }

  async getStatus() {
    await this.init();
    const isPlus = await this.isPlus();
    return {
      plan: isPlus ? PLANS.PLUS : PLANS.FREE,
      isTestMode: this.isTestUnlocked,
      hasLicense: !!this.licenseData,
      licenseKey: this.licenseData ? this.licenseData.key : null,
      activatedAt: this.licenseData ? this.licenseData.activatedAt : null
    };
  }
}

export const entitlement = new EntitlementManager();
