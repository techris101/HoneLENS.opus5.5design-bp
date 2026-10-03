// Criteria Evaluation Engine & Evidence Framework Mapper
// Pure deterministic rules. Never AI.

export const EVIDENCE_FRAMEWORKS = {
  MELNYK: 'Melnyk & Fineout-Overholt (Levels I–VII)',
  JHNEBP: 'Johns Hopkins Nursing EBP (Levels I–V)',
  NONE: 'None (Design metadata only)'
};

export const CLINICAL_QUESTION_TYPES = {
  INTERVENTION: 'Intervention / Therapy',
  PROGNOSIS: 'Prognosis / Prediction',
  DIAGNOSIS: 'Diagnosis / Diagnostic Test',
  ETIOLOGY: 'Etiology / Harm',
  MEANING: 'Meaning / Patient Experience'
};

export class CriteriaEngine {
  // Evaluate a source against user rubric criteria
  static evaluateSource(source, criteria = {}) {
    const results = [];
    const currentYear = new Date().getFullYear();

    // 1. Publication Date Window
    if (criteria.dateWindow !== undefined && criteria.dateWindow !== null) {
      const maxAgeYears = typeof criteria.dateWindow === 'number' ? criteria.dateWindow : 5;
      const minAllowedYear = currentYear - maxAgeYears;
      const pubYear = source.year;

      if (!pubYear) {
        results.push({
          criterion: 'Publication Date Window',
          status: 'unknown',
          rule: `Published within past ${maxAgeYears} years (≥ ${minAllowedYear})`,
          actual: 'Publication year not found in metadata',
          meaning: 'Publication date could not be verified automatically. Check the article header manually.'
        });
      } else if (pubYear >= minAllowedYear && pubYear <= currentYear + 1) {
        results.push({
          criterion: 'Publication Date Window',
          status: 'matches',
          rule: `Published within past ${maxAgeYears} years (≥ ${minAllowedYear})`,
          actual: `Published in ${pubYear} (${currentYear - pubYear} years ago)`,
          meaning: `Publication date satisfies the ${maxAgeYears}-year assignment window. Note: this verifies date only, not clinical validity.`
        });
      } else {
        results.push({
          criterion: 'Publication Date Window',
          status: 'does_not_match',
          rule: `Published within past ${maxAgeYears} years (≥ ${minAllowedYear})`,
          actual: `Published in ${pubYear} (${currentYear - pubYear} years ago - older than ${maxAgeYears} years)`,
          meaning: `The publication date falls outside your chosen ${maxAgeYears}-year window. Check your syllabus for landmark study exceptions.`
        });
      }
    }

    // 2. Source Type / Peer Review signal
    if (criteria.requiredType) {
      const type = (source.type || '').toLowerCase();
      const req = criteria.requiredType.toLowerCase();

      if (!type) {
        results.push({
          criterion: 'Source Type',
          status: 'unknown',
          rule: `Requires ${criteria.requiredType}`,
          actual: 'Source type field missing',
          meaning: 'Source type is not declared in available metadata. Verify journal indexing on Ulrichsweb or PubMed.'
        });
      } else if (type.includes(req) || (req.includes('journal') && type.includes('journal-article'))) {
        results.push({
          criterion: 'Source Type',
          status: 'matches',
          rule: `Requires ${criteria.requiredType}`,
          actual: `Matched metadata type: ${source.type}`,
          meaning: 'Source metadata indicates an academic journal article. Remember: metadata match does not certify peer review rigor.'
        });
      } else {
        results.push({
          criterion: 'Source Type',
          status: 'does_not_match',
          rule: `Requires ${criteria.requiredType}`,
          actual: `Metadata declares: ${source.type}`,
          meaning: 'Source type does not match your criteria.'
        });
      }
    }

    // 3. Study Design Requirement
    if (criteria.requiredDesign) {
      const titleAndAbstract = `${source.title || ''} ${source.type || ''}`.toLowerCase();
      const req = criteria.requiredDesign.toLowerCase();

      const designPatterns = {
        'systematic review': /\b(systematic review|meta-analysis|meta analysis)\b/i,
        'rct': /\b(randomized controlled trial|randomised controlled trial|rct|randomized clinical trial)\b/i,
        'cohort': /\b(cohort study|prospective cohort|retrospective cohort|longitudinal study)\b/i,
        'qualitative': /\b(qualitative|phenomenolog|grounded theory|ethnograph)\b/i,
        'quasi-experimental': /\b(quasi-experimental|non-randomized|controlled trial)\b/i
      };

      const pattern = designPatterns[req] || new RegExp(`\\b${req}\\b`, 'i');

      if (pattern.test(titleAndAbstract)) {
        results.push({
          criterion: 'Study Design',
          status: 'matches',
          rule: `Requires ${criteria.requiredDesign}`,
          actual: `Title/metadata contains explicit '${criteria.requiredDesign}' keywords`,
          meaning: 'Design signals in title and metadata match requested design. Verify full methodology in manuscript.'
        });
      } else {
        results.push({
          criterion: 'Study Design',
          status: 'unknown',
          rule: `Requires ${criteria.requiredDesign}`,
          actual: 'Specific design signals not detected in bibliographic title/type',
          meaning: 'Title does not state the design explicitly. Read the "Methods" section to confirm the study architecture.'
        });
      }
    }

    // 4. Retraction / Update Status Check
    if (source.retractionStatus) {
      if (source.retractionStatus === 'RETRACTED') {
        results.push({
          criterion: 'Retraction Watch & Update Record',
          status: 'does_not_match',
          rule: 'Source must not have active retraction notices',
          actual: 'RETRACTION RECORD MATCHED in bibliographic database',
          meaning: 'PATIENT SAFETY ALERT: This study has a retraction notice. Do not use retracted evidence for clinical practice.',
          isDanger: true
        });
      } else if (source.retractionStatus === 'UPDATES_FOUND') {
        results.push({
          criterion: 'Retraction Watch & Update Record',
          status: 'unknown',
          rule: 'Check for errata or corrections',
          actual: 'Subsequent correction or expression of concern notice found',
          meaning: 'This article has an update or erratum notice linked on Crossref. Read the erratum to verify if findings were amended.'
        });
      } else {
        results.push({
          criterion: 'Retraction Watch & Update Record',
          status: 'matches',
          rule: 'No matched retraction in Crossref / PubMed record',
          actual: 'No matching record found in this lookup',
          meaning: 'No matching retraction record was found in this specific query. This does not guarantee that no later offline notice exists.'
        });
      }
    }

    // 5. Provisional Evidence Framework Mapping
    let frameworkResult = null;
    if (criteria.framework && criteria.framework !== EVIDENCE_FRAMEWORKS.NONE) {
      frameworkResult = CriteriaEngine.provisionalLevel(source, criteria.framework, criteria.questionType);
    }

    return {
      evaluatedAt: new Date().toISOString(),
      overallMatches: results.every(r => r.status === 'matches'),
      hasFailures: results.some(r => r.status === 'does_not_match'),
      results,
      frameworkResult
    };
  }

