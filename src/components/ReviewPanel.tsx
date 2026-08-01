import React, { useState, useEffect, useMemo } from "react";
import { MangaDB } from "../db";
import { AnkiCard } from "../ankiUtils";
import { resolveMediaSrc } from "../mediaStore";
import {
  SrsSettings,
  getSrsSettings,
  saveSrsSettings,
  DEFAULT_SRS_SETTINGS,
  DEFAULT_FSRS_WEIGHTS,
  calculateNextReview,
  filterDueCards,
  formatIntervalLabel,
  EasyDaysConfig
} from "../ankiSrs";

export const ReviewPanel: React.FC = () => {
  const [cards, setCards] = useState<AnkiCard[]>([]);
  const [mode, setMode] = useState<"deck_summary" | "options" | "reviewing">("deck_summary");
  const [srsSettings, setSrsSettings] = useState<SrsSettings>(getSrsSettings());

  // Reviewing session state
  const [reviewQueue, setReviewQueue] = useState<AnkiCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [showAnswer, setShowAnswer] = useState<boolean>(false);
  const [timerSeconds, setTimerSeconds] = useState<number>(0);

  // Options form state
  const [optionsForm, setOptionsForm] = useState<SrsSettings>(getSrsSettings());
  const [weightsInput, setWeightsInput] = useState<string>(() => {
    const s = getSrsSettings();
    return (s.fsrsWeights || DEFAULT_FSRS_WEIGHTS).join(", ");
  });

  useEffect(() => {
    loadCards();
    const handleCardsUpdated = () => loadCards();
    window.addEventListener("subminer_card_created", handleCardsUpdated);
    return () => window.removeEventListener("subminer_card_created", handleCardsUpdated);
  }, []);

  // Timer effect during card reviewing
  useEffect(() => {
    if (mode !== "reviewing" || !optionsForm.showOnScreenTimer) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [mode, currentIndex, showAnswer, optionsForm.showOnScreenTimer]);

  const loadCards = async () => {
    try {
      const loaded = await MangaDB.getCreatedCards();
      setCards(loaded);
    } catch (e) {
      console.error("Failed to load cards for review:", e);
    }
  };

  const dueCards = useMemo(() => {
    return filterDueCards(cards, srsSettings);
  }, [cards, srsSettings]);

  const currentCard = reviewQueue[currentIndex] || null;

  // Calculate interval estimates for AGAIN and GOOD
  const againEstLabel = useMemo(() => {
    if (!currentCard) return "";
    const calc = calculateNextReview(currentCard, "again", srsSettings);
    return formatIntervalLabel(calc.nextIntervalDays);
  }, [currentCard, srsSettings]);

  const goodEstLabel = useMemo(() => {
    if (!currentCard) return "";
    const calc = calculateNextReview(currentCard, "good", srsSettings);
    return formatIntervalLabel(calc.nextIntervalDays);
  }, [currentCard, srsSettings]);

  // Start study session
  const handleStartReview = (customQueue?: AnkiCard[]) => {
    const queue = customQueue || dueCards;
    if (queue.length === 0) return;
    setReviewQueue([...queue]);
    setCurrentIndex(0);
    setShowAnswer(false);
    setTimerSeconds(0);
    setMode("reviewing");
  };

  // Open Options screen
  const handleOpenOptions = () => {
    const current = getSrsSettings();
    setSrsSettings(current);
    setOptionsForm(current);
    setWeightsInput((current.fsrsWeights || DEFAULT_FSRS_WEIGHTS).join(", "));
    setMode("options");
  };

  // Save Options
  const handleSaveOptions = () => {
    let parsedWeights = DEFAULT_FSRS_WEIGHTS;
    try {
      const split = weightsInput
        .split(",")
        .map((x) => parseFloat(x.trim()))
        .filter((x) => !isNaN(x));
      if (split.length === 19) {
        parsedWeights = split;
      }
    } catch (e) {}

    const updated: SrsSettings = {
      ...optionsForm,
      fsrsWeights: parsedWeights
    };

    saveSrsSettings(updated);
    setSrsSettings(updated);
  };

  // Reset Options
  const handleResetOptions = () => {
    setOptionsForm({ ...DEFAULT_SRS_SETTINGS });
    setWeightsInput([...DEFAULT_FSRS_WEIGHTS].join(", "));
    saveSrsSettings({ ...DEFAULT_SRS_SETTINGS });
    setSrsSettings({ ...DEFAULT_SRS_SETTINGS });
  };

  // Answer rating (AGAIN or GOOD)
  const handleRateCard = async (rating: "again" | "good") => {
    if (!currentCard) return;

    const calc = calculateNextReview(currentCard, rating, srsSettings);

    const updatedCard: AnkiCard = {
      ...currentCard,
      due: calc.nextDueMs,
      ivl: calc.nextIntervalDays,
      factor: calc.newFactor,
      stability: calc.newStability ?? currentCard.stability,
      difficulty: calc.newDifficulty ?? currentCard.difficulty,
      lastReview: Date.now(),
      reps: (currentCard.reps || 0) + 1,
      lapses: rating === "again" ? (currentCard.lapses || 0) + 1 : (currentCard.lapses || 0),
      state: calc.newState,
      stepIndex: calc.newStepIndex ?? 0
    };

    try {
      await MangaDB.saveCreatedCard(updatedCard);
      window.dispatchEvent(new Event("subminer_card_created"));
    } catch (e) {
      console.error("Failed to update card SRS state:", e);
    }

    // Queue update logic matching Anki:
    // If card did not graduate (i.e. still in learning/relearning or got AGAIN), re-add to back of queue
    const updatedQueue = [...reviewQueue];
    if (!calc.isFinishedLearningStep) {
      updatedQueue.push(updatedCard);
    }

    if (currentIndex + 1 < updatedQueue.length) {
      setReviewQueue(updatedQueue);
      setCurrentIndex((prev) => prev + 1);
      setShowAnswer(false);
      setTimerSeconds(0);
    } else {
      // Completed queue
      setMode("deck_summary");
      loadCards();
    }
  };

  // Play audio helper
  const handlePlayAudio = (src: string | undefined) => {
    if (!src) return;
    try {
      const a = new Audio(src);
      a.play().catch(() => {});
    } catch (e) {}
  };

  return (
    <div className="bg-zinc-800 rounded-xl p-5 shadow-none text-zinc-300 select-none">
      {/* 1. DECK SUMMARY SCREEN */}
      {mode === "deck_summary" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-400">
              REVIEW
            </span>
            <span className="text-xs font-mono font-bold text-zinc-500 uppercase">
              ALGORITHM: {srsSettings.fsrsEnabled ? "FSRS" : "SM-2"}
            </span>
          </div>

          {/* Deck Box matching the deck / card screen style */}
          <div
            onClick={() => {
              if (dueCards.length > 0) {
                handleStartReview();
              }
            }}
            className={`w-full text-left p-4 rounded-md bg-zinc-900/50 hover:bg-zinc-900 text-zinc-300 transition-all flex items-center justify-between gap-3 border-none outline-none relative overflow-hidden ${
              dueCards.length > 0 ? "cursor-pointer" : ""
            }`}
          >
            <div className="flex flex-col gap-1 min-w-0">
              <p className="text-base font-sans font-semibold text-zinc-200">
                Immersion Deck
              </p>
              <p className="text-xs font-mono text-zinc-500">
                {cards.filter((c) => !c.hidden).length} Total Cards
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs font-mono font-bold text-zinc-400 uppercase">
                {dueCards.length} DUE
              </span>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenOptions();
                }}
                className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
              >
                OPTIONS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. DECK OPTIONS SCREEN (ALL ANKI DECK OPTIONS) */}
      {mode === "options" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-400">
              DECK OPTIONS
            </span>
            <button
              onClick={() => setMode("deck_summary")}
              className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
            >
              BACK
            </button>
          </div>

          <div className="space-y-5 max-h-[500px] overflow-y-auto pr-2">
            {/* 1. DAILY LIMITS */}
            <div className="p-3.5 bg-zinc-900/50 rounded-md space-y-3">
              <span className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider block border-b border-zinc-800 pb-1.5">
                DAILY LIMITS
              </span>
              <div className="space-y-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    NEW CARDS / DAY
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={optionsForm.newCardsPerDay}
                    onChange={(e) =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        newCardsPerDay: parseInt(e.target.value, 10) || 0
                      }))
                    }
                    className="w-full bg-zinc-900 p-2 rounded text-xs font-mono text-zinc-200 border-none outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    MAXIMUM REVIEWS / DAY
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={optionsForm.maxReviewsPerDay}
                    onChange={(e) =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        maxReviewsPerDay: parseInt(e.target.value, 10) || 0
                      }))
                    }
                    className="w-full bg-zinc-900 p-2 rounded text-xs font-mono text-zinc-200 border-none outline-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase">
                    NEW CARDS IGNORE REVIEW LIMIT
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        newCardsIgnoreReviewLimit: !prev.newCardsIgnoreReviewLimit
                      }))
                    }
                    className="px-3 py-1 font-mono text-xs font-bold uppercase rounded cursor-pointer bg-zinc-900 text-zinc-300 border-none outline-none"
                  >
                    {optionsForm.newCardsIgnoreReviewLimit ? "ON" : "OFF"}
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase">
                    LIMITS START FROM TOP
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        limitsStartFromTop: !prev.limitsStartFromTop
                      }))
                    }
                    className="px-3 py-1 font-mono text-xs font-bold uppercase rounded cursor-pointer bg-zinc-900 text-zinc-300 border-none outline-none"
                  >
                    {optionsForm.limitsStartFromTop ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
            </div>

            {/* 2. NEW CARDS */}
            <div className="p-3.5 bg-zinc-900/50 rounded-md space-y-3">
              <span className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider block border-b border-zinc-800 pb-1.5">
                NEW CARDS
              </span>
              <div className="space-y-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    LEARNING STEPS (E.G. 1m 10m)
                  </label>
                  <input
                    type="text"
                    value={optionsForm.learningSteps}
                    onChange={(e) =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        learningSteps: e.target.value
                      }))
                    }
                    className="w-full bg-zinc-900 p-2 rounded text-xs font-mono text-zinc-200 border-none outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    GRADUATING INTERVAL (DAYS)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={optionsForm.graduatingInterval}
                    onChange={(e) =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        graduatingInterval: parseInt(e.target.value, 10) || 1
                      }))
                    }
                    className="w-full bg-zinc-900 p-2 rounded text-xs font-mono text-zinc-200 border-none outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    EASY INTERVAL (DAYS)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={optionsForm.easyInterval}
                    onChange={(e) =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        easyInterval: parseInt(e.target.value, 10) || 4
                      }))
                    }
                    className="w-full bg-zinc-900 p-2 rounded text-xs font-mono text-zinc-200 border-none outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    INSERTION ORDER
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setOptionsForm((prev) => ({ ...prev, insertionOrder: "oldest" }))}
                      className={`flex-1 py-1.5 font-mono text-xs uppercase font-bold rounded border-none outline-none ${
                        optionsForm.insertionOrder === "oldest" ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"
                      }`}
                    >
                      SEQUENTIAL (OLDEST FIRST)
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptionsForm((prev) => ({ ...prev, insertionOrder: "random" }))}
                      className={`flex-1 py-1.5 font-mono text-xs uppercase font-bold rounded border-none outline-none ${
                        optionsForm.insertionOrder === "random" ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"
                      }`}
                    >
                      RANDOM
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. LAPSES */}
            <div className="p-3.5 bg-zinc-900/50 rounded-md space-y-3">
              <span className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider block border-b border-zinc-800 pb-1.5">
                LAPSES
              </span>
              <div className="space-y-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    RELEARNING STEPS (E.G. 10m)
                  </label>
                  <input
                    type="text"
                    value={optionsForm.relearningSteps}
                    onChange={(e) =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        relearningSteps: e.target.value
                      }))
                    }
                    className="w-full bg-zinc-900 p-2 rounded text-xs font-mono text-zinc-200 border-none outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    MINIMUM INTERVAL (DAYS)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={optionsForm.minimumInterval}
                    onChange={(e) =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        minimumInterval: parseInt(e.target.value, 10) || 1
                      }))
                    }
                    className="w-full bg-zinc-900 p-2 rounded text-xs font-mono text-zinc-200 border-none outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    LEECH THRESHOLD
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={optionsForm.leechThreshold}
                    onChange={(e) =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        leechThreshold: parseInt(e.target.value, 10) || 8
                      }))
                    }
                    className="w-full bg-zinc-900 p-2 rounded text-xs font-mono text-zinc-200 border-none outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    LEECH ACTION
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setOptionsForm((prev) => ({ ...prev, leechAction: "tag" }))}
                      className={`flex-1 py-1.5 font-mono text-xs uppercase font-bold rounded border-none outline-none ${
                        optionsForm.leechAction === "tag" ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"
                      }`}
                    >
                      TAG ONLY
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptionsForm((prev) => ({ ...prev, leechAction: "suspend" }))}
                      className={`flex-1 py-1.5 font-mono text-xs uppercase font-bold rounded border-none outline-none ${
                        optionsForm.leechAction === "suspend" ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"
                      }`}
                    >
                      SUSPEND
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. DISPLAY ORDER */}
            <div className="p-3.5 bg-zinc-900/50 rounded-md space-y-3">
              <span className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider block border-b border-zinc-800 pb-1.5">
                DISPLAY ORDER
              </span>
              <div className="space-y-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    NEW / REVIEW ORDER
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setOptionsForm((prev) => ({ ...prev, newReviewOrder: "mix" }))}
                      className={`py-1.5 font-mono text-[11px] uppercase font-bold rounded border-none outline-none ${
                        optionsForm.newReviewOrder === "mix" ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"
                      }`}
                    >
                      MIX
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptionsForm((prev) => ({ ...prev, newReviewOrder: "new_first" }))}
                      className={`py-1.5 font-mono text-[11px] uppercase font-bold rounded border-none outline-none ${
                        optionsForm.newReviewOrder === "new_first" ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"
                      }`}
                    >
                      NEW FIRST
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptionsForm((prev) => ({ ...prev, newReviewOrder: "reviews_first" }))}
                      className={`py-1.5 font-mono text-[11px] uppercase font-bold rounded border-none outline-none ${
                        optionsForm.newReviewOrder === "reviews_first" ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"
                      }`}
                    >
                      REVIEWS FIRST
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    REVIEW SORT ORDER
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setOptionsForm((prev) => ({ ...prev, reviewSortOrder: "due_then_random" }))}
                      className={`py-1.5 font-mono text-[11px] uppercase font-bold rounded border-none outline-none ${
                        optionsForm.reviewSortOrder === "due_then_random" ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"
                      }`}
                    >
                      DUE THEN RANDOM
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptionsForm((prev) => ({ ...prev, reviewSortOrder: "due_date" }))}
                      className={`py-1.5 font-mono text-[11px] uppercase font-bold rounded border-none outline-none ${
                        optionsForm.reviewSortOrder === "due_date" ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"
                      }`}
                    >
                      DUE DATE
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptionsForm((prev) => ({ ...prev, reviewSortOrder: "random" }))}
                      className={`py-1.5 font-mono text-[11px] uppercase font-bold rounded border-none outline-none ${
                        optionsForm.reviewSortOrder === "random" ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"
                      }`}
                    >
                      RANDOM
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. FSRS */}
            <div className="p-3.5 bg-zinc-900/50 rounded-md space-y-3">
              <span className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider block border-b border-zinc-800 pb-1.5">
                FSRS
              </span>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase">
                    ENABLE FSRS
                  </span>
                  <button
                    type="button"
                    onClick={() => setOptionsForm((prev) => ({ ...prev, fsrsEnabled: !prev.fsrsEnabled }))}
                    className="px-3 py-1 font-mono text-xs font-bold uppercase rounded cursor-pointer bg-zinc-900 text-zinc-300 border-none outline-none"
                  >
                    {optionsForm.fsrsEnabled ? "ON" : "OFF"}
                  </button>
                </div>

                {optionsForm.fsrsEnabled && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-mono text-zinc-400 uppercase">
                        DESIRED RETENTION (0.70 - 0.99)
                      </label>
                      <input
                        type="number"
                        step={0.01}
                        min={0.70}
                        max={0.99}
                        value={optionsForm.fsrsDesiredRetention}
                        onChange={(e) =>
                          setOptionsForm((prev) => ({
                            ...prev,
                            fsrsDesiredRetention: parseFloat(e.target.value) || 0.90
                          }))
                        }
                        className="w-full bg-zinc-900 p-2 rounded text-xs font-mono text-zinc-200 border-none outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-mono text-zinc-400 uppercase">
                        FSRS PARAMETERS (19 WEIGHTS COMMA SEPARATED)
                      </label>
                      <textarea
                        rows={3}
                        value={weightsInput}
                        onChange={(e) => setWeightsInput(e.target.value)}
                        className="w-full bg-zinc-900 p-2 rounded text-xs font-mono text-zinc-200 border-none outline-none resize-none leading-relaxed"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 6. BURYING */}
            <div className="p-3.5 bg-zinc-900/50 rounded-md space-y-3">
              <span className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider block border-b border-zinc-800 pb-1.5">
                BURYING
              </span>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase">
                    BURY NEW SIBLINGS
                  </span>
                  <button
                    type="button"
                    onClick={() => setOptionsForm((prev) => ({ ...prev, buryNewSiblings: !prev.buryNewSiblings }))}
                    className="px-3 py-1 font-mono text-xs font-bold uppercase rounded cursor-pointer bg-zinc-900 text-zinc-300 border-none outline-none"
                  >
                    {optionsForm.buryNewSiblings ? "ON" : "OFF"}
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase">
                    BURY REVIEW SIBLINGS
                  </span>
                  <button
                    type="button"
                    onClick={() => setOptionsForm((prev) => ({ ...prev, buryReviewSiblings: !prev.buryReviewSiblings }))}
                    className="px-3 py-1 font-mono text-xs font-bold uppercase rounded cursor-pointer bg-zinc-900 text-zinc-300 border-none outline-none"
                  >
                    {optionsForm.buryReviewSiblings ? "ON" : "OFF"}
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase">
                    BURY INTERDAY LEARNING SIBLINGS
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        buryInterdayLearningSiblings: !prev.buryInterdayLearningSiblings
                      }))
                    }
                    className="px-3 py-1 font-mono text-xs font-bold uppercase rounded cursor-pointer bg-zinc-900 text-zinc-300 border-none outline-none"
                  >
                    {optionsForm.buryInterdayLearningSiblings ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
            </div>

            {/* 7. AUDIO */}
            <div className="p-3.5 bg-zinc-900/50 rounded-md space-y-3">
              <span className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider block border-b border-zinc-800 pb-1.5">
                AUDIO
              </span>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase">
                    DON'T PLAY AUDIO AUTOMATICALLY
                  </span>
                  <button
                    type="button"
                    onClick={() => setOptionsForm((prev) => ({ ...prev, dontPlayAudioAuto: !prev.dontPlayAudioAuto }))}
                    className="px-3 py-1 font-mono text-xs font-bold uppercase rounded cursor-pointer bg-zinc-900 text-zinc-300 border-none outline-none"
                  >
                    {optionsForm.dontPlayAudioAuto ? "ON" : "OFF"}
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase">
                    SKIP QUESTION WHEN REPLAYING ANSWER
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        skipQuestionWhenReplayingAnswer: !prev.skipQuestionWhenReplayingAnswer
                      }))
                    }
                    className="px-3 py-1 font-mono text-xs font-bold uppercase rounded cursor-pointer bg-zinc-900 text-zinc-300 border-none outline-none"
                  >
                    {optionsForm.skipQuestionWhenReplayingAnswer ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
            </div>

            {/* 8. TIMERS */}
            <div className="p-3.5 bg-zinc-900/50 rounded-md space-y-3">
              <span className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider block border-b border-zinc-800 pb-1.5">
                TIMERS
              </span>
              <div className="space-y-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    MAXIMUM ANSWER SECONDS
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={optionsForm.maxAnswerSeconds}
                    onChange={(e) =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        maxAnswerSeconds: parseInt(e.target.value, 10) || 60
                      }))
                    }
                    className="w-full bg-zinc-900 p-2 rounded text-xs font-mono text-zinc-200 border-none outline-none"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase">
                    SHOW ON-SCREEN TIMER
                  </span>
                  <button
                    type="button"
                    onClick={() => setOptionsForm((prev) => ({ ...prev, showOnScreenTimer: !prev.showOnScreenTimer }))}
                    className="px-3 py-1 font-mono text-xs font-bold uppercase rounded cursor-pointer bg-zinc-900 text-zinc-300 border-none outline-none"
                  >
                    {optionsForm.showOnScreenTimer ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
            </div>

            {/* 9. EASY DAYS */}
            <div className="p-3.5 bg-zinc-900/50 rounded-md space-y-3">
              <span className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider block border-b border-zinc-800 pb-1.5">
                EASY DAYS
              </span>
              <div className="grid grid-cols-1 gap-2">
                {(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as (keyof EasyDaysConfig)[]).map((day) => (
                  <div key={day} className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-zinc-400 uppercase">{day}</span>
                    <div className="flex gap-1">
                      {(["normal", "reduced", "minimum"] as const).map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() =>
                            setOptionsForm((prev) => ({
                              ...prev,
                              easyDays: { ...prev.easyDays, [day]: level }
                            }))
                          }
                          className={`px-2 py-1 font-mono text-[10px] uppercase font-bold rounded border-none outline-none ${
                            optionsForm.easyDays[day] === level ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-500"
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 10. ADVANCED */}
            <div className="p-3.5 bg-zinc-900/50 rounded-md space-y-3">
              <span className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider block border-b border-zinc-800 pb-1.5">
                ADVANCED
              </span>
              <div className="space-y-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    MAXIMUM INTERVAL (DAYS)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={optionsForm.maxInterval}
                    onChange={(e) =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        maxInterval: parseInt(e.target.value, 10) || 36500
                      }))
                    }
                    className="w-full bg-zinc-900 p-2 rounded text-xs font-mono text-zinc-200 border-none outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    STARTING EASE
                  </label>
                  <input
                    type="number"
                    step={0.05}
                    min={1.3}
                    value={optionsForm.startingEase}
                    onChange={(e) =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        startingEase: parseFloat(e.target.value) || 2.5
                      }))
                    }
                    className="w-full bg-zinc-900 p-2 rounded text-xs font-mono text-zinc-200 border-none outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    EASY BONUS
                  </label>
                  <input
                    type="number"
                    step={0.05}
                    value={optionsForm.easyBonus}
                    onChange={(e) =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        easyBonus: parseFloat(e.target.value) || 1.3
                      }))
                    }
                    className="w-full bg-zinc-900 p-2 rounded text-xs font-mono text-zinc-200 border-none outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    INTERVAL MODIFIER
                  </label>
                  <input
                    type="number"
                    step={0.05}
                    value={optionsForm.intervalModifier}
                    onChange={(e) =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        intervalModifier: parseFloat(e.target.value) || 1.0
                      }))
                    }
                    className="w-full bg-zinc-900 p-2 rounded text-xs font-mono text-zinc-200 border-none outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    HARD INTERVAL
                  </label>
                  <input
                    type="number"
                    step={0.05}
                    value={optionsForm.hardInterval}
                    onChange={(e) =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        hardInterval: parseFloat(e.target.value) || 1.2
                      }))
                    }
                    className="w-full bg-zinc-900 p-2 rounded text-xs font-mono text-zinc-200 border-none outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase">
                    NEW INTERVAL
                  </label>
                  <input
                    type="number"
                    step={0.05}
                    value={optionsForm.newInterval}
                    onChange={(e) =>
                      setOptionsForm((prev) => ({
                        ...prev,
                        newInterval: parseFloat(e.target.value) || 0.0
                      }))
                    }
                    className="w-full bg-zinc-900 p-2 rounded text-xs font-mono text-zinc-200 border-none outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleResetOptions}
              className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
            >
              RESET DEFAULTS
            </button>
            <button
              onClick={handleSaveOptions}
              className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
            >
              SAVE OPTIONS
            </button>
          </div>
        </div>
      )}

      {/* 3. REVIEWING CARD SCREEN */}
      {mode === "reviewing" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-400">
                CARD {currentIndex + 1} OF {reviewQueue.length}
              </span>
              {optionsForm.showOnScreenTimer && (
                <span className="text-xs font-mono text-emerald-400 font-semibold">
                  {timerSeconds}s
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setMode("deck_summary");
                loadCards();
              }}
              className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
            >
              EXIT
            </button>
          </div>

          {currentCard ? (
            <div className="p-6 bg-zinc-900/50 rounded-lg flex flex-col items-center justify-center gap-4 text-center min-h-[260px] border-none outline-none">
              {/* Media Preview (Picture if available) */}
              {(() => {
                const picSrc = resolveMediaSrc(currentCard.fields["Picture"]);
                if (!picSrc) return null;
                return (
                  <img
                    src={picSrc}
                    alt="Card visual"
                    className="max-h-48 rounded-lg object-contain"
                  />
                );
              })()}

              {/* Front Content */}
              <div className="space-y-2 w-full max-w-xl">
                <p className="text-3xl font-sans font-bold text-white tracking-wide">
                  {currentCard.fields["Word"] || "Untitled Card"}
                </p>

                {currentCard.fields["Sentence"] && (
                  <p className="text-base font-sans text-zinc-300 leading-relaxed">
                    {currentCard.fields["Sentence"]}
                  </p>
                )}

                {/* Audio buttons text-only */}
                {(() => {
                  const wordAudioSrc = resolveMediaSrc(currentCard.fields["Word Audio"]);
                  const sentenceAudioSrc = resolveMediaSrc(currentCard.fields["Sentence Audio"]);
                  if (!wordAudioSrc && !sentenceAudioSrc) return null;

                  return (
                    <div className="flex justify-center gap-2 pt-1">
                      {wordAudioSrc && (
                        <button
                          type="button"
                          onClick={() => handlePlayAudio(wordAudioSrc)}
                          className="px-3 py-1 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-[11px] border-none outline-none"
                        >
                          PLAY WORD AUDIO
                        </button>
                      )}
                      {sentenceAudioSrc && (
                        <button
                          type="button"
                          onClick={() => handlePlayAudio(sentenceAudioSrc)}
                          className="px-3 py-1 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-[11px] border-none outline-none"
                        >
                          PLAY SENTENCE AUDIO
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Reveal / Answer section */}
              {!showAnswer ? (
                <div className="pt-4 w-full max-w-xs">
                  <button
                    onClick={() => {
                      setShowAnswer(true);
                      if (!optionsForm.dontPlayAudioAuto) {
                        const wAudio = resolveMediaSrc(currentCard.fields["Word Audio"]);
                        if (wAudio) handlePlayAudio(wAudio);
                      }
                    }}
                    className="w-full p-3 bg-zinc-800 hover:bg-zinc-700 text-white font-mono font-bold text-xs uppercase rounded-md transition-all cursor-pointer border-none outline-none"
                  >
                    SHOW ANSWER
                  </button>
                </div>
              ) : (
                <div className="w-full max-w-xl space-y-4 pt-4 border-t border-zinc-800">
                  {/* Word Furigana / Meaning */}
                  {currentCard.fields["Word Furigana"] && (
                    <p className="text-lg font-sans text-emerald-400 font-semibold">
                      {currentCard.fields["Word Furigana"]}
                    </p>
                  )}

                  {currentCard.fields["Word Meaning"] && (
                    <p className="text-sm font-sans text-zinc-200">
                      {currentCard.fields["Word Meaning"]}
                    </p>
                  )}

                  {/* Sentence Furigana / Meaning */}
                  {currentCard.fields["Sentence Furigana"] && (
                    <p className="text-sm font-sans text-zinc-300">
                      {currentCard.fields["Sentence Furigana"]}
                    </p>
                  )}

                  {currentCard.fields["Sentence Meaning"] && (
                    <p className="text-xs font-sans text-zinc-400">
                      {currentCard.fields["Sentence Meaning"]}
                    </p>
                  )}

                  {/* Notes */}
                  {currentCard.fields["Notes"] && (
                    <p className="text-xs font-mono text-zinc-400 italic">
                      Note: {currentCard.fields["Notes"]}
                    </p>
                  )}

                  {/* ONLY AGAIN and GOOD buttons (Strictly NO icons!) */}
                  <div className="flex justify-center gap-4 pt-4">
                    <button
                      onClick={() => handleRateCard("again")}
                      className="px-6 py-2.5 bg-zinc-900/80 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-md transition-all flex flex-col items-center gap-0.5 cursor-pointer border-none outline-none"
                    >
                      <span className="font-mono font-bold text-xs uppercase">AGAIN</span>
                      <span className="font-mono text-[10px] text-zinc-400">{againEstLabel}</span>
                    </button>

                    <button
                      onClick={() => handleRateCard("good")}
                      className="px-6 py-2.5 bg-zinc-900/80 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-md transition-all flex flex-col items-center gap-0.5 cursor-pointer border-none outline-none"
                    >
                      <span className="font-mono font-bold text-xs uppercase">GOOD</span>
                      <span className="font-mono text-[10px] text-zinc-400">{goodEstLabel}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center bg-zinc-900/50 rounded-lg">
              <p className="font-mono text-sm text-zinc-300 mb-4">
                ALL REVIEWS COMPLETED FOR TODAY!
              </p>
              <button
                onClick={() => {
                  setMode("deck_summary");
                  loadCards();
                }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-mono text-xs uppercase rounded-md transition-all border-none outline-none cursor-pointer"
              >
                BACK TO DECK
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
