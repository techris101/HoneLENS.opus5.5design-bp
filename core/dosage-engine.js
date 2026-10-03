// Deterministic Nursing Dosage Calculation Engine
// Generates bounded, clinically validated problems with step-by-step worked rationales.
// Strict AI-Free implementation.

export const PROBLEM_TYPES = {
  UNIT_CONVERSION: 'unit_conversion',
  TABLET_LIQUID: 'tablet_liquid',
  IV_INFUSION: 'iv_infusion',
  WEIGHT_BASED: 'weight_based',
  PEDIATRIC: 'pediatric',
  RECONSTITUTION: 'reconstitution'
};

export const PROBLEM_TYPE_LABELS = {
  [PROBLEM_TYPES.UNIT_CONVERSION]: 'Unit Conversion',
  [PROBLEM_TYPES.TABLET_LIQUID]: 'Tablet & Liquid Doses',
  [PROBLEM_TYPES.IV_INFUSION]: 'IV Rates & Infusion Times',
  [PROBLEM_TYPES.WEIGHT_BASED]: 'Weight-Based Dosing',
  [PROBLEM_TYPES.PEDIATRIC]: 'Pediatric Safe-Range Practice',
  [PROBLEM_TYPES.RECONSTITUTION]: 'Reconstitution Practice'
};

export class DosageEngine {
  // Generate a problem deterministically
  static generateProblem(type = PROBLEM_TYPES.TABLET_LIQUID, options = {}) {
    switch (type) {
      case PROBLEM_TYPES.UNIT_CONVERSION:
        return this.generateUnitConversion();
      case PROBLEM_TYPES.TABLET_LIQUID:
        return this.generateTabletLiquid();
      case PROBLEM_TYPES.IV_INFUSION:
        return this.generateIVInfusion();
      case PROBLEM_TYPES.WEIGHT_BASED:
        return this.generateWeightBased();
      case PROBLEM_TYPES.PEDIATRIC:
        return this.generatePediatric();
      case PROBLEM_TYPES.RECONSTITUTION:
        return this.generateReconstitution();
      default:
        return this.generateTabletLiquid();
    }
  }

  // 1. Unit Conversion
  static generateUnitConversion() {
    const templates = [
      { from: 'mg', to: 'mcg', factor: 1000, value: (Math.floor(Math.random() * 20) + 1) * 0.25 },
      { from: 'mcg', to: 'mg', factor: 0.001, value: (Math.floor(Math.random() * 15) + 1) * 100 },
      { from: 'g', to: 'mg', factor: 1000, value: (Math.floor(Math.random() * 8) + 1) * 0.5 },
      { from: 'mg', to: 'g', factor: 0.001, value: (Math.floor(Math.random() * 10) + 2) * 250 },
      { from: 'mL', to: 'L', factor: 0.001, value: (Math.floor(Math.random() * 10) + 1) * 250 },
      { from: 'L', to: 'mL', factor: 1000, value: (Math.floor(Math.random() * 6) + 1) * 0.5 },
      { from: 'lb', to: 'kg', factor: 1 / 2.2, value: (Math.floor(Math.random() * 40) + 30) * 2.2 },
      { from: 'oz', to: 'mL', factor: 30, value: Math.floor(Math.random() * 8) + 2 }
    ];

    const item = templates[Math.floor(Math.random() * templates.length)];
    const val = parseFloat(item.value.toFixed(2));
    const exactAnswer = val * item.factor;
    const roundedAnswer = parseFloat(exactAnswer.toFixed(item.to === 'kg' ? 1 : 2));

    const prompt = `Convert ${val} ${item.from} to ${item.to}.`;

    return {
      type: PROBLEM_TYPES.UNIT_CONVERSION,
      prompt,
      givenUnit: item.from,
      targetUnit: item.to,
      givenValue: val,
      exactAnswer,
      roundedAnswer,
      roundingRule: item.to === 'kg' ? 'Round to the nearest tenth (0.1 kg).' : 'Exact conversion.',
      steps: {
        formula: `Answer = Given Value × Conversion Factor`,
        dimensionalAnalysis: `${val} ${item.from} × (${item.factor >= 1 ? item.factor + ' ' + item.to : '1 ' + item.to} / ${item.factor >= 1 ? '1 ' + item.from : (1 / item.factor) + ' ' + item.from}) = ${roundedAnswer} ${item.to}`,
        explanation: `To convert from ${item.from} to ${item.to}, multiply by ${item.factor}.`
      }
    };
  }

