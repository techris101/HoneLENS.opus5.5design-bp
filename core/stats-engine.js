// Clinical Statistics & Epidemiology Calculator
// Calculates effect measures (RR, OR, ARR, RRR, NNT/NNH) and interprets 95% Confidence Intervals.
// Pure explicit formulas. Never AI.

export class StatsEngine {
  // 2x2 Contingency Table Calculation
  // a = experimental events, b = experimental non-events
  // c = control events,      d = control non-events
  static calculate2x2({ a, b, c, d, outcomeDirection = 'beneficial', outcomeName = 'Event', followUp = '' }) {
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    const numC = parseFloat(c);
    const numD = parseFloat(d);

    if (isNaN(numA) || isNaN(numB) || isNaN(numC) || isNaN(numD) ||
        numA < 0 || numB < 0 || numC < 0 || numD < 0) {
      throw new Error('Please enter valid, non-negative numbers for all 4 cells in the 2×2 contingency table.');
    }

    const n1 = numA + numB; // Total Experimental
    const n2 = numC + numD; // Total Control

    if (n1 === 0 || n2 === 0) {
      throw new Error('Experimental and Control group totals must be greater than zero.');
    }

    // Experimental Event Rate (EER) and Control Event Rate (CER)
    const eer = numA / n1;
    const cer = numC / n2;

    // Risk Ratio (RR)
    let rr = null;
    let rrLogSE = null;
    let rrCI = null;
    if (cer > 0 && eer > 0) {
      rr = eer / cer;
      rrLogSE = Math.sqrt((1 / numA) - (1 / n1) + (1 / numC) - (1 / n2));
      const logRR = Math.log(rr);
      rrCI = {
        lower: parseFloat(Math.exp(logRR - 1.96 * rrLogSE).toFixed(3)),
        upper: parseFloat(Math.exp(logRR + 1.96 * rrLogSE).toFixed(3))
      };
    }

    // Odds Ratio (OR)
    let or = null;
    let orCI = null;
    if (numB > 0 && numC > 0 && numA > 0 && numD > 0) {
      or = (numA * numD) / (numB * numC);
      const orLogSE = Math.sqrt((1 / numA) + (1 / numB) + (1 / numC) + (1 / numD));
      const logOR = Math.log(or);
      orCI = {
        lower: parseFloat(Math.exp(logOR - 1.96 * orLogSE).toFixed(3)),
        upper: parseFloat(Math.exp(logOR + 1.96 * orLogSE).toFixed(3))
      };
    }

    // Absolute Effects
    const riskDiff = eer - cer; // Negative means intervention reduced events
    const arr = Math.abs(cer - eer); // Absolute Risk Reduction / Difference
    const rrr = cer > 0 ? (cer - eer) / cer : null;

    // NNT or NNH based on outcome direction and event rate comparison
    let nnt = null;
    let nnh = null;
    let effectLabel = '';

    if (outcomeDirection === 'adverse') {
      // Adverse outcome (e.g. death, fall, pressure injury)
      if (eer < cer) {
        // Intervention reduced adverse events -> Treatment Benefit -> NNT
        nnt = arr > 0 ? Math.ceil(1 / arr) : null;
        effectLabel = 'Intervention reduces harm (Treatment Benefit)';
      } else if (eer > cer) {
        // Intervention increased adverse events -> Treatment Harm -> NNH
        nnh = arr > 0 ? Math.ceil(1 / arr) : null;
        effectLabel = 'Intervention increases harm (Adverse Event)';
      } else {
        effectLabel = 'Identical rates in both groups';
      }
    } else {
      // Beneficial outcome (e.g. recovery, smoking cessation, wound healing)
      if (eer > cer) {
        nnt = arr > 0 ? Math.ceil(1 / arr) : null;
        effectLabel = 'Intervention increases recovery (Treatment Benefit)';
      } else if (eer < cer) {
        nnh = arr > 0 ? Math.ceil(1 / arr) : null;
        effectLabel = 'Intervention reduces recovery';
      } else {
        effectLabel = 'Identical rates in both groups';
      }
    }

    return {
      inputs: { a: numA, b: numB, c: numC, d: numD, n1, n2, outcomeName, followUp },
      eer: parseFloat(eer.toFixed(4)),
      cer: parseFloat(cer.toFixed(4)),
      eerPct: (eer * 100).toFixed(1) + '%',
      cerPct: (cer * 100).toFixed(1) + '%',
      rr: rr !== null ? parseFloat(rr.toFixed(3)) : null,
      rrCI,
      or: or !== null ? parseFloat(or.toFixed(3)) : null,
      orCI,
      arr: parseFloat(arr.toFixed(4)),
      arrPct: (arr * 100).toFixed(1) + '%',
      rrr: rrr !== null ? parseFloat(rrr.toFixed(4)) : null,
      rrrPct: rrr !== null ? (rrr * 100).toFixed(1) + '%' : null,
      nnt,
      nnh,
      effectLabel,
      formulas: {
        eer: `EER = a / (a + b) = ${numA} / ${n1} = ${eer.toFixed(4)}`,
        cer: `CER = c / (c + d) = ${numC} / ${n2} = ${cer.toFixed(4)}`,
        rr: `RR = EER / CER = ${eer.toFixed(4)} / ${cer.toFixed(4)} = ${rr ? rr.toFixed(3) : 'N/A'}`,
        arr: `ARR = |CER - EER| = |${cer.toFixed(4)} - ${eer.toFixed(4)}| = ${arr.toFixed(4)} (${(arr * 100).toFixed(1)}%)`,
        nnt: nnt ? `NNT = 1 / ARR = 1 / ${arr.toFixed(4)} = ${(1 / arr).toFixed(1)} → Rounded up to ${nnt} patients` : null,
        nnh: nnh ? `NNH = 1 / ARI = 1 / ${arr.toFixed(4)} = ${(1 / arr).toFixed(1)} → Rounded up to ${nnh} patients` : null
      },
      interpretation: this.generateInterpretation({ eer, cer, rr, arr, nnt, nnh, outcomeName, followUp })
    };
  }

