import React, { useState, useEffect, useRef } from "react";
import { Check, RefreshCw, Video, Image as ImageIcon, Volume2, VolumeX, Play, Pause, Trash2, Link as LinkIcon } from "lucide-react";
import { MangaDB } from "../db";
import { saveMedia, getMedia, getMediaAsync, deleteMedia, getAllMediaAsync } from "../mediaStore";

export const SettingsPanel: React.FC = () => {
  // State for Import / Export status
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Background state
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgType, setBgType] = useState<"image" | "video">("image");
  const [bgOpacity, setBgOpacity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("subminer_site_background_opacity");
      return saved ? parseFloat(saved) : 0.15;
    } catch (e) {
      return 0.15;
    }
  });
  const [bgMuted, setBgMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem("subminer_site_background_muted") !== "false";
    } catch (e) {
      return true;
    }
  });
  const [bgPaused, setBgPaused] = useState<boolean>(() => {
    try {
      return localStorage.getItem("subminer_site_background_paused") === "true";
    } catch (e) {
      return false;
    }
  });

  const [urlInput, setUrlInput] = useState<string>("");
  const [showUrlInput, setShowUrlInput] = useState<boolean>(false);

  // Font scale state
  const [fontScale, setFontScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("subminer_global_font_scale");
      return saved ? parseFloat(saved) : 1;
    } catch (e) {
      return 1;
    }
  });

  // Screen content opacity state
  const [screenContentOpacity, setScreenContentOpacity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("subminer_screen_content_opacity");
      return saved !== null ? parseFloat(saved) : 1;
    } catch (e) {
      return 1;
    }
  });

  // Subtitle size state
  const [subScale, setSubScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("subminer_sub_scale");
      return saved ? parseFloat(saved) : 1;
    } catch (e) {
      return 1;
    }
  });

  // Subtitle enabled state
  const [subsEnabled, setSubsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem("subminer_subs_enabled") !== "false";
    } catch (e) {
      return true;
    }
  });

  const handleToggleSubsEnabled = () => {
    const nextVal = !subsEnabled;
    setSubsEnabled(nextVal);
    try {
      localStorage.setItem("subminer_subs_enabled", String(nextVal));
      window.dispatchEvent(new Event("site-background-updated"));
      window.dispatchEvent(new Event("subminer-subs-enabled-updated"));
      window.dispatchEvent(new Event("subminer-debug-subs"));
    } catch (e) {}
  };

  // Subtitle height state
  const [subHeightFactor, setSubHeightFactor] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("subminer_sub_height_factor");
      return saved ? parseFloat(saved) : 1;
    } catch (e) {
      return 1;
    }
  });

  // Subtitle word spacing state
  const [subWordSpacing, setSubWordSpacing] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("subminer_sub_word_spacing");
      return saved ? parseFloat(saved) : 1;
    } catch (e) {
      return 1;
    }
  });

  // Subtitle background blur/opacity state
  const [subBlur, setSubBlur] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("subminer_sub_blur");
      return saved ? parseFloat(saved) : 0;
    } catch (e) {
      return 0;
    }
  });

  // Subtitle stroke thickness state
  const [subStroke, setSubStroke] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("subminer_sub_stroke");
      return saved !== null ? parseFloat(saved) : 2;
    } catch (e) {
      return 2;
    }
  });

  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const syncBg = async () => {
    let currentType: "image" | "video" = "image";
    try {
      currentType = (localStorage.getItem("subminer_site_background_type") as "image" | "video") || "image";
    } catch (e) {}

    let currentBg: string | undefined;
    if (currentType === "video") {
      currentBg = await getMediaAsync("site_background_video");
    }
    if (!currentBg) {
      currentBg = await getMediaAsync("site_background.jpg");
      if (currentBg) currentType = "image";
    }
    if (!currentBg) {
      try {
        const stored = localStorage.getItem("subminer_site_background");
        if (stored) {
          currentBg = stored;
          if (stored.startsWith("data:video/") || stored.includes("video") || stored.endsWith(".mp4") || stored.endsWith(".webm") || stored.endsWith(".mkv")) {
            currentType = "video";
          }
        }
      } catch (e) {}
    }

    setBgImage(currentBg || null);
    setBgType(currentType);

    try {
      const savedOp = localStorage.getItem("subminer_site_background_opacity");
      if (savedOp) setBgOpacity(parseFloat(savedOp));
      const savedMuted = localStorage.getItem("subminer_site_background_muted");
      if (savedMuted !== null) setBgMuted(savedMuted !== "false");
      const savedPaused = localStorage.getItem("subminer_site_background_paused");
      if (savedPaused !== null) setBgPaused(savedPaused === "true");
      const savedContentOp = localStorage.getItem("subminer_screen_content_opacity");
      if (savedContentOp !== null) setScreenContentOpacity(parseFloat(savedContentOp));
      const savedFontScale = localStorage.getItem("subminer_global_font_scale");
      if (savedFontScale) setFontScale(parseFloat(savedFontScale));
      const savedSubScale = localStorage.getItem("subminer_sub_scale");
      if (savedSubScale) setSubScale(parseFloat(savedSubScale));
      const savedSubHeight = localStorage.getItem("subminer_sub_height_factor");
      if (savedSubHeight) setSubHeightFactor(parseFloat(savedSubHeight));
      const savedSubWordSpacing = localStorage.getItem("subminer_sub_word_spacing");
      if (savedSubWordSpacing) setSubWordSpacing(parseFloat(savedSubWordSpacing));
      const savedSubBlur = localStorage.getItem("subminer_sub_blur");
      if (savedSubBlur) setSubBlur(parseFloat(savedSubBlur));
      const savedSubStroke = localStorage.getItem("subminer_sub_stroke");
      if (savedSubStroke !== null) setSubStroke(parseFloat(savedSubStroke));
    } catch (e) {}
  };

  useEffect(() => {
    syncBg();
    window.addEventListener("site-background-updated", syncBg);
    return () => window.removeEventListener("site-background-updated", syncBg);
  }, []);

  const updateVideoBackground = (fileOrUrl: File | string) => {
    if (typeof fileOrUrl === "string") {
      try {
        localStorage.setItem("subminer_site_background", fileOrUrl);
        localStorage.setItem("subminer_site_background_type", "video");
      } catch (e) {}
      saveMedia("site_background_video", fileOrUrl);
      setBgImage(fileOrUrl);
    } else {
      try {
        localStorage.setItem("subminer_site_background", fileOrUrl.name);
        localStorage.setItem("subminer_site_background_type", "video");
      } catch (e) {}
      saveMedia("site_background_video", fileOrUrl);
      const objectUrl = URL.createObjectURL(fileOrUrl);
      setBgImage(objectUrl);
    }
    deleteMedia("site_background.jpg");
    setBgType("video");
    window.dispatchEvent(new Event("site-background-updated"));
  };

  const updateImageBackground = (dataUrl: string) => {
    try {
      localStorage.setItem("subminer_site_background", dataUrl);
      localStorage.setItem("subminer_site_background_type", "image");
    } catch (e) {}
    saveMedia("site_background.jpg", dataUrl);
    deleteMedia("site_background_video");
    setBgImage(dataUrl);
    setBgType("image");
    window.dispatchEvent(new Event("site-background-updated"));
  };

  const clearBackground = () => {
    try {
      localStorage.removeItem("subminer_site_background");
      localStorage.removeItem("subminer_site_background_type");
    } catch (e) {}
    deleteMedia("site_background.jpg");
    deleteMedia("site_background_video");
    setBgImage(null);
    window.dispatchEvent(new Event("site-background-updated"));
  };

  const handleOpacityChange = (newOp: number) => {
    setBgOpacity(newOp);
    try {
      localStorage.setItem("subminer_site_background_opacity", String(newOp));
    } catch (e) {}
    window.dispatchEvent(new Event("site-background-updated"));
  };

  const handleMutedToggle = () => {
    const newMuted = !bgMuted;
    setBgMuted(newMuted);
    try {
      localStorage.setItem("subminer_site_background_muted", String(newMuted));
    } catch (e) {}
    window.dispatchEvent(new Event("site-background-updated"));
  };

  const handlePausedToggle = () => {
    const newPaused = !bgPaused;
    setBgPaused(newPaused);
    try {
      localStorage.setItem("subminer_site_background_paused", String(newPaused));
    } catch (e) {}
    window.dispatchEvent(new Event("site-background-updated"));
  };

  const handleFontScaleChange = (newScale: number) => {
    setFontScale(newScale);
    try {
      localStorage.setItem("subminer_global_font_scale", String(newScale));
    } catch (e) {}
    document.documentElement.style.fontSize = `${newScale * 100}%`;
    window.dispatchEvent(new Event("site-background-updated"));
  };

  const handleScreenContentOpacityChange = (newOp: number) => {
    setScreenContentOpacity(newOp);
    try {
      localStorage.setItem("subminer_screen_content_opacity", String(newOp));
    } catch (e) {}
    window.dispatchEvent(new Event("site-background-updated"));
  };

  const handleSubScaleChange = (newVal: number) => {
    setSubScale(newVal);
    try {
      localStorage.setItem("subminer_sub_scale", String(newVal));
    } catch (e) {}
    window.dispatchEvent(new Event("site-background-updated"));
  };

  const handleSubHeightFactorChange = (newVal: number) => {
    setSubHeightFactor(newVal);
    try {
      localStorage.setItem("subminer_sub_height_factor", String(newVal));
    } catch (e) {}
    window.dispatchEvent(new Event("site-background-updated"));
  };

  const handleSubWordSpacingChange = (newVal: number) => {
    setSubWordSpacing(newVal);
    try {
      localStorage.setItem("subminer_sub_word_spacing", String(newVal));
    } catch (e) {}
    window.dispatchEvent(new Event("site-background-updated"));
  };

  const handleSubBlurChange = (newVal: number) => {
    setSubBlur(newVal);
    try {
      localStorage.setItem("subminer_sub_blur", String(newVal));
    } catch (e) {}
    window.dispatchEvent(new Event("site-background-updated"));
  };

  const handleSubStrokeChange = (newVal: number) => {
    setSubStroke(newVal);
    try {
      localStorage.setItem("subminer_sub_stroke", String(newVal));
    } catch (e) {}
    window.dispatchEvent(new Event("site-background-updated"));
  };

  const handleBgFileUpload = (file: File) => {
    const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mkv|mov|avi|ogv)$/i.test(file.name);
    if (isVideo) {
      updateVideoBackground(file);
      return;
    }

    if (file.type.startsWith("image/")) {
      // Direct lossless read for files <= 12MB to keep 100% original full resolution
      if (file.size <= 12 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          if (result) updateImageBackground(result);
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
            const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
            updateImageBackground(dataUrl);
          } else {
            const reader = new FileReader();
            reader.onload = (e) => {
              const result = e.target?.result as string;
              if (result) updateImageBackground(result);
            };
            reader.readAsDataURL(file);
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = e.target?.result as string;
            if (result) updateImageBackground(result);
          };
          reader.readAsDataURL(file);
        };
        img.src = objectUrl;
      }
    }
  };

  const handleUrlImportSubmit = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    const isVideo = /\.(mp4|webm|mkv|mov|avi|ogv)(\?.*)?$/i.test(trimmed) || trimmed.includes("video");
    if (isVideo) {
      updateVideoBackground(trimmed);
    } else {
      updateImageBackground(trimmed);
    }
    setUrlInput("");
    setShowUrlInput(false);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const [animeTrackers, createdCards, cardTemplates, chapters, pages, entries, dictionaries, mediaMap] =
        await Promise.all([
          MangaDB.getAnimeTrackers().catch(() => []),
          MangaDB.getCreatedCards().catch(() => []),
          MangaDB.getCardTemplates().catch(() => []),
          MangaDB.getChapters().catch(() => []),
          MangaDB.getAllPages().catch(() => []),
          MangaDB.getAllEntries().catch(() => []),
          MangaDB.getDictionaries().catch(() => []),
          getAllMediaAsync().catch(() => ({})),
        ]);

      let watchStats = {};
      try {
        const storedStats = localStorage.getItem("subminer_watch_stats_v1") || localStorage.getItem("subminer_watch_stats");
        if (storedStats) watchStats = JSON.parse(storedStats);
      } catch (e) {}

      let cachedVideos = [];
      try {
        const storedVideos = localStorage.getItem("subminer_cached_videos");
        if (storedVideos) cachedVideos = JSON.parse(storedVideos);
      } catch (e) {}

      let favoriteSubtitles = [];
      try {
        const storedFavs = localStorage.getItem("subminer_favorite_subtitles");
        if (storedFavs) favoriteSubtitles = JSON.parse(storedFavs);
      } catch (e) {}

      const fontScale = localStorage.getItem("subminer_global_font_scale") || "1";
      const siteBg = localStorage.getItem("subminer_site_background") || null;
      const siteBgType = localStorage.getItem("subminer_site_background_type") || "image";
      const siteBgOp = localStorage.getItem("subminer_site_background_opacity") || "0.15";
      const siteBgMutedStr = localStorage.getItem("subminer_site_background_muted") || "true";
      const siteBgPausedStr = localStorage.getItem("subminer_site_background_paused") || "false";
      const screenContentOp = localStorage.getItem("subminer_screen_content_opacity") || "1";
      const subScale = localStorage.getItem("subminer_sub_scale") || "1";
      const subsEnabledStr = localStorage.getItem("subminer_subs_enabled") || "true";
      const subHeightFactor = localStorage.getItem("subminer_sub_height_factor") || "1";
      const subWordSpacing = localStorage.getItem("subminer_sub_word_spacing") || "1";
      const subBlur = localStorage.getItem("subminer_sub_blur") || "0";
      const subStroke = localStorage.getItem("subminer_sub_stroke") || "2";
      const subDelay = localStorage.getItem("subminer_sub_delay") || "0";
      const telegramToken = localStorage.getItem("subminer_telegram_token") || "";
      const telegramChatId = localStorage.getItem("subminer_telegram_chat_id") || "";
      const lastUsedSubs = localStorage.getItem("subminer_last_used_subs_v1") || "";

      const backupData = {
        subminerBackupVersion: 2,
        exportedAt: new Date().toISOString(),
        watchStats,
        watch_stats: watchStats,
        cachedVideos,
        favoriteSubtitles,
        fontScale,
        siteBackground: siteBg,
        siteBackgroundType: siteBgType,
        siteBackgroundOpacity: parseFloat(siteBgOp),
        siteBackgroundMuted: siteBgMutedStr !== "false",
        siteBackgroundPaused: siteBgPausedStr === "true",
        screenContentOpacity: parseFloat(screenContentOp),
        subScale: parseFloat(subScale),
        subsEnabled: subsEnabledStr !== "false",
        subHeightFactor: parseFloat(subHeightFactor),
        subWordSpacing: parseFloat(subWordSpacing),
        subBlur: parseFloat(subBlur),
        subStroke: parseFloat(subStroke),
        subDelay: parseFloat(subDelay),
        telegramToken,
        telegramChatId,
        lastUsedSubs,
        animeTrackers,
        createdCards,
        cardTemplates,
        chapters,
        pages,
        entries,
        dictionaries,
        media: mediaMap,
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const dateStr = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subminer-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export site data:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = async (file: File) => {
    if (!file.name.endsWith(".json")) {
      return;
    }

    setIsImporting(true);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // 1. Restore watchStats
      const importedWatchStats = data.watchStats || data.watch_stats || data.watchStatsV1 || data.stats;
      if (importedWatchStats && typeof importedWatchStats === "object") {
        const jsonStats = JSON.stringify(importedWatchStats);
        localStorage.setItem("subminer_watch_stats_v1", jsonStats);
        localStorage.setItem("subminer_watch_stats", jsonStats);
      }

      // 2. Restore cachedVideos
      if (Array.isArray(data.cachedVideos)) {
        localStorage.setItem("subminer_cached_videos", JSON.stringify(data.cachedVideos));
      }

      if (Array.isArray(data.favoriteSubtitles)) {
        localStorage.setItem("subminer_favorite_subtitles", JSON.stringify(data.favoriteSubtitles));
      }

      if (data.lastUsedSubs) {
        localStorage.setItem("subminer_last_used_subs_v1", typeof data.lastUsedSubs === "string" ? data.lastUsedSubs : JSON.stringify(data.lastUsedSubs));
      }

      if (data.subDelay !== undefined) {
        localStorage.setItem("subminer_sub_delay", String(data.subDelay));
      }

      // 3. Restore fontScale
      if (data.fontScale !== undefined) {
        localStorage.setItem("subminer_global_font_scale", String(data.fontScale));
        document.documentElement.style.fontSize = `${parseFloat(data.fontScale) * 100}%`;
      }

      // 4. Restore site background
      if (data.siteBackground !== undefined) {
        if (data.siteBackground) {
          localStorage.setItem("subminer_site_background", data.siteBackground);
        } else {
          localStorage.removeItem("subminer_site_background");
        }
      }
      if (data.siteBackgroundType) {
        localStorage.setItem("subminer_site_background_type", data.siteBackgroundType);
      }
      if (data.siteBackgroundOpacity !== undefined) {
        localStorage.setItem("subminer_site_background_opacity", String(data.siteBackgroundOpacity));
      }
      if (data.siteBackgroundMuted !== undefined) {
        localStorage.setItem("subminer_site_background_muted", String(data.siteBackgroundMuted));
      }
      if (data.siteBackgroundPaused !== undefined) {
        localStorage.setItem("subminer_site_background_paused", String(data.siteBackgroundPaused));
      }
      if (data.screenContentOpacity !== undefined) {
        localStorage.setItem("subminer_screen_content_opacity", String(data.screenContentOpacity));
      }
      if (data.subScale !== undefined) {
        localStorage.setItem("subminer_sub_scale", String(data.subScale));
      }
      if (data.subsEnabled !== undefined) {
        localStorage.setItem("subminer_subs_enabled", String(data.subsEnabled));
      }
      if (data.subHeightFactor !== undefined) {
        localStorage.setItem("subminer_sub_height_factor", String(data.subHeightFactor));
      }
      if (data.subWordSpacing !== undefined) {
        localStorage.setItem("subminer_sub_word_spacing", String(data.subWordSpacing));
      }
      if (data.subBlur !== undefined) {
        localStorage.setItem("subminer_sub_blur", String(data.subBlur));
      }
      if (data.subStroke !== undefined) {
        localStorage.setItem("subminer_sub_stroke", String(data.subStroke));
      }
      if (data.telegramToken !== undefined) {
        localStorage.setItem("subminer_telegram_token", String(data.telegramToken));
      }
      if (data.telegramChatId !== undefined) {
        localStorage.setItem("subminer_telegram_chat_id", String(data.telegramChatId));
      }
      window.dispatchEvent(new Event("site-background-updated"));
      window.dispatchEvent(new Event("subminer_watch_stats_updated"));
      window.dispatchEvent(new Event("storage"));

      // 5. Restore anime trackers
      if (Array.isArray(data.animeTrackers)) {
        for (const item of data.animeTrackers) {
          if (item && item.id) {
            await MangaDB.saveAnimeTracker(item);
          }
        }
      }

      // 6. Restore created cards
      if (Array.isArray(data.createdCards)) {
        for (const item of data.createdCards) {
          if (item && item.id) {
            await MangaDB.saveCreatedCard(item);
          }
        }
      }

      // 7. Restore card templates
      if (Array.isArray(data.cardTemplates)) {
        for (const item of data.cardTemplates) {
          if (item && item.id) {
            await MangaDB.saveCardTemplate(item);
          }
        }
      }

      // 8. Restore chapters
      if (Array.isArray(data.chapters)) {
        for (const item of data.chapters) {
          if (item && item.id) {
            await MangaDB.saveChapter(item);
          }
        }
      }

      // 9. Restore manga pages
      if (Array.isArray(data.pages)) {
        for (const item of data.pages) {
          if (item && (item.id || (item.chapterId && item.pageNumber !== undefined))) {
            await MangaDB.savePage(item);
          }
        }
      }

      // 10. Restore dialogue entries
      if (Array.isArray(data.entries)) {
        for (const item of data.entries) {
          if (item && item.id && item.chapterId) {
            await MangaDB.saveEntry(item);
          }
        }
      }

      // 11. Restore dictionaries metadata if present
      if (Array.isArray(data.dictionaries)) {
        for (const item of data.dictionaries) {
          if (item && item.id) {
            await MangaDB.saveDictionary(item);
          }
        }
      }

      // 12. Restore media files
      if (data.media && typeof data.media === "object") {
        for (const [filename, dataUrl] of Object.entries(data.media)) {
          if (typeof dataUrl === "string") {
            saveMedia(filename, dataUrl);
          }
        }
      }

      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      console.error("Import failed:", err);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="bg-zinc-800 rounded-xl p-5 shadow-none text-zinc-300">
      {/* Cards List: Import, Export, Font Size, Background */}
      <div className="space-y-3">

        {/* CARD 1: RESTORE */}
        <div
          onClick={() => {
            if (!isImporting) importFileInputRef.current?.click();
          }}
          className="w-full text-left p-4 rounded-md bg-zinc-900/50 hover:bg-zinc-900 text-zinc-300 transition-all flex flex-col gap-3 border-none outline-none relative overflow-hidden cursor-pointer"
        >
          <input
            type="file"
            ref={importFileInputRef}
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = "";
            }}
          />
          <div className="flex items-center justify-between gap-3 w-full">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <p className="text-sm font-sans font-semibold leading-relaxed text-zinc-300">
                RESTORE
              </p>
              {isImporting && (
                <span className="flex items-center gap-1.5 text-xs font-mono font-bold text-zinc-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  RESTORING...
                </span>
              )}
            </div>
          </div>
        </div>

        {/* CARD 2: EXPORT */}
        <div
          onClick={() => {
            if (!isExporting) handleExport();
          }}
          className="w-full text-left p-4 rounded-md bg-zinc-900/50 hover:bg-zinc-900 text-zinc-300 transition-all flex flex-col gap-3 border-none outline-none relative overflow-hidden cursor-pointer"
        >
          <div className="flex items-center justify-between gap-3 w-full">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <p className="text-sm font-sans font-semibold leading-relaxed text-zinc-300">
                EXPORT
              </p>
              {isExporting && (
                <span className="flex items-center gap-1.5 text-xs font-mono font-bold text-zinc-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  EXPORTING...
                </span>
              )}
            </div>
          </div>
        </div>

        {/* CARD: INTERFACE */}
        <div className="w-full text-left p-4 rounded-md bg-zinc-900/50 text-zinc-300 transition-all flex flex-col gap-3 border-none outline-none relative overflow-hidden">
          <div className="flex items-center justify-between gap-3 w-full relative z-10">
            <p className="text-sm font-sans font-semibold leading-relaxed text-zinc-300">
              INTERFACE
            </p>
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            className="-mx-4 -mb-4 mt-1 bg-zinc-950/60 flex flex-col py-1 relative z-10 outline-none border-none"
          >
            {/* Size Slider */}
            <div className="px-4 py-3 flex items-center gap-3">
              <span className="w-32 text-sm font-sans font-semibold text-zinc-400 uppercase shrink-0 select-none">
                SIZE {Math.round(fontScale * 100)}%
              </span>
              <input
                type="range"
                min="0.50"
                max="1.50"
                step="0.01"
                value={fontScale}
                onChange={(e) => handleFontScaleChange(parseFloat(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #d4d4d8 0%, #d4d4d8 ${((fontScale - 0.50) / 1.00) * 100}%, #27272a ${((fontScale - 0.50) / 1.00) * 100}%, #27272a 100%)`
                }}
                className="w-full cursor-pointer h-1.5 custom-range outline-none focus:outline-none focus:ring-0 border-none shadow-none ring-0"
              />
            </div>

            {/* Opacity Slider */}
            <div className="px-4 py-3 flex items-center gap-3">
              <span className="w-32 text-sm font-sans font-semibold text-zinc-400 uppercase shrink-0 select-none">
                OPACITY {Math.round(screenContentOpacity * 100)}%
              </span>
              <input
                type="range"
                min="0.10"
                max="1.00"
                step="0.01"
                value={screenContentOpacity}
                onChange={(e) => handleScreenContentOpacityChange(parseFloat(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #d4d4d8 0%, #d4d4d8 ${((screenContentOpacity - 0.10) / 0.90) * 100}%, #27272a ${((screenContentOpacity - 0.10) / 0.90) * 100}%, #27272a 100%)`
                }}
                className="w-full cursor-pointer h-1.5 custom-range outline-none focus:outline-none focus:ring-0 border-none shadow-none ring-0"
              />
            </div>
          </div>
        </div>

        {/* CARD: SUBTITLES */}
        <div className="w-full text-left p-4 rounded-md bg-zinc-900/50 text-zinc-300 transition-all flex flex-col gap-3 border-none outline-none relative overflow-hidden">
          <div className="flex items-center justify-between gap-3 w-full relative z-10">
            <p className="text-sm font-sans font-semibold leading-relaxed text-zinc-300">
              SUBTITLES
            </p>
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            className="-mx-4 -mb-4 mt-1 bg-zinc-950/60 flex flex-col py-1 relative z-10 outline-none border-none"
          >
            {/* Size Slider */}
            <div className="px-4 py-3 flex items-center gap-3">
              <span className="w-32 text-sm font-sans font-semibold text-zinc-400 uppercase shrink-0 select-none">
                SIZE {Math.round(subScale * 100)}%
              </span>
              <input
                type="range"
                min="0.50"
                max="2.50"
                step="0.01"
                value={subScale}
                onChange={(e) => handleSubScaleChange(parseFloat(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #d4d4d8 0%, #d4d4d8 ${((subScale - 0.50) / 2.00) * 100}%, #27272a ${((subScale - 0.50) / 2.00) * 100}%, #27272a 100%)`
                }}
                className="w-full cursor-pointer h-1.5 custom-range outline-none focus:outline-none focus:ring-0 border-none shadow-none ring-0"
              />
              <button
                type="button"
                onClick={handleToggleSubsEnabled}
                className="text-sm font-sans font-semibold text-zinc-400 uppercase shrink-0 select-none cursor-pointer hover:text-zinc-200 transition-colors w-10 text-center"
              >
                {subsEnabled ? "ON" : "OFF"}
              </button>
            </div>

            {/* Word Spacing Slider */}
            <div className="px-4 py-3 flex items-center gap-3">
              <span className="w-32 text-sm font-sans font-semibold text-zinc-400 uppercase shrink-0 select-none">
                SPACING {Math.round(subWordSpacing * 100)}%
              </span>
              <input
                type="range"
                min="0.00"
                max="3.00"
                step="0.01"
                value={subWordSpacing}
                onChange={(e) => handleSubWordSpacingChange(parseFloat(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #d4d4d8 0%, #d4d4d8 ${(subWordSpacing / 3.00) * 100}%, #27272a ${(subWordSpacing / 3.00) * 100}%, #27272a 100%)`
                }}
                className="w-full cursor-pointer h-1.5 custom-range outline-none focus:outline-none focus:ring-0 border-none shadow-none ring-0"
              />
            </div>

            {/* Height Slider */}
            <div className="px-4 py-3 flex items-center gap-3">
              <span className="w-32 text-sm font-sans font-semibold text-zinc-400 uppercase shrink-0 select-none">
                HEIGHT {Math.round(subHeightFactor * 100)}%
              </span>
              <input
                type="range"
                min="0.50"
                max="3.00"
                step="0.01"
                value={subHeightFactor}
                onChange={(e) => handleSubHeightFactorChange(parseFloat(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #d4d4d8 0%, #d4d4d8 ${((subHeightFactor - 0.50) / 2.50) * 100}%, #27272a ${((subHeightFactor - 0.50) / 2.50) * 100}%, #27272a 100%)`
                }}
                className="w-full cursor-pointer h-1.5 custom-range outline-none focus:outline-none focus:ring-0 border-none shadow-none ring-0"
              />
            </div>

            {/* Stroke Slider */}
            <div className="px-4 py-3 flex items-center gap-3">
              <span className="w-32 text-sm font-sans font-semibold text-zinc-400 uppercase shrink-0 select-none">
                STROKE {Math.round((subStroke / 5) * 100)}%
              </span>
              <input
                type="range"
                min="0"
                max="2.5"
                step="0.1"
                value={Math.min(2.5, subStroke)}
                onChange={(e) => handleSubStrokeChange(parseFloat(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #d4d4d8 0%, #d4d4d8 ${(Math.min(2.5, subStroke) / 2.5) * 100}%, #27272a ${(Math.min(2.5, subStroke) / 2.5) * 100}%, #27272a 100%)`
                }}
                className="w-full cursor-pointer h-1.5 custom-range outline-none focus:outline-none focus:ring-0 border-none shadow-none ring-0"
              />
            </div>

            {/* Background Slider */}
            <div className="px-4 py-3 flex items-center gap-3">
              <span className="w-32 text-sm font-sans font-semibold text-zinc-400 uppercase shrink-0 select-none">
                BACKGROUND {Math.round((subBlur / 10) * 100)}%
              </span>
              <input
                type="range"
                min="0"
                max="10"
                step="0.1"
                value={subBlur}
                onChange={(e) => handleSubBlurChange(parseFloat(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #d4d4d8 0%, #d4d4d8 ${(subBlur / 10) * 100}%, #27272a ${(subBlur / 10) * 100}%, #27272a 100%)`
                }}
                className="w-full cursor-pointer h-1.5 custom-range outline-none focus:outline-none focus:ring-0 border-none shadow-none ring-0"
              />
            </div>
          </div>
        </div>

        {/* CARD 4: BACKGROUND */}
        <div
          onClick={() => {
            if (bgImage) {
              clearBackground();
            } else {
              bgFileInputRef.current?.click();
            }
          }}
          className="w-full text-left p-4 rounded-md bg-zinc-900/50 hover:bg-zinc-900 text-zinc-300 transition-all flex flex-col gap-3 border-none outline-none relative overflow-hidden cursor-pointer"
        >
          <input
            type="file"
            ref={bgFileInputRef}
            accept="image/*,video/*,.mp4,.webm,.mkv,.mov"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleBgFileUpload(file);
              e.target.value = "";
            }}
          />

          {/* Live background preview inside the card if set */}
          {bgImage && (
            bgType === "video" ? (
              <video
                src={bgImage}
                autoPlay
                loop
                muted={bgMuted}
                playsInline
                className="absolute inset-0 w-full h-full object-cover pointer-events-none z-0 opacity-100"
              />
            ) : (
              <div
                className="absolute inset-0 bg-cover bg-center pointer-events-none z-0 opacity-100"
                style={{
                  backgroundImage: `url("${bgImage}")`,
                }}
              />
            )
          )}

          <div className="flex items-center justify-between gap-3 w-full relative z-10">
            <p className="text-sm font-sans font-semibold leading-relaxed text-zinc-300">
              BACKGROUND
            </p>
          </div>

          {bgImage && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="-mx-4 -mb-4 mt-1 px-4 py-3 bg-zinc-950/60 flex items-center gap-3 relative z-10 outline-none border-none"
            >
              <span className="w-32 text-sm font-sans font-semibold text-zinc-400 uppercase shrink-0 select-none">
                OPACITY {Math.round(bgOpacity * 100)}%
              </span>
              <input
                type="range"
                min="0.05"
                max="0.45"
                step="0.01"
                value={bgOpacity}
                onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #d4d4d8 0%, #d4d4d8 ${((bgOpacity - 0.05) / 0.40) * 100}%, #27272a ${((bgOpacity - 0.05) / 0.40) * 100}%, #27272a 100%)`
                }}
                className="w-full cursor-pointer h-1.5 custom-range outline-none focus:outline-none focus:ring-0 border-none shadow-none ring-0"
              />
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