  // Provisional evidence hierarchy mapper
  static provisionalLevel(source, framework, questionType) {
    const text = `${source.title || ''} ${source.type || ''}`.toLowerCase();

    let level = 'Unknown Level';
    let description = 'Could not determine design from title alone. Check methods.';

    if (/\b(systematic review|meta-analysis|meta analysis)\b/i.test(text)) {
      if (/\brandomized|rct\b/i.test(text)) {
        level = framework.includes('Melnyk') ? 'Level I' : 'Level I';
        description = 'Systematic review or meta-analysis of randomized controlled trials (RCTs).';
      } else {
        level = framework.includes('Melnyk') ? 'Level V' : 'Level II';
        description = 'Systematic review of descriptive/qualitative studies.';
      }
    } else if (/\b(randomized controlled trial|randomised controlled trial|rct)\b/i.test(text)) {
      level = framework.includes('Melnyk') ? 'Level II' : 'Level I';
      description = 'Well-designed randomized controlled trial (RCT).';
    } else if (/\b(controlled trial|quasi-experimental|non-randomized)\b/i.test(text)) {
      level = framework.includes('Melnyk') ? 'Level III' : 'Level II';
      description = 'Controlled trial without randomization (quasi-experimental).';
    } else if (/\b(cohort|case-control|longitudinal)\b/i.test(text)) {
      level = framework.includes('Melnyk') ? 'Level IV' : 'Level III';
      description = 'Non-experimental study (cohort or case-control).';
    } else if (/\b(qualitative|phenomenolog|grounded theory|ethnograph)\b/i.test(text)) {
      level = framework.includes('Melnyk') ? 'Level VI' : 'Level III';
      description = 'Single descriptive or qualitative study.';
    } else if (/\b(guideline|expert consensus|recommendation)\b/i.test(text)) {
      level = framework.includes('Melnyk') ? 'Level VII' : 'Level IV';
      description = 'Clinical practice guideline or expert committee consensus.';
    }

    return {
      framework,
      questionType: questionType || 'Unspecified',
      level,
      description,
      label: 'possible framework match—verify',
      meaning: 'Provisional design-based category based solely on title keywords. Course rules and clinical context require student verification of the study methodology.'
    };
  }
}