  // Interpret reported Relative Estimates (OR, RR, HR) with 95% Confidence Intervals
  static interpretReportedCI({ type = 'RR', estimate, ciLower, ciUpper, outcomeName = 'the primary outcome' }) {
    const est = parseFloat(estimate);
    const low = parseFloat(ciLower);
    const up = parseFloat(ciUpper);

    if (isNaN(est) || isNaN(low) || isNaN(up)) {
      throw new Error('Please provide valid numbers for the estimate and confidence interval limits.');
    }

    if (low > up) {
      throw new Error('The lower confidence limit cannot be greater than the upper limit.');
    }

    const crossesNull = low <= 1.0 && up >= 1.0;
    const isStatisticallySignificant = !crossesNull;

    let relativeMeaning = '';
    if (est > 1.0) {
      const pctIncrease = ((est - 1.0) * 100).toFixed(1);
      relativeMeaning = `The point estimate suggests a ${pctIncrease}% higher likelihood of ${outcomeName} in the exposed/intervention group compared to the control group.`;
    } else if (est < 1.0) {
      const pctDecrease = ((1.0 - est) * 100).toFixed(1);
      relativeMeaning = `The point estimate suggests a ${pctDecrease}% lower likelihood of ${outcomeName} in the intervention group compared to the control group.`;
    } else {
      relativeMeaning = `The point estimate is exactly 1.0, indicating identical risk between comparison groups.`;
    }

    const explanation = crossesNull
      ? `The 95% confidence interval [${low}, ${up}] crosses the null value of 1.0. At the conventional alpha = 0.05 threshold, this finding is not statistically significant. Critical EBP Note: An interval crossing 1.0 does NOT prove "no effect" or clinical equivalence. It merely indicates the study was not sufficiently powered to rule out both benefit and harm. Never assume absence of evidence is evidence of absence.`
      : `The 95% confidence interval [${low}, ${up}] does not cross 1.0. The finding is statistically significant at the alpha = 0.05 level. Clinical Judgment Note: Statistical significance does not equal clinical importance. A very large sample can render trivial differences statistically significant. Always examine the absolute effect size (ARR/NNT) in relation to patient values and costs.`;

    return {
      type,
      estimate: est,
      ci: [low, up],
      crossesNull,
      isStatisticallySignificant,
      relativeMeaning,
      explanation
    };
  }

  // Generate plain-language clinical synthesis
  static generateInterpretation({ eer, cer, rr, arr, nnt, nnh, outcomeName, followUp }) {
    const timeStr = followUp ? ` over ${followUp}` : '';
    if (nnt) {
      return `For every ${nnt} patients treated${timeStr}, one additional patient avoids ${outcomeName} compared with control (ARR = ${(arr * 100).toFixed(1)}%). Baseline control risk was ${(cer * 100).toFixed(1)}%.`;
    }
    if (nnh) {
      return `For every ${nnh} patients treated${timeStr}, one additional patient experiences harm/adverse event ${outcomeName} (ARI = ${(arr * 100).toFixed(1)}%).`;
    }
    return `Both groups experienced equal event rates (${(eer * 100).toFixed(1)}%). No absolute risk difference observed.`;
  }
}
