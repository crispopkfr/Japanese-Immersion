import { AnkiCard } from "./ankiUtils";

export interface EasyDaysConfig {
  Mon: "normal" | "reduced" | "minimum";
  Tue: "normal" | "reduced" | "minimum";
  Wed: "normal" | "reduced" | "minimum";
  Thu: "normal" | "reduced" | "minimum";
  Fri: "normal" | "reduced" | "minimum";
  Sat: "normal" | "reduced" | "minimum";
  Sun: "normal" | "reduced" | "minimum";
}

export interface SrsSettings {
  // Daily Limits
  newCardsPerDay: number;
  maxReviewsPerDay: number;
  newCardsIgnoreReviewLimit: boolean;
  limitsStartFromTop: boolean;

  // New Cards
  learningSteps: string; // e.g. "1m 10m"
  graduatingInterval: number; // e.g. 1
  easyInterval: number; // e.g. 4
  insertionOrder: "oldest" | "random";

  // Lapses
  relearningSteps: string; // e.g. "10m"
  minimumInterval: number; // e.g. 1
  leechThreshold: number; // e.g. 8
  leechAction: "tag" | "suspend";

  // Display Order
  newCardGatherOrder: "deck" | "ascending" | "descending" | "random";
  newCardSortOrder: "type_then_gathered" | "random";
  newReviewOrder: "mix" | "new_first" | "reviews_first";
  interdayLearningReviewOrder: "mix" | "learning_first" | "reviews_first";
  reviewSortOrder: "due_then_random" | "due_date" | "random";

  // FSRS
  fsrsEnabled: boolean;
  fsrsDesiredRetention: number; // 0.90
  fsrsMaxInterval: number; // 36500
  fsrsWeights: number[];

  // Burying
  buryNewSiblings: boolean;
  buryReviewSiblings: boolean;
  buryInterdayLearningSiblings: boolean;

  // Audio
  dontPlayAudioAuto: boolean;
  skipQuestionWhenReplayingAnswer: boolean;

  // Timers
  maxAnswerSeconds: number;
  showOnScreenTimer: boolean;
  stopOnScreenTimerOnAnswer: boolean;

  // Auto Advance
  secondsToShowQuestion: number;
  secondsToShowAnswer: number;
  waitForAudio: boolean;
  questionAction: "show_answer" | "bury";
  answerAction: "bury" | "suspend" | "good";

  // Easy Days
  easyDays: EasyDaysConfig;

  // Advanced / SM-2
  startingEase: number; // 2.50
  easyBonus: number; // 1.30
  intervalModifier: number; // 1.00
  hardInterval: number; // 1.20
  newInterval: number; // 0.00
  maxInterval: number; // 36500
}

export const DEFAULT_FSRS_WEIGHTS: number[] = [
  0.4025, 1.1838, 3.1730, 15.6910, 7.1949, 0.5345, 1.4604, 0.0046, 1.5457,
  0.1192, 1.0192, 1.9395, 0.11, 0.2960, 2.2698, 0.2315, 2.9898, 0.5165, 0.6621
];

export const DEFAULT_SRS_SETTINGS: SrsSettings = {
  // Daily Limits
  newCardsPerDay: 20,
  maxReviewsPerDay: 200,
  newCardsIgnoreReviewLimit: false,
  limitsStartFromTop: false,

  // New Cards
  learningSteps: "1m 10m",
  graduatingInterval: 1,
  easyInterval: 4,
  insertionOrder: "oldest",

  // Lapses
  relearningSteps: "10m",
  minimumInterval: 1,
  leechThreshold: 8,
  leechAction: "tag",

  // Display Order
  newCardGatherOrder: "deck",
  newCardSortOrder: "type_then_gathered",
  newReviewOrder: "mix",
  interdayLearningReviewOrder: "mix",
  reviewSortOrder: "due_then_random",

  // FSRS
  fsrsEnabled: false,
  fsrsDesiredRetention: 0.90,
  fsrsMaxInterval: 36500,
  fsrsWeights: [...DEFAULT_FSRS_WEIGHTS],

  // Burying
  buryNewSiblings: false,
  buryReviewSiblings: false,
  buryInterdayLearningSiblings: false,

  // Audio
  dontPlayAudioAuto: false,
  skipQuestionWhenReplayingAnswer: false,

  // Timers
  maxAnswerSeconds: 60,
  showOnScreenTimer: false,
  stopOnScreenTimerOnAnswer: false,

  // Auto Advance
  secondsToShowQuestion: 0,
  secondsToShowAnswer: 0,
  waitForAudio: true,
  questionAction: "show_answer",
  answerAction: "bury",

  // Easy Days
  easyDays: {
    Mon: "normal",
    Tue: "normal",
    Wed: "normal",
    Thu: "normal",
    Fri: "normal",
    Sat: "normal",
    Sun: "normal"
  },

  // Advanced
  startingEase: 2.50,
  easyBonus: 1.30,
  intervalModifier: 1.00,
  hardInterval: 1.20,
  newInterval: 0.00,
  maxInterval: 36500
};