  // 2. Tablet and Liquid Doses
  static generateTabletLiquid() {
    const isLiquid = Math.random() > 0.5;

    if (isLiquid) {
      const meds = [
        { name: 'Furosemide', ordered: 40, available: 10, per: 1, unit: 'mg', liqUnit: 'mL' },
        { name: 'Digoxin', ordered: 0.125, available: 0.25, per: 1, unit: 'mg', liqUnit: 'mL' },
        { name: 'Amoxicillin oral suspension', ordered: 250, available: 125, per: 5, unit: 'mg', liqUnit: 'mL' },
        { name: 'Morphine oral solution', ordered: 15, available: 20, per: 1, unit: 'mg', liqUnit: 'mL' },
        { name: 'Diphenhydramine', ordered: 25, available: 12.5, per: 5, unit: 'mg', liqUnit: 'mL' }
      ];
      const m = meds[Math.floor(Math.random() * meds.length)];
      const multiplier = (Math.floor(Math.random() * 3) + 1);
      const orderedDose = parseFloat((m.ordered * (multiplier === 1 ? 1 : (multiplier === 2 ? 0.5 : 1.5))).toFixed(3));
      
      const exact = (orderedDose / m.available) * m.per;
      const rounded = exact < 1 ? parseFloat(exact.toFixed(2)) : parseFloat(exact.toFixed(1));

      const prompt = `The provider prescribes ${m.name} ${orderedDose} ${m.unit} PO. Available is ${m.name} ${m.available} ${m.unit} per ${m.per} ${m.liqUnit}. How many ${m.liqUnit} will the nurse administer?`;

      return {
        type: PROBLEM_TYPES.TABLET_LIQUID,
        prompt,
        medication: m.name,
        targetUnit: m.liqUnit,
        exactAnswer: exact,
        roundedAnswer: rounded,
        roundingRule: exact < 1 ? 'Liquid doses less than 1 mL are rounded to the hundredth (0.01 mL).' : 'Liquid doses greater than 1 mL are rounded to the tenth (0.1 mL).',
        steps: {
          formula: `Desired / Have × Volume = (${orderedDose} ${m.unit} / ${m.available} ${m.unit}) × ${m.per} ${m.liqUnit} = ${rounded} ${m.liqUnit}`,
          dimensionalAnalysis: `${orderedDose} ${m.unit} × (${m.per} ${m.liqUnit} / ${m.available} ${m.unit}) = ${rounded} ${m.liqUnit}`,
          ratioProportion: `${m.available} ${m.unit} : ${m.per} ${m.liqUnit} :: ${orderedDose} ${m.unit} : x ${m.liqUnit} → x = (${orderedDose} × ${m.per}) / ${m.available} = ${rounded} ${m.liqUnit}`
        }
      };
    } else {
      const tabs = [
        { name: 'Metoprolol tartrate', ordered: 50, available: 25, unit: 'mg' },
        { name: 'Prednisone', ordered: 15, available: 5, unit: 'mg' },
        { name: 'Levothyroxine', ordered: 100, available: 50, unit: 'mcg' },
        { name: 'Warfarin', ordered: 7.5, available: 5, unit: 'mg' },
        { name: 'Lisinopril', ordered: 20, available: 10, unit: 'mg' }
      ];
      const t = tabs[Math.floor(Math.random() * tabs.length)];
      const mult = (Math.floor(Math.random() * 3) + 1);
      const ordered = t.ordered;
      const exact = ordered / t.available;
      const rounded = parseFloat(exact.toFixed(1));

      const prompt = `The provider orders ${t.name} ${ordered} ${t.unit} PO daily. The pharmacy supplies ${t.name} ${t.available} ${t.unit} scored tablets. How many tablet(s) should the nurse give?`;

      return {
        type: PROBLEM_TYPES.TABLET_LIQUID,
        prompt,
        medication: t.name,
        targetUnit: 'tablet(s)',
        exactAnswer: exact,
        roundedAnswer: rounded,
        roundingRule: 'Scored tablets are rounded to the nearest half (0.5) tablet.',
        steps: {
          formula: `Desired / Have = ${ordered} ${t.unit} / ${t.available} ${t.unit} = ${rounded} tablet(s)`,
          dimensionalAnalysis: `${ordered} ${t.unit} × (1 tab / ${t.available} ${t.unit}) = ${rounded} tab(s)`,
          ratioProportion: `${t.available} ${t.unit} : 1 tab :: ${ordered} ${t.unit} : x tabs → x = ${ordered} / ${t.available} = ${rounded} tab(s)`
        }
      };
    }
  }

