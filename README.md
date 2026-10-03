# HoneLENS — Clinical Evidence & Nursing Research Tools

> **"Sharpen your clinical judgment."**  
> **"Keep trusted sources in view."**  
> Standalone Manifest V3 browser extension for nursing students. AI-free by construction, local-first, and built on the HoneNurse design philosophy.

---

## 1. Product Overview

**HoneLENS** is an AI-free browser extension engineered for nursing students who need to evaluate research sources against assignment criteria, practice nursing math calculations, calculate clinical epidemiology statistics, synthesize evidence in structured matrices, and audit Word (`.docx`) manuscripts before submission.

### AI-Free by Construction
- **Zero Generative AI or LLMs**: No hosted or on-device language models, auto-written summaries, or AI grading.
- **Deterministic Mathematics**: Dosage calculations use explicit formulas, dimensional analysis, and verified clinical bounds.
- **Rule-Based Source Checks**: Bibliographic checks query public Crossref and PubMed APIs; no paper text or notes are uploaded.
- **Local-First Data Ownership**: All notes, PICOT formulations, matrices, and flashcards remain exclusively on your device.

---

## 2. Feature Inventory

### 2.1 Marketed Free Features
- **Source Check (Single Source)**:
  - Resolves bibliographic metadata by DOI, PMID, or in-page `<meta>` tags.
  - Compares source against student-entered rubric criteria (publication year window, source type, study design).
  - Queries Crossref Retraction Watch and update notices.
  - Maps provisional evidence hierarchy levels (Melnyk & Fineout-Overholt Levels I–VII; Johns Hopkins Nursing EBP).
  - Displays "What this check means" card with exact network disclosures.
- **Dosage Trainer**:
  - Repeatable practice bank across 6 nursing calculation types:
    1. Unit Conversion (mcg, mg, g, mL, L, oz, lb, kg).
    2. Tablet & Liquid Doses (Desired/Have × Quantity).
    3. IV Infusion Rates & Drip Times (mL/hr, gtt/min with drop factors).
    4. Weight-Based Calculations (mg/kg/dose, mcg/kg/min).
    5. Pediatric Safe-Range Calculations (mg/kg/day safe bounds).
    6. Reconstitution Calculations (powder vial, diluent volume, resulting concentration).
  - Full worked explanations: Formula Method, Dimensional Analysis, and Ratio & Proportion.
  - Error classification for self-identified learning gaps (decimal shifts, formula inversion, drop factor errors).
- **Stats Calculator**:
  - 2×2 contingency table calculator: EER, CER, Risk Ratio (RR), Odds Ratio (OR), Absolute Risk Reduction (ARR), Relative Risk Reduction (RRR), Number Needed to Treat (NNT), and Number Needed to Harm (NNH).
  - Contextual requirements: Enforces baseline control risk (never calculates context-free NNT from an OR alone).
  - 95% Confidence Interval interpreter for published RR, OR, and Hazard Ratios (HR), analyzing whether interval crosses 1.0.
- **Screen Capture & Text Clipper**:
  - Captures visible page screenshot with source URL and timestamp.
  - Clips text excerpts directly into the local research library as verified quotations.
- **Local Library & Literal Search**:
  - Organizes saved sources, clips, notes, and captures.
  - Fast literal text matching (zero vector embeddings or semantic search).
- **APA 7 Citation Maker**:
  - Generates references and in-text parenthetical/narrative citations from known metadata.
  - Flags missing required fields visibly; never guesses authors, dates, or DOIs.
- **Source-Linked Flashcards (Leitner Spaced Repetition)**:
  - Student-authored cards anchored to source citations.
  - Documented 5-box Leitner review schedule (Box 1 daily, Box 2 every 3 days, Box 3 weekly, Box 4 bi-weekly, Box 5 monthly).
  - 1-click Anki-compatible TSV export.
- **HonePack Portability**:
  - Versioned `.honepack.json` local backup and restore without vendor lock-in.
- **Personal Research Trail (Activity Log)**:
  - Optional local audit trail recording clipping, calculations, and appraisals. Can be exported or cleared anytime.
- **Privacy & Network Transparency Hub**:
  - Live local storage gauge, zero-AI transmission confirmation, and external endpoint disclosure.

### 2.2 HoneLENS Plus Features (Unlocked in Test Mode)
- **EBP Assignment Builder**:
  - Multi-course & multi-assignment workspace management.
  - Clinical PICOT framework builder.
  - PubMed Boolean query builder (combines terms, field tags `[tiab]`, and date filters).
  - Original appraisal reading sheets (Question, Design, Sample/Setting, Findings, Limitations, Relevance).
  - Multi-study Evidence Synthesis Matrix with editable columns.
  - **Word Submission Pack Exporter (.docx)**: Compiles complete assignment dossier into Microsoft Word format with tables and distinct quotation styling.
- **Dosage Exam Simulator**:
  - Timed mock exams (10, 20, 25, 50 questions).
  - Student-selectable passing score target (90%, 95%, 100% mastery).
  - Real-time timer, question flagging, and mistake analytics by problem type and error category.
  - Historical exam tracking and full worked solutions review.
- **Source Audit & DOCX Checker**:
  - Batch source list verification with duplicate DOI/PMID and candidate title detection.
  - In-browser local `.docx` manuscript parsing:
    - Extracts in-text citations and References list.
    - Flags unmatched in-text citations and uncited bibliography entries.
    - Audits APA 7 formatting and publication date windows.
    - Scans for Joint Commission / ISMP "Do Not Use" abbreviations (U, IU, QD, QOD, trailing zeros `X.0 mg`, lack of leading zeros `.X mg`, MS, MSO4, MgSO4).

---

## 3. How to Load and Test in Google Chrome

1. Open **Google Chrome** and navigate to `chrome://extensions/`.
2. Enable **Developer mode** via the toggle switch in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the directory: `C:\HoneLENS.GPT`.
5. Pin **HoneLENS** to your Chrome toolbar.
6. Click the extension icon to view the **Popup**, click **Side Panel** to open the docked reader companion, or click **Workspace** to launch the full-page research suite.

> **Testing HoneLENS Plus Features**:  
> In **Settings & Backup** (`workspace/workspace.html#settings`), the **HoneLENS Plus Testing Mode** checkbox is enabled by default. This immediately unlocks all premium features (EBP Assignment Builder, DOCX Manuscript Auditor, Dosage Exam Simulator) for review and testing.

---

## 4. Development & Automated Testing

Run the automated unit test suite locally:
```bash
npm test
```

Package the extension into a production zip archive:
```bash
npm run package
```
Output: `dist/HoneLENS-v1.0.0.zip`