const STORAGE_KEY = "subminer_anki_srs_settings";

export function getSrsSettings(): SrsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SRS_SETTINGS,
        ...parsed,
        easyDays: {
          ...DEFAULT_SRS_SETTINGS.easyDays,
          ...(parsed.easyDays || {})
        },
        fsrsWeights: Array.isArray(parsed.fsrsWeights) && parsed.fsrsWeights.length === 19
          ? parsed.fsrsWeights
          : [...DEFAULT_FSRS_WEIGHTS]
      };
    }
  } catch (e) {
    console.warn("Failed to load SRS settings from storage:", e);
  }
  return { ...DEFAULT_SRS_SETTINGS };
}

export function saveSrsSettings(settings: SrsSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save SRS settings:", e);
  }
}

/**
 * Parses learning step strings like "1m 10m" or "10m 1d" into array of durations in days.
 */
export function parseLearningSteps(stepsStr: string): number[] {
  if (!stepsStr || !stepsStr.trim()) return [1 / 1440]; // default 1 min
  const parts = stepsStr.trim().split(/\s+/);
  const result: number[] = [];

  for (const p of parts) {
    const match = p.match(/^(\d+(?:\.\d+)?)([mhd])?$/i);
    if (match) {
      const num = parseFloat(match[1]);
      const unit = (match[2] || "m").toLowerCase();
      if (unit === "m") {
        result.push(num / 1440); // minutes to days
      } else if (unit === "h") {
        result.push(num / 24); // hours to days
      } else if (unit === "d") {
        result.push(num); // days
      }
    }
  }

  return result.length > 0 ? result : [1 / 1440];
}

export function formatIntervalLabel(days: number): string {
  if (days < 1 / 1440) {
    return "<1m";
  }
  if (days < 1 / 24) {
    const mins = Math.max(1, Math.round(days * 1440));
    return `${mins}m`;
  }
  if (days < 1) {
    const hours = Math.round(days * 24);
    return `${hours}h`;
  }
  if (days < 30) {
    const d = Math.round(days);
    return `${d}d`;
  }
  if (days < 365) {
    const m = (days / 30).toFixed(1).replace(/\.0$/, "");
    return `${m}mo`;
  }
  const y = (days / 365).toFixed(1).replace(/\.0$/, "");
  return `${y}y`;
}