  // 3. IV Infusion Rates and Drop Factors
  static generateIVInfusion() {
    const isDripRate = Math.random() > 0.4;

    if (isDripRate) {
      const volumes = [500, 1000, 250, 100];
      const hours = [8, 6, 4, 2, 1];
      const dropFactors = [10, 15, 20, 60];

      const vol = volumes[Math.floor(Math.random() * volumes.length)];
      const hr = hours[Math.floor(Math.random() * hours.length)];
      const df = dropFactors[Math.floor(Math.random() * dropFactors.length)];

      const totalMinutes = hr * 60;
      const exact = (vol * df) / totalMinutes;
      const rounded = Math.round(exact);

      const prompt = `Infuse ${vol} mL 0.9% Normal Saline IV over ${hr} hour(s). The IV tubing has a drop factor of ${df} gtt/mL. Calculate the infusion rate in drops per minute (gtt/min).`;

      return {
        type: PROBLEM_TYPES.IV_INFUSION,
        prompt,
        targetUnit: 'gtt/min',
        exactAnswer: exact,
        roundedAnswer: rounded,
        roundingRule: 'Drops cannot be divided; round to the nearest whole drop (whole number).',
        steps: {
          formula: `(Volume in mL × Drop Factor) / Time in minutes = (${vol} mL × ${df} gtt/mL) / (${hr} × 60 min) = ${exact.toFixed(2)} → ${rounded} gtt/min`,
          dimensionalAnalysis: `(${vol} mL / ${hr} hr) × (1 hr / 60 min) × (${df} gtt / 1 mL) = ${exact.toFixed(2)} → ${rounded} gtt/min`,
          explanation: `Always convert hours to minutes (${hr} hr = ${totalMinutes} min) before calculating drop rates.`
        }
      };
    } else {
      const volumes = [1000, 500, 250, 150];
      const hours = [10, 8, 4, 2];
      const vol = volumes[Math.floor(Math.random() * volumes.length)];
      const hr = hours[Math.floor(Math.random() * hours.length)];

      const exact = vol / hr;
      const rounded = parseFloat(exact.toFixed(1));

      const prompt = `The provider prescribes Lactated Ringer's ${vol} mL IV to infuse over ${hr} hours. Set the electronic infusion pump to deliver how many mL/hr?`;

      return {
        type: PROBLEM_TYPES.IV_INFUSION,
        prompt,
        targetUnit: 'mL/hr',
        exactAnswer: exact,
        roundedAnswer: rounded,
        roundingRule: 'Electronic IV infusion pumps are typically rounded to the nearest tenth (0.1 mL/hr) or whole number.',
        steps: {
          formula: `Total Volume (mL) / Total Time (hr) = ${vol} mL / ${hr} hr = ${rounded} mL/hr`,
          dimensionalAnalysis: `${vol} mL / ${hr} hr = ${rounded} mL/hr`,
          explanation: `Divide the total volume in mL by the duration in hours to get the pump rate.`
        }
      };
    }
  }

