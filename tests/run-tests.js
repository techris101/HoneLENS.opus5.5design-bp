// Automated Unit Test Suite for HoneLENS Chrome Extension
// Runs under Node.js in CI (GitHub Actions) and locally.

import { DosageEngine, PROBLEM_TYPES } from '../core/dosage-engine.js';
import { StatsEngine } from '../core/stats-engine.js';
import { CriteriaEngine, EVIDENCE_FRAMEWORKS } from '../core/criteria-engine.js';
import { CitationMaker } from '../core/citation-maker.js';
import { FlashcardsEngine, LEITNER_INTERVALS_DAYS } from '../core/flashcards-engine.js';
import { DocxParser, ISMP_DO_NOT_USE } from '../core/docx-parser.js';
import { DocxGenerator } from '../core/docx-generator.js';
import { MiniZip } from '../core/minizip.js';
import { storage } from '../core/storage.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failedTests++;
  }
}

function assertClose(actual, expected, tolerance = 0.01, testName) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, `${testName} (expected ~${expected}, got ${actual})`);
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('Running HoneLENS Verification Test Suite');
  console.log('====================================================\n');

  // 1. DOSAGE ENGINE TESTS
  console.log('[1/7] Testing Dosage Calculation Engine...');
  for (let i = 0; i < 20; i++) {
    const uc = DosageEngine.generateProblem(PROBLEM_TYPES.UNIT_CONVERSION);
    assert(uc.exactAnswer > 0, `Unit conversion generates valid answer: ${uc.prompt}`);

    const tl = DosageEngine.generateProblem(PROBLEM_TYPES.TABLET_LIQUID);
    assert(tl.exactAnswer > 0, `Tablet/liquid generates valid answer: ${tl.prompt}`);
    
    // Test checkAnswer
    const resCorrect = DosageEngine.checkAnswer(tl, tl.roundedAnswer);
    assert(resCorrect.isCorrect === true, `checkAnswer validates correct answer: ${tl.roundedAnswer}`);

    const resWrong = DosageEngine.checkAnswer(tl, tl.roundedAnswer * 10);
    assert(resWrong.isCorrect === false, `checkAnswer flags wrong answer`);
  }

  const iv = DosageEngine.generateProblem(PROBLEM_TYPES.IV_INFUSION);
  assert(iv.exactAnswer > 0, `IV infusion rate calculation valid: ${iv.prompt}`);

  const wb = DosageEngine.generateProblem(PROBLEM_TYPES.WEIGHT_BASED);
  assert(wb.exactAnswer > 0, `Weight-based calculation valid: ${wb.prompt}`);

  const ped = DosageEngine.generateProblem(PROBLEM_TYPES.PEDIATRIC);
  assert(ped.exactAnswer > 0, `Pediatric calculation valid: ${ped.prompt}`);

  const rec = DosageEngine.generateProblem(PROBLEM_TYPES.RECONSTITUTION);
  assert(rec.exactAnswer > 0, `Reconstitution calculation valid: ${rec.prompt}`);

  // 2. STATS ENGINE TESTS
  console.log('\n[2/7] Testing Clinical Epidemiology Stats Engine...');
  // Standard trial: Exp (15 events, 85 non-events), Ctrl (30 events, 70 non-events)
  // EER = 15/100 = 0.15; CER = 30/100 = 0.30; RR = 0.15 / 0.30 = 0.5; ARR = 0.15; NNT = 1 / 0.15 = 6.67 -> 7
  const statsRes = StatsEngine.calculate2x2({ a: 15, b: 85, c: 30, d: 70, outcomeDirection: 'adverse' });
  assertClose(statsRes.eer, 0.15, 0.001, 'EER calculation correct (0.15)');
  assertClose(statsRes.cer, 0.30, 0.001, 'CER calculation correct (0.30)');
  assertClose(statsRes.rr, 0.50, 0.01, 'Risk Ratio calculation correct (0.50)');
  assertClose(statsRes.arr, 0.15, 0.001, 'Absolute Risk Reduction correct (0.15)');
  assert(statsRes.nnt === 7, `NNT correctly rounded up to whole patient: expected 7, got ${statsRes.nnt}`);

  // 95% CI Interpreter
  const ciCrossing = StatsEngine.interpretReportedCI({ type: 'RR', estimate: 0.85, ciLower: 0.65, ciUpper: 1.15 });
  assert(ciCrossing.crossesNull === true, 'CI crossing 1.0 identified as statistically non-significant');
  assert(ciCrossing.isStatisticallySignificant === false, 'Statistical significance flag false when interval crosses 1.0');

  const ciSignificant = StatsEngine.interpretReportedCI({ type: 'HR', estimate: 0.62, ciLower: 0.45, ciUpper: 0.85 });
  assert(ciSignificant.crossesNull === false, 'CI not crossing 1.0 identified as statistically significant');
  assert(ciSignificant.isStatisticallySignificant === true, 'Statistical significance flag true');

  // 3. CRITERIA ENGINE TESTS
  console.log('\n[3/7] Testing Assignment Criteria Engine...');
  const currentYear = new Date().getFullYear();
  const recentSource = {
    title: 'Randomized controlled trial of nurse-led heart failure education',
    authors: ['Smith, J.', 'Taylor, R.'],
    year: currentYear - 2,
    type: 'journal-article',
    retractionStatus: 'NO_MATCHING_RECORD'
  };

  const evalRecent = CriteriaEngine.evaluateSource(recentSource, {
    dateWindow: 5,
    requiredType: 'journal-article',
    requiredDesign: 'RCT',
    framework: EVIDENCE_FRAMEWORKS.MELNYK
  });

  assert(evalRecent.overallMatches === true, 'Recent RCT source passes all criteria');
  assert(evalRecent.frameworkResult?.level === 'Level II', `Provisional Melnyk level correct: expected Level II, got ${evalRecent.frameworkResult?.level}`);

  const oldSource = {
    title: 'Historical study on wound care',
    year: currentYear - 12,
    type: 'journal-article'
  };
  const evalOld = CriteriaEngine.evaluateSource(oldSource, { dateWindow: 5 });
  assert(evalOld.hasFailures === true, 'Old source outside 5-year window correctly flagged as mismatch');

  const retractedSource = {
    title: 'Disproven trial on hydroxychloroquine',
    year: currentYear - 1,
    retractionStatus: 'RETRACTED'
  };
  const evalRetracted = CriteriaEngine.evaluateSource(retractedSource, { dateWindow: 5 });
  assert(evalRetracted.hasFailures === true, 'Retracted source flagged with patient safety alert');

  // 4. CITATION MAKER TESTS
  console.log('\n[4/7] Testing APA 7 Citation Maker...');
  const srcSingleAuthor = {
    authors: ['Orem, Dorothea'],
    year: 2021,
    title: 'Nursing concepts of practice',
    journal: 'Journal of Nursing Care Quality',
    volume: '36',
    issue: '2',
    page: '105-112',
    doi: '10.1097/JNC.0000000000000215'
  };
  const citeSingle = CitationMaker.formatApa7(srcSingleAuthor);
  assert(citeSingle.plainText.includes('Orem, D.'), `Author format: ${citeSingle.plainText}`);
  assert(citeSingle.plainText.includes('(2021).'), 'Year format correct');
  assert(citeSingle.plainText.includes('https://doi.org/10.1097/JNC.0000000000000215'), 'DOI format correct');
  assert(citeSingle.inTextParenthetical === '(Orem, 2021)', 'In-text parenthetical citation correct');
  assert(citeSingle.inTextNarrative === 'Orem (2021)', 'In-text narrative citation correct');

  const srcMissing = { title: 'Unknown trial with missing fields' };
  const citeMissing = CitationMaker.formatApa7(srcMissing);
  assert(citeMissing.isComplete === false, 'Detects missing required fields');
  assert(citeMissing.missingFields.length > 0, `Missing fields flagged: ${citeMissing.missingFields.join(', ')}`);

  // 5. FLASHCARDS & LEITNER TESTS
  console.log('\n[5/7] Testing Leitner Flashcard Schedule...');
  assert(LEITNER_INTERVALS_DAYS[1] === 1, 'Box 1 interval is 1 day');
  assert(LEITNER_INTERVALS_DAYS[2] === 3, 'Box 2 interval is 3 days');
  assert(LEITNER_INTERVALS_DAYS[3] === 7, 'Box 3 interval is 7 days');
  assert(LEITNER_INTERVALS_DAYS[4] === 14, 'Box 4 interval is 14 days');
  assert(LEITNER_INTERVALS_DAYS[5] === 30, 'Box 5 interval is 30 days');

  const card = await FlashcardsEngine.createCard({
    front: 'Normal therapeutic digoxin range?',
    back: '0.8 to 2.0 ng/mL'
  });
  assert(card.box === 1, 'New card starts in Box 1');

  const promoted = await FlashcardsEngine.recordReview(card.id, true);
  assert(promoted.box === 2, 'Correct answer promotes card to Box 2');

  const demoted = await FlashcardsEngine.recordReview(card.id, false);
  assert(demoted.box === 1, 'Incorrect answer resets card to Box 1');

  // 6. ISMP "DO NOT USE" ABBREVIATIONS TEST
  console.log('\n[6/7] Testing Joint Commission & ISMP Abbreviation Scanner...');
  const testParagraph = 'Administered 5.0 mg of MS IV daily and .5 mg of digoxin. Patient received 10 U regular insulin Q.D. with cc flush.';
  const abbrevIssues = DocxParser.scanAbbreviations(testParagraph);
  assert(abbrevIssues.length >= 4, `Detected prohibited abbreviations (found ${abbrevIssues.length})`);
  assert(abbrevIssues.some(a => a.code.includes('Trailing Zero')), 'Detected trailing zero (5.0 mg)');
  assert(abbrevIssues.some(a => a.code.includes('Lack of Leading Zero')), 'Detected lack of leading zero (.5 mg)');
  assert(abbrevIssues.some(a => a.code === 'U'), 'Detected "U" for unit');
  assert(abbrevIssues.some(a => a.code === 'Q.D.'), 'Detected "Q.D." for daily');
  assert(abbrevIssues.some(a => a.code.includes('MS')), 'Detected "MS" for morphine sulfate');

  // 7. DOCX & ZIP GENERATION TEST
  console.log('\n[7/7] Testing OpenXML DOCX Submission Pack Generator...');
  const testAssignment = {
    title: 'Prevention of Catheter-Associated UTI',
    courseName: 'NURS 450 Advanced EBP',
    picot: {
      population: 'Adult ICU patients',
      intervention: 'Silver-alloy coated catheters',
      comparison: 'Standard silicone catheters',
      outcome: 'Infection rates',
      timeframe: '14 days'
    },
    pubmedQuery: '("urinary catheter"[tiab]) AND ("silver"[tiab]) AND nursing[sb]',
    matrixRows: [
      {
        authorYear: 'Roberts et al. (2021)',
        title: 'Silver alloy catheter trial',
        design: 'RCT',
        level: 'Level II',
        sampleSetting: '450 ICU patients',
        findings: '28% lower incidence of bacteriuria (p = 0.03)',
        studentAppraisal: 'Rigorous protocol, verified microbiology',
        relevance: 'Directly informs bundle implementation'
      }
    ],
    sources: []
  };

  const docxUint8 = await DocxGenerator.createSubmissionPack(testAssignment);
  assert(docxUint8 instanceof Uint8Array && docxUint8.length > 500, `Generated valid .docx archive (${docxUint8.length} bytes)`);

  const unzipped = await MiniZip.readZip(docxUint8.buffer);
  assert(unzipped['word/document.xml'] !== undefined, 'Generated .docx contains word/document.xml');
  assert(unzipped['[Content_Types].xml'] !== undefined, 'Generated .docx contains [Content_Types].xml');

  const xmlContent = new TextDecoder('utf-8').decode(unzipped['word/document.xml']);
  assert(xmlContent.includes('Prevention of Catheter-Associated UTI'), 'Document XML contains assignment title');
  assert(xmlContent.includes('Silver-alloy coated catheters'), 'Document XML contains PICOT intervention');
  assert(xmlContent.includes('Roberts et al. (2021)'), 'Document XML contains matrix author entry');

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