export interface ReviewCalculation {
  nextIntervalDays: number;
  nextDueMs: number;
  newFactor: number;
  newStability?: number;
  newDifficulty?: number;
  newState: "learning" | "review" | "relearning";
  newStepIndex?: number;
  isFinishedLearningStep?: boolean;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

/**
 * Calculates the next SRS schedule for a card given a rating ('again' | 'good') exactly as Anki does.
 */
export function calculateNextReview(
  card: AnkiCard,
  rating: "again" | "good",
  settings: SrsSettings
): ReviewCalculation {
  const now = Date.now();
  const currentState = card.state || "new";
  const currentStep = card.stepIndex ?? 0;
  const currentFactor = card.factor || settings.startingEase || 2.5;

  // 1. CARDS IN 'NEW', 'LEARNING', OR 'RELEARNING' STEPS
  if (currentState === "new" || currentState === "learning" || currentState === "relearning") {
    const rawStepsStr = currentState === "relearning" ? settings.relearningSteps : settings.learningSteps;
    const steps = parseLearningSteps(rawStepsStr);

    if (rating === "again") {
      // AGAIN in learning/relearning resets stepIndex to 0
      const stepDurationDays = steps[0] || (1 / 1440);
      return {
        nextIntervalDays: stepDurationDays,
        nextDueMs: now + stepDurationDays * 86400 * 1000,
        newFactor: currentState === "relearning" ? Math.max(1.3, currentFactor - 0.20) : currentFactor,
        newState: currentState === "new" ? "learning" : currentState,
        newStepIndex: 0,
        isFinishedLearningStep: false
      };
    } else {
      // GOOD in learning/relearning
      const nextStepIndex = currentStep + 1;
      if (nextStepIndex < steps.length) {
        // Advance to next learning step
        const stepDurationDays = steps[nextStepIndex];
        return {
          nextIntervalDays: stepDurationDays,
          nextDueMs: now + stepDurationDays * 86400 * 1000,
          newFactor: currentFactor,
          newState: currentState === "new" ? "learning" : currentState,
          newStepIndex: nextStepIndex,
          isFinishedLearningStep: false
        };
      } else {
        // Graduated from learning/relearning steps!
        if (currentState === "relearning") {
          // Relearning graduate -> review state with minimum interval or lapse interval
          const lapseIvl = Math.max(
            settings.minimumInterval,
            Math.round((card.ivl || 1) * settings.newInterval)
          );
          return {
            nextIntervalDays: lapseIvl,
            nextDueMs: now + lapseIvl * 86400 * 1000,
            newFactor: currentFactor,
            newState: "review",
            newStepIndex: 0,
            isFinishedLearningStep: true
          };
        } else {
          // New/learning graduate -> review state with graduating interval
          const gradIvl = Math.max(1, settings.graduatingInterval);
          return {
            nextIntervalDays: gradIvl,
            nextDueMs: now + gradIvl * 86400 * 1000,
            newFactor: currentFactor,
            newState: "review",
            newStepIndex: 0,
            isFinishedLearningStep: true
          };
        }
      }
    }
  }

  // 2. CARDS IN 'REVIEW' STATE
  if (rating === "again") {
    // AGAIN on a review card -> triggers Lapse / Relearning
    const relearningSteps = parseLearningSteps(settings.relearningSteps);
    const firstStepDays = relearningSteps[0] || (10 / 1440);
    const newFactor = Math.max(1.3, currentFactor - 0.20); // Ease decreased by 20%

    return {
      nextIntervalDays: firstStepDays,
      nextDueMs: now + firstStepDays * 86400 * 1000,
      newFactor: newFactor,
      newState: "relearning",
      newStepIndex: 0,
      isFinishedLearningStep: false
    };
  }

  // GOOD on a review card
  const isFsrs = settings.fsrsEnabled;

  if (isFsrs) {
    const w = settings.fsrsWeights.length === 19 ? settings.fsrsWeights : DEFAULT_FSRS_WEIGHTS;
    const targetR = settings.fsrsDesiredRetention || 0.90;
    const maxIvl = settings.fsrsMaxInterval || settings.maxInterval || 36500;

    let s = card.stability || w[2];
    let d = card.difficulty || w[4];

    const last = card.lastReview || card.createdAt || now;
    const tDays = Math.max(0, (now - last) / (1000 * 60 * 60 * 24));
    const currentR = Math.exp((Math.log(0.9) * tDays) / s);

    d = clamp(d, 1, 10);
    const term = 1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - currentR) * w[10]) - 1);
    s = Math.max(0.1, s * term);

    const factor = Math.log(targetR) / Math.log(0.9);
    let nextIvl = Math.max(1, Math.round(s * factor));
    nextIvl = Math.min(nextIvl, maxIvl);

    return {
      nextIntervalDays: nextIvl,
      nextDueMs: now + nextIvl * 86400 * 1000,
      newFactor: currentFactor,
      newStability: s,
      newDifficulty: d,
      newState: "review",
      newStepIndex: 0,
      isFinishedLearningStep: true
    };
  } else {
    // Standard Anki SM-2
    const currentIvl = card.ivl || 1;
    const ivlMod = settings.intervalModifier || 1.0;
    const maxIvl = settings.maxInterval || 36500;

    let nextIvl = Math.max(currentIvl + 1, Math.round(currentIvl * currentFactor * ivlMod));
    nextIvl = Math.min(nextIvl, maxIvl);

    return {
      nextIntervalDays: nextIvl,
      nextDueMs: now + nextIvl * 86400 * 1000,
      newFactor: currentFactor,
      newState: "review",
      newStepIndex: 0,
      isFinishedLearningStep: true
    };
  }
}

/**
 * Filter cards due for review according to SRS settings
 */
export function filterDueCards(cards: AnkiCard[], settings: SrsSettings): AnkiCard[] {
  const now = Date.now();
  const visibleCards = cards.filter((c) => !c.hidden);

  const due = visibleCards.filter((card) => {
    if (card.due) {
      return card.due <= now;
    }
    return true;
  });

  return due;
}