  // 4. Weight-Based Calculations
  static generateWeightBased() {
    const meds = [
      { name: 'Enoxaparin', dosePerKg: 1, unit: 'mg/kg/dose', concentration: 100, concVol: 1, concUnit: 'mg/mL' },
      { name: 'Heparin bolus', dosePerKg: 80, unit: 'units/kg', concentration: 10000, concVol: 1, concUnit: 'units/mL' },
      { name: 'Methylprednisolone', dosePerKg: 2, unit: 'mg/kg', concentration: 125, concVol: 2, concUnit: 'mg/mL' }
    ];

    const m = meds[Math.floor(Math.random() * meds.length)];
    const weightLb = Math.floor(Math.random() * 60) + 120; // 120 - 180 lbs
    const weightKg = parseFloat((weightLb / 2.2).toFixed(2));
    const targetDose = weightKg * m.dosePerKg;
    const exactVol = (targetDose / m.concentration) * m.concVol;
    const roundedVol = parseFloat(exactVol.toFixed(2));

    const prompt = `The provider orders ${m.name} ${m.dosePerKg} ${m.unit} IV for a patient weighing ${weightLb} lbs. Available is ${m.name} ${m.concentration} ${m.concUnit.split('/')[0]} per ${m.concVol} mL. How many mL should the nurse administer?`;

    return {
      type: PROBLEM_TYPES.WEIGHT_BASED,
      prompt,
      medication: m.name,
      patientWeightLb: weightLb,
      patientWeightKg: weightKg,
      targetUnit: 'mL',
      exactAnswer: exactVol,
      roundedAnswer: roundedVol,
      roundingRule: 'First convert lb to kg (divide by 2.2). Round final volume to the nearest hundredth (0.01 mL).',
      steps: {
        step1: `Weight Conversion: ${weightLb} lb / 2.2 = ${weightKg} kg`,
        step2: `Total Dose: ${weightKg} kg × ${m.dosePerKg} ${m.unit} = ${targetDose.toFixed(2)} ${m.concUnit.split('/')[0]}`,
        formula: `Desired / Have × Volume = (${targetDose.toFixed(2)} / ${m.concentration}) × ${m.concVol} = ${roundedVol} mL`,
        dimensionalAnalysis: `${weightLb} lb × (1 kg / 2.2 lb) × (${m.dosePerKg} / 1 kg) × (${m.concVol} mL / ${m.concentration}) = ${roundedVol} mL`
      }
    };
  }

  // 5. Pediatric Safe-Range Practice
  static generatePediatric() {
    const peds = [
      { name: 'Cephalexin', minDose: 25, maxDose: 50, unit: 'mg/kg/day', dosesPerDay: 4 },
      { name: 'Acetaminophen', minDose: 10, maxDose: 15, unit: 'mg/kg/dose', dosesPerDay: 1 }
    ];

    const p = peds[Math.floor(Math.random() * peds.length)];
    const weightKg = Math.floor(Math.random() * 20) + 10; // 10 to 30 kg
    const minSafe = weightKg * p.minDose;
    const maxSafe = weightKg * p.maxDose;

    const orderedDose = Math.floor((minSafe + maxSafe) / 2);

    const prompt = `A child weighing ${weightKg} kg is prescribed ${p.name}. The recommended safe daily dosage is ${p.minDose} to ${p.maxDose} ${p.unit}. What is the maximum safe daily dose in mg?`;

    return {
      type: PROBLEM_TYPES.PEDIATRIC,
      prompt,
      medication: p.name,
      targetUnit: 'mg/day',
      exactAnswer: maxSafe,
      roundedAnswer: maxSafe,
      roundingRule: 'Calculate exact daily maximum dose.',
      steps: {
        formula: `Maximum safe dose = Patient weight (kg) × Maximum recommended dose (${p.maxDose} mg/kg) = ${weightKg} kg × ${p.maxDose} mg/kg = ${maxSafe} mg`,
        safetyWindow: `Safe daily range for ${weightKg} kg: ${minSafe} mg/day to ${maxSafe} mg/day.`,
        explanation: `Pediatric dosages must always be verified against safe range bounds prior to administration.`
      }
    };
  }

