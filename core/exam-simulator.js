// Dosage Exam Simulator
// Timed test preparation workflow with passing score targets, mistake analytics, and full worked reviews.

import { DosageEngine, PROBLEM_TYPES } from './dosage-engine.js';
import { storage } from './storage.js';

export class ExamSimulator {
  // Start a new timed mock exam
  static createExam(options = {}) {
    const questionCount = options.questionCount || 10;
    const passTargetPct = options.passTargetPct || 90; // Student-selected target
    const timeLimitMinutes = options.timeLimitMinutes || questionCount * 2; // e.g. 2 min/question

    // Distribute problems evenly across problem types
    const types = Object.values(PROBLEM_TYPES);
    const questions = [];

    for (let i = 0; i < questionCount; i++) {
      const type = types[i % types.length];
      const prob = DosageEngine.generateProblem(type, options);
      questions.push({
        id: 'q_' + (i + 1),
        number: i + 1,
        type: prob.type,
        prompt: prob.prompt,
        targetUnit: prob.targetUnit,
        roundingRule: prob.roundingRule,
        exactAnswer: prob.exactAnswer,
        roundedAnswer: prob.roundedAnswer,
        steps: prob.steps,
        userAnswer: null,
        isFlagged: false,
        result: null
      });
    }

    return {
      id: 'exam_' + Date.now(),
      createdAt: new Date().toISOString(),
      questionCount,
      passTargetPct,
      timeLimitMinutes,
      timeRemainingSeconds: timeLimitMinutes * 60,
      isCompleted: false,
      currentQuestionIndex: 0,
      questions
    };
  }

  // Grade an exam and compile mistake analytics
  static async gradeExam(exam) {
    let correctCount = 0;
    const mistakesByType = {};
    const mistakesByCategory = {};

    exam.questions.forEach(q => {
      if (q.userAnswer === null || q.userAnswer === undefined || q.userAnswer === '') {
        q.result = {
          isCorrect: false,
          userAnswer: null,
          correctAnswer: q.roundedAnswer,
          mistakeCategory: 'Unanswered'
        };
      } else {
        q.result = DosageEngine.checkAnswer(q, q.userAnswer);
      }

      if (q.result.isCorrect) {
        correctCount++;
      } else {
        // Track mistake by problem type
        mistakesByType[q.type] = (mistakesByType[q.type] || 0) + 1;
        // Track mistake by category
        const cat = q.result.mistakeCategory || 'Other calculation error';
        mistakesByCategory[cat] = (mistakesByCategory[cat] || 0) + 1;
      }
    });

    const scorePct = parseFloat(((correctCount / exam.questionCount) * 100).toFixed(1));
    const passed = scorePct >= exam.passTargetPct;

    const completedExam = {
      ...exam,
      isCompleted: true,
      completedAt: new Date().toISOString(),
      score: {
        correct: correctCount,
        total: exam.questionCount,
        pct: scorePct,
        passTargetPct: exam.passTargetPct,
        passed
      },
      analytics: {
        mistakesByType,
        mistakesByCategory,
        primaryWeakArea: Object.entries(mistakesByType).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None'
      }
    };

    // Save exam in local history
    await storage.addItem('examHistory', completedExam);

    return completedExam;
  }

  // Get historical exams
  static async getExamHistory() {
    return await storage.getCollection('examHistory');
  }

  // Clear exam history
  static async clearExamHistory() {
    await storage.saveCollection('examHistory', []);
  }
}
