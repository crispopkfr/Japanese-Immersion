import React, { useState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MangaDB } from "../db";
import { AnimeTracker } from "../types";

export const AnimeTrackerPanel: React.FC = () => {
  const [trackers, setTrackers] = useState<AnimeTracker[]>([]);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form fields
  const [nameInput, setNameInput] = useState<string>("");
  const [episodesInput, setEpisodesInput] = useState<string>("");
  const [backgroundInput, setBackgroundInput] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Expand state per tracker card ID
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  // Confirm delete ID
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadTrackers();
  }, []);

  const loadTrackers = async () => {
    try {
      const list = await MangaDB.getAnimeTrackers();
      setTrackers(list);
    } catch (err) {
      console.error("Failed to load anime trackers:", err);
    }
  };

  const handleOpenNewForm = () => {
    setNameInput("");
    setEpisodesInput("");
    setBackgroundInput("");
    setEditingId(null);
    setErrorMsg(null);
    setIsEditing(true);
  };

  const handleOpenEditForm = (tracker: AnimeTracker, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setNameInput(tracker.name);
    setEpisodesInput(String(tracker.totalEpisodes));
    setBackgroundInput(tracker.background || "");
    setEditingId(tracker.id);
    setErrorMsg(null);
    setIsEditing(true);
  };

  const handleCancelForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setNameInput("");
    setEpisodesInput("");
    setBackgroundInput("");
    setErrorMsg(null);
  };

  const handleSaveTracker = async () => {
    const trimmedName = nameInput.trim();
    const parsedEpisodes = parseInt(episodesInput, 10);

    if (!trimmedName) {
      setErrorMsg("Please enter an anime name.");
      return;
    }
    if (isNaN(parsedEpisodes) || parsedEpisodes < 1) {
      setErrorMsg("Please enter a valid number of episodes (at least 1).");
      return;
    }

    try {
      if (editingId) {
        const existing = trackers.find((t) => t.id === editingId);
        if (existing) {
          // Filter watched episodes if new total is less
          const updatedWatched = (existing.watchedEpisodes || []).filter(
            (ep) => ep <= parsedEpisodes
          );
          const updated: AnimeTracker = {
            ...existing,
            name: trimmedName,
            totalEpisodes: parsedEpisodes,
            watchedEpisodes: updatedWatched,
            background: backgroundInput || undefined,
          };
          await MangaDB.saveAnimeTracker(updated);
        }
      } else {
        const newTracker: AnimeTracker = {
          id: `tracker_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: trimmedName,
          totalEpisodes: parsedEpisodes,
          watchedEpisodes: [],
          createdAt: Date.now(),
          background: backgroundInput || undefined,
        };
        await MangaDB.saveAnimeTracker(newTracker);
        // Auto expand new tracker card
        setExpandedIds((prev) => ({ ...prev, [newTracker.id]: true }));
      }

      await loadTrackers();
      handleCancelForm();
    } catch (err) {
      console.error("Failed to save anime tracker:", err);
      setErrorMsg("Failed to save anime tracker.");
    }
  };

  const handleDeleteTracker = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await MangaDB.deleteAnimeTracker(id);
      setConfirmingDeleteId(null);
      await loadTrackers();
    } catch (err) {
      console.error("Failed to delete anime tracker:", err);
    }
  };

  const toggleExpandCard = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const toggleEpisodeWatched = async (tracker: AnimeTracker, epNum: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const isWatched = tracker.watchedEpisodes.includes(epNum);
    let newWatched: number[];
    if (isWatched) {
      newWatched = tracker.watchedEpisodes.filter((eNum) => eNum !== epNum);
    } else {
      newWatched = [...tracker.watchedEpisodes, epNum];
    }

    const updated: AnimeTracker = {
      ...tracker,
      watchedEpisodes: newWatched,
    };

    // Optimistic update
    setTrackers((prev) =>
      prev.map((t) => (t.id === tracker.id ? updated : t))
    );

    try {
      await MangaDB.saveAnimeTracker(updated);
    } catch (err) {
      console.error("Failed to update episode watched state:", err);
      await loadTrackers();
    }
  };

  return (
    <div className="bg-zinc-800 rounded-xl p-5 shadow-none text-zinc-300">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-400">
            Trackers {trackers.length}
          </span>
          <span className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-400">
            Episodes {trackers.reduce((acc, t) => acc + (t.watchedEpisodes?.length || 0), 0)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleOpenNewForm}
            className="p-2 bg-zinc-900/50 hover:bg-zinc-700/30 border-none outline-none text-zinc-400 hover:text-white rounded-full transition-all flex items-center justify-center shrink-0 cursor-pointer h-9 w-9"
            title="Create New Anime Tracker"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-2.5 mb-3 bg-red-950/50 border border-red-800/40 text-red-300 rounded text-xs font-mono">
          {errorMsg}
        </div>
      )}

      {/* Creation / Editing Form */}
      {isEditing && (
        <div className="mb-4 space-y-2">
          <div className="w-full p-3 rounded-md bg-zinc-900/50 text-zinc-300 flex flex-col gap-1 border-none outline-none">
            <label className="text-[11px] font-mono font-bold text-zinc-400">
              NAME
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="w-full bg-transparent text-xs text-zinc-200 font-sans border-none outline-none focus:outline-none focus:ring-0 transition-colors"
            />
          </div>

          <div className="w-full p-3 rounded-md bg-zinc-900/50 text-zinc-300 flex flex-col gap-1 border-none outline-none">
            <label className="text-[11px] font-mono font-bold text-zinc-400">
              EPISODES
            </label>
            <input
              type="number"
              min={1}
              value={episodesInput}
              onChange={(e) => setEpisodesInput(e.target.value)}
              className="w-full bg-transparent text-xs text-zinc-200 font-sans border-none outline-none focus:outline-none focus:ring-0 transition-colors"
            />
          </div>

          <div
            onClick={() => {
              if (backgroundInput) {
                setBackgroundInput("");
              } else {
                fileInputRef.current?.click();
              }
            }}
            className="w-full text-left p-3 rounded-md bg-zinc-900/50 hover:bg-zinc-900 text-zinc-300 transition-all flex flex-col gap-1 border-none outline-none relative overflow-hidden cursor-pointer"
          >
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  // Direct lossless read for files <= 12MB to keep 100% original full resolution
                  if (file.size <= 12 * 1024 * 1024) {
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === "string") setBackgroundInput(reader.result);
                    };
                    reader.readAsDataURL(file);
                  } else {
                    const objectUrl = URL.createObjectURL(file);
                    const img = new Image();
                    img.onload = () => {
                      URL.revokeObjectURL(objectUrl);
                      const MAX_W = 3840;
                      const MAX_H = 2160;
                      let w = img.width;
                      let h = img.height;
                      if (w > MAX_W || h > MAX_H) {
                        if (w / h > MAX_W / MAX_H) {
                          h = Math.round((h * MAX_W) / w);
                          w = MAX_W;
                        } else {
                          w = Math.round((w * MAX_H) / h);
                          h = MAX_H;
                        }
                      }
                      const canvas = document.createElement("canvas");
                      canvas.width = w;
                      canvas.height = h;
                      const ctx = canvas.getContext("2d");
                      if (ctx) {
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = "high";
                        ctx.drawImage(img, 0, 0, w, h);
                        setBackgroundInput(canvas.toDataURL("image/jpeg", 0.95));
                      } else {
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === "string") setBackgroundInput(reader.result);
                        };
                        reader.readAsDataURL(file);
                      }
                    };
                    img.onerror = () => {
                      URL.revokeObjectURL(objectUrl);
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === "string") setBackgroundInput(reader.result);
                      };
                      reader.readAsDataURL(file);
                    };
                    img.src = objectUrl;
                  }
                }
                e.target.value = "";
              }}
            />

            {/* Live background preview inside the card if set */}
            {backgroundInput && (
              <div className="absolute inset-0 pointer-events-none z-0 opacity-100 overflow-hidden">
                <img
                  src={backgroundInput}
                  alt=""
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40" />
              </div>
            )}

            <div className="flex items-center justify-between gap-3 w-full relative z-10">
              <label className="text-[11px] font-mono font-bold text-zinc-400 cursor-pointer">
                BACKGROUND
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={handleCancelForm}
              className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
            >
              <span>CANCEL</span>
            </button>
            <button
              onClick={handleSaveTracker}
              className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
            >
              <span>SAVE</span>
            </button>
          </div>
        </div>
      )}

      {/* Trackers List */}
      {trackers.length === 0 && !isEditing ? null : (
        <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
          {trackers.map((tracker) => {
            const watchedCount = tracker.watchedEpisodes?.length || 0;
            const totalCount = tracker.totalEpisodes || 0;
            const isCompleted = totalCount > 0 && watchedCount >= totalCount;
            const isExpanded = !!expandedIds[tracker.id];
            const isConfirming = confirmingDeleteId === tracker.id;
            const hasBackground = !!tracker.background;

            return (
              <div
                key={tracker.id}
                onClick={(e) => toggleExpandCard(tracker.id, e)}
                className={`w-full text-left p-3 rounded-md text-zinc-300 transition-all flex flex-col gap-2 border-none outline-none relative overflow-hidden cursor-pointer ${
                  isExpanded ? "relative z-40 bg-zinc-900 shadow-xl" : "bg-zinc-900"
                } ${
                  isCompleted ? "opacity-60" : ""
                }`}
              >
                {/* Background image when present: pre-rendered in DOM with smooth opacity transition */}
                {tracker.background && (
                  <div
                    className={`absolute inset-0 pointer-events-none z-0 transition-opacity duration-700 ease-in-out ${
                      isExpanded ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <img
                      src={tracker.background}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70 pointer-events-none" />
                  </div>
                )}

                {/* Main Card Row Header */}
                <div className="flex items-center justify-between gap-3 w-full relative z-10">
                  <div className="flex-1 min-w-0 pr-2 flex flex-col gap-0.5">
                    <p className={`text-sm font-sans font-semibold leading-relaxed truncate ${
                      isExpanded ? "text-white drop-shadow-md" : "text-zinc-400"
                    }`}>
                      {tracker.name}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {!isConfirming ? (
                      <>
                        <button
                          onClick={(e) => handleOpenEditForm(tracker, e)}
                          className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
                        >
                          <span>EDIT</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmingDeleteId(tracker.id);
                          }}
                          className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
                        >
                          <span>DELETE</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={(e) => handleDeleteTracker(tracker.id, e)}
                          className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
                        >
                          <span>YES</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmingDeleteId(null);
                          }}
                          className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
                        >
                          <span>NO</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Progress bar on bottom edge when not expanded */}
                {!isExpanded && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-950 overflow-hidden">
                    <div
                      className="h-full bg-zinc-400 transition-all duration-300 tracking-progress-bar-fill"
                      style={{
                        width: `${
                          totalCount > 0
                            ? Math.min(100, Math.round((watchedCount / totalCount) * 100))
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                )}

                {/* Expanded Episodes Grid */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1.0] }}
                      className="overflow-hidden pt-2 flex flex-col gap-2 w-full cursor-default relative z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex flex-wrap gap-2 max-h-[250px] overflow-y-auto pr-1">
                        {Array.from({ length: tracker.totalEpisodes }, (_, i) => i + 1).map((epNum) => {
                          const isWatched = tracker.watchedEpisodes.includes(epNum);
                          const fontSizeClass = epNum >= 1000 ? "text-[8px]" : epNum >= 100 ? "text-[10px]" : "text-xs";

                          return (
                            <button
                              key={epNum}
                              onClick={(e) => toggleEpisodeWatched(tracker, epNum, e)}
                              className={`w-9 h-9 rounded-full shrink-0 font-mono font-bold ${fontSizeClass} leading-none transition-all flex items-center justify-center cursor-pointer outline-none select-none ${
                                isWatched
                                  ? "bg-zinc-950/20 hover:bg-zinc-950/40 text-zinc-500 hover:text-zinc-400"
                                  : "bg-zinc-950/60 hover:bg-zinc-950/80 text-zinc-200 hover:text-white"
                              }`}
                              title={`Episode ${epNum} - ${isWatched ? "Watched" : "Unwatched"}`}
                            >
                              <span>{epNum}</span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