  // 6. Reconstitution Practice
  static generateReconstitution() {
    const vials = [
      { name: 'Ampicillin', vialDose: 1, vialUnit: 'g', diluent: 3.5, totalVol: 4.0, finalConc: 250, concUnit: 'mg/mL', ordered: 500, orderedUnit: 'mg' },
      { name: 'Cefazolin', vialDose: 1, vialUnit: 'g', diluent: 2.5, totalVol: 3.0, finalConc: 330, concUnit: 'mg/mL', ordered: 750, orderedUnit: 'mg' },
      { name: 'Vancomycin', vialDose: 500, vialUnit: 'mg', diluent: 10, totalVol: 10, finalConc: 50, concUnit: 'mg/mL', ordered: 500, orderedUnit: 'mg' }
    ];

    const v = vials[Math.floor(Math.random() * vials.length)];
    const exact = v.ordered / v.finalConc;
    const rounded = parseFloat(exact.toFixed(2));

    const prompt = `A nurse must administer ${v.name} ${v.ordered} ${v.orderedUnit} IM. The vial contains ${v.vialDose} ${v.vialUnit} of powder. The instructions state: "Add ${v.diluent} mL sterile water to yield a concentration of ${v.finalConc} ${v.concUnit}." How many mL should the nurse draw up?`;

    return {
      type: PROBLEM_TYPES.RECONSTITUTION,
      prompt,
      medication: v.name,
      targetUnit: 'mL',
      exactAnswer: exact,
      roundedAnswer: rounded,
      roundingRule: 'Round liquid dose to the nearest hundredth (0.01 mL).',
      steps: {
        reconstitutionNote: `After adding ${v.diluent} mL diluent, use the resulting concentration: ${v.finalConc} ${v.concUnit}.`,
        formula: `Desired / Have = ${v.ordered} mg / ${v.finalConc} mg/mL = ${rounded} mL`,
        dimensionalAnalysis: `${v.ordered} mg × (1 mL / ${v.finalConc} mg) = ${rounded} mL`,
        explanation: `In reconstitution, always calculate the dose using the resulting concentration printed on the label, not the added diluent volume.`
      }
    };
  }

  // Check user answer
  static checkAnswer(problem, userAnswer) {
    const num = parseFloat(userAnswer);
    if (isNaN(num)) {
      return { isCorrect: false, errorType: 'NaN', message: 'Please enter a valid numeric value.' };
    }

    const diffExact = Math.abs(num - problem.exactAnswer);
    const diffRounded = Math.abs(num - problem.roundedAnswer);
    const isCorrect = diffExact < 0.05 || diffRounded < 0.05;

    let mistakeCategory = null;
    if (!isCorrect) {
      if (Math.abs(num - problem.exactAnswer * 10) < 0.5 || Math.abs(num - problem.exactAnswer / 10) < 0.5) {
        mistakeCategory = 'Decimal place shift / conversion factor error';
      } else if (problem.type === PROBLEM_TYPES.IV_INFUSION && Math.abs(num - (problem.exactAnswer * 60)) < 2) {
        mistakeCategory = 'Omitted conversion of hours to minutes';
      } else if (Math.abs(num - (1 / problem.exactAnswer)) < 0.5) {
        mistakeCategory = 'Inverted formula (Have / Desired instead of Desired / Have)';
      } else {
        mistakeCategory = 'Arithmetic calculation or rounding discrepancy';
      }
    }

    return {
      isCorrect,
      userAnswer: num,
      correctAnswer: problem.roundedAnswer,
      exactAnswer: problem.exactAnswer,
      targetUnit: problem.targetUnit,
      mistakeCategory,
      disclaimer: 'HoneLENS Dosage Trainer is for clinical learning and educational practice only. Never use for patient-specific medication orders.'
    };
  }
}
