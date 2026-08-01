import { useState, useEffect, useRef } from "react";
import { MangaDB } from "./db";
import { getMedia, getMediaAsync } from "./mediaStore";
import Library from "./components/Library";
import ChapterEditor from "./components/ChapterEditor";
import VideoPlayer from "./components/VideoPlayer";
import { PWAStatusBanner } from "./components/PWAStatusBanner";

export default function App() {
  const [view, setView] = useState<"library" | "editor" | "player">("player");
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [selectedPageNumber, setSelectedPageNumber] = useState<number>(0);
  const [dbReady, setDbReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Site-wide background image & video state
  const [siteBackground, setSiteBackground] = useState<string | null>(() => {
    const fromMedia = getMedia("site_background.jpg") || getMedia("site_background_video");
    if (fromMedia) return fromMedia;
    try {
      return localStorage.getItem("subminer_site_background") || null;
    } catch (e) {
      return null;
    }
  });
  const [siteBackgroundType, setSiteBackgroundType] = useState<"image" | "video">(() => {
    try {
      return (localStorage.getItem("subminer_site_background_type") as "image" | "video") || "image";
    } catch (e) {
      return "image";
    }
  });
  const [siteBackgroundOpacity, setSiteBackgroundOpacity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("subminer_site_background_opacity");
      return saved ? parseFloat(saved) : 0.15;
    } catch (e) {
      return 0.15;
    }
  });
  const [siteBackgroundMuted, setSiteBackgroundMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem("subminer_site_background_muted") !== "false";
    } catch (e) {
      return true;
    }
  });
  const [siteBackgroundPaused, setSiteBackgroundPaused] = useState<boolean>(() => {
    try {
      return localStorage.getItem("subminer_site_background_paused") === "true";
    } catch (e) {
      return false;
    }
  });

  const bgVideoRef = useRef<HTMLVideoElement>(null);

  // Screen content opacity state
  const [screenContentOpacity, setScreenContentOpacity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("subminer_screen_content_opacity");
      return saved !== null ? Math.max(0.35, parseFloat(saved)) : 1;
    } catch (e) {
      return 1;
    }
  });

  const [isFullscreenActive, setIsFullscreenActive] = useState<boolean>(false);

  const syncSiteBackground = async () => {
    let bgType: "image" | "video" = "image";
    try {
      bgType = (localStorage.getItem("subminer_site_background_type") as "image" | "video") || "image";
    } catch (e) {}

    let bg: string | undefined;
    if (bgType === "video") {
      bg = await getMediaAsync("site_background_video");
    }
    if (!bg) {
      bg = await getMediaAsync("site_background.jpg");
      if (bg) bgType = "image";
    }
    if (!bg) {
      try {
        const stored = localStorage.getItem("subminer_site_background");
        if (stored) {
          bg = stored;
          if (stored.startsWith("data:video/") || stored.includes("video") || stored.endsWith(".mp4") || stored.endsWith(".webm") || stored.endsWith(".mkv")) {
            bgType = "video";
          }
        }
      } catch (e) {}
    }

    setSiteBackground(bg || null);
    setSiteBackgroundType(bgType);

    try {
      const op = localStorage.getItem("subminer_site_background_opacity");
      const mutedStr = localStorage.getItem("subminer_site_background_muted");
      const pausedStr = localStorage.getItem("subminer_site_background_paused");
      const screenOp = localStorage.getItem("subminer_screen_content_opacity");

      setSiteBackgroundOpacity(op ? parseFloat(op) : 0.15);
      setSiteBackgroundMuted(mutedStr !== "false");
      setSiteBackgroundPaused(pausedStr === "true");
      setScreenContentOpacity(screenOp !== null ? Math.max(0.35, parseFloat(screenOp)) : 1);
    } catch (e) {}
  };

  useEffect(() => {
    // Initialize IndexedDB database on startup
    MangaDB.init()
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error("Failed to initialize IndexedDB:", err);
        setInitError("IndexedDB could not be initialized in this browser. Please verify storage permissions.");
      });

    syncSiteBackground();

    // Initialize global font size scale
    try {
      const savedScale = localStorage.getItem("subminer_global_font_scale");
      if (savedScale) {
        const parsed = parseFloat(savedScale);
        if (!isNaN(parsed) && parsed > 0) {
          document.documentElement.style.fontSize = `${parsed * 100}%`;
        }
      }
    } catch (e) {}

    const handleSettingsChange = () => {
      syncSiteBackground();
    };

    const handleFullscreenStateChange = () => {
      const isFs = !!document.fullscreenElement || document.body.classList.contains("subminer-fullscreen-active") || document.body.classList.contains("fullscreen-active");
      setIsFullscreenActive(isFs);
    };

    window.addEventListener("site-background-updated", handleSettingsChange);
    window.addEventListener("storage", handleSettingsChange);
    window.addEventListener("fullscreenchange", handleFullscreenStateChange);
    window.addEventListener("subminer-fullscreen-toggle", handleFullscreenStateChange);

    return () => {
      window.removeEventListener("site-background-updated", handleSettingsChange);
      window.removeEventListener("storage", handleSettingsChange);
      window.removeEventListener("fullscreenchange", handleFullscreenStateChange);
      window.removeEventListener("subminer-fullscreen-toggle", handleFullscreenStateChange);
    };
  }, []);

  useEffect(() => {
    if (bgVideoRef.current && siteBackgroundType === "video") {
      if (siteBackgroundPaused) {
        bgVideoRef.current.pause();
      } else {
        bgVideoRef.current.play().catch(() => {});
      }
    }
  }, [siteBackgroundPaused, siteBackground, siteBackgroundType]);

  const handleOpenChapter = (chapterId: string, pageNumber: number = 0) => {
    setSelectedChapterId(chapterId);
    setSelectedPageNumber(pageNumber);
    setView("editor");
  };

  const handleOpenPlayer = () => {
    setView("player");
    setSelectedChapterId(null);
    setSelectedPageNumber(0);
  };

  const handleBackToLibrary = () => {
    setView("library");
    setSelectedChapterId(null);
    setSelectedPageNumber(0);
  };

  if (initError) {
    return (
      <div className="min-h-screen bg-zinc-900 flex flex-col items-center justify-center p-6 text-white font-sans text-center">
        <div className="border border-zinc-700 p-8 max-w-md bg-zinc-800 rounded">
          <h1 className="text-xl font-serif font-semibold text-red-400 mb-2">Storage Error</h1>
          <p className="text-sm text-zinc-300 font-mono mb-4">{initError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 font-mono text-xs text-white transition-colors rounded"
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }

  if (!dbReady) {
    return <div className="min-h-screen bg-zinc-900" />;
  }

  return (
    <div id="app-container" className="min-h-screen bg-zinc-900 text-white relative">
      {siteBackground && (
        <div
          className="site-bg-overlay overflow-hidden"
          style={{
            opacity: siteBackgroundOpacity,
          }}
        >
          {siteBackgroundType === "video" ? (
            <video
              ref={bgVideoRef}
              src={siteBackground}
              autoPlay
              loop
              muted={siteBackgroundMuted}
              playsInline
              className="w-full h-full object-cover pointer-events-none"
            />
          ) : (
            <div
              className="w-full h-full bg-cover bg-center"
              style={{
                backgroundImage: `url("${siteBackground}")`,
              }}
            />
          )}
        </div>
      )}
      <div
        id="screen-content"
        className="relative min-h-screen flex flex-col"
        style={{
          ["--screen-text-opacity" as any]: isFullscreenActive ? 1 : screenContentOpacity,
        }}
      >
        <PWAStatusBanner />
        {view === "library" ? (
          <Library
            onOpenChapter={handleOpenChapter}
            onOpenPlayer={handleOpenPlayer}
          />
        ) : view === "editor" ? (
          selectedChapterId && (
            <ChapterEditor
              chapterId={selectedChapterId}
              initialPageNumber={selectedPageNumber}
              onBackToLibrary={handleBackToLibrary}
            />
          )
        ) : (
          <VideoPlayer onBackToLibrary={handleBackToLibrary} />
        )}
      </div>
    </div>
  );
}

