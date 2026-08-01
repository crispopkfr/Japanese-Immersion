import React, { useState, useEffect, useRef } from "react";
import { Chapter, Page, DialogueEntry } from "../types";
import { MangaDB } from "../db";
import { InteractiveFurigana } from "./InteractiveFurigana";
import { InstallAppButton } from "./InstallAppButton";
import { Volume2, Plus, ChevronUp, ChevronDown, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

function splitIntoMoras(reading: string): string[] {
  const moras: string[] = [];
  const chars = Array.from(reading);
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const nextChar = chars[i + 1];
    if (nextChar && "ゃゅょぁぃぅぇぉャュョァィゥェォ".includes(nextChar)) {
      moras.push(char + nextChar);
      i++;
    } else {
      moras.push(char);
    }
  }
  return moras;
}

function playAudio(expression: string, reading: string) {
  const url = `https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kanji=${encodeURIComponent(expression)}&kana=${encodeURIComponent(reading)}`;
  const audio = new Audio(url);
  audio.play().catch((err) => {
    console.error("Audio playback failed:", err);
  });
}

function getAccentNumber(accentObj: any): number {
  if (typeof accentObj === "number") return accentObj;
  if (typeof accentObj === "object" && accentObj !== null) {
    if (accentObj.accent !== undefined) return Number(accentObj.accent);
  }
  return Number(accentObj || 0);
}

function getParsedPitchValue(metaValue: any): any {
  if (typeof metaValue === "string") {
    try {
      return JSON.parse(metaValue);
    } catch (e) {
      console.error("Failed to parse pitch value:", e);
      return null;
    }
  }
  return metaValue;
}

function getDisplayMetaValue(metaValue: any): string {
  if (metaValue === null || metaValue === undefined) return "";
  let val = metaValue;
  if (typeof val === "string") {
    try {
      val = JSON.parse(val);
    } catch (e) {
      return val;
    }
  }
  if (typeof val === "object") {
    if (Array.isArray(val)) {
      return val.map(getDisplayMetaValue).join(", ");
    }
    // Prioritize displayValue if present
    if (val.displayValue !== undefined) {
      return getDisplayMetaValue(val.displayValue);
    }
    // Check nested frequency or value keys
    if (val.frequency !== undefined) {
      return getDisplayMetaValue(val.frequency);
    }
    if (val.value !== undefined) {
      return getDisplayMetaValue(val.value);
    }
    // Check nested keys of dictionary_meta tags
    if (val.notes !== undefined && val.notes !== "") {
      return getDisplayMetaValue(val.notes);
    }
    if (val.category !== undefined && val.category !== "") {
      return getDisplayMetaValue(val.category);
    }
    try {
      return JSON.stringify(val);
    } catch (e) {
      return "[Object]";
    }
  }
  return String(val);
}

function PitchAccentVisualizer({ reading, accent }: { reading: any; accent: any; key?: any }) {
  const moras = splitIntoMoras(reading);
  const N = moras.length;
  const A = Number(accent);

  const pitches = new Array(N).fill(false);
  let hasDrop = false;

  if (A === 0) {
    for (let i = 1; i < N; i++) {
      pitches[i] = true;
    }
  } else if (A === 1) {
    pitches[0] = true;
    hasDrop = true;
  } else if (A > 1) {
    for (let i = 1; i < Math.min(A, N); i++) {
      pitches[i] = true;
    }
    if (A <= N) {
      hasDrop = true;
    }
  }

  const getPitchTypeName = (acc: number, len: number) => {
    if (acc === 0) return "平板 Heiban";
    if (acc === 1) return "頭高 Atamadaka";
    if (acc === len) return "尾高 Odaka";
    return `中高 Nakadaka [${acc}]`;
  };

  return (
    <div className="inline-flex flex-col items-start gap-1 py-1 font-mono text-[10px]">
      <div className="flex items-end gap-0.5 leading-none h-6 select-none">
        {moras.map((mora, idx) => {
          const isHigh = pitches[idx];
          const isDropPoint = hasDrop && idx === A - 1;
          
          return (
            <span
              key={idx}
              className={`relative px-1 text-sm font-sans flex flex-col items-center justify-center min-w-[20px] transition-colors ${
                isHigh ? "text-red-400 font-bold" : "text-zinc-400"
              }`}
            >
              <span
                className={`absolute left-0 right-0 top-0 border-t-2 ${
                  isHigh ? "border-red-400" : "border-zinc-600"
                } ${isDropPoint ? "border-r-2 border-red-400 h-full" : ""}`}
              />
              <span className="mt-1">{mora}</span>
            </span>
          );
        })}
        <span className="ml-2 text-[9px] font-bold text-zinc-400 uppercase self-center tracking-wider">
          {getPitchTypeName(A, N)}
        </span>
      </div>
    </div>
  );
}

interface RubySegment {
  text: string;
  ruby?: string;
}

function generateRubySegments(expression: string, reading: string): RubySegment[] {
  if (!reading || reading === expression) {
    return [{ text: expression }];
  }

  const isKanjiChar = (ch: string) => /[\u3005\u4e00-\u9faf\u3400-\u4dbf]/.test(ch);
  const hasKanji = Array.from(expression).some(isKanjiChar);
  if (!hasKanji) {
    return [{ text: expression }];
  }

  const toHiragana = (str: string) => {
    return str.replace(/[\u30a1-\u30f6]/g, (match) => {
      return String.fromCharCode(match.charCodeAt(0) - 0x60);
    });
  };

  const normExpr = toHiragana(expression);
  const normRead = toHiragana(reading);

  const parts: { text: string; isKanji: boolean; norm: string }[] = [];
  let currentText = "";
  let currentIsKanji = expression.length > 0 ? isKanjiChar(expression[0]) : false;

  for (const ch of expression) {
    const k = isKanjiChar(ch);
    if (k === currentIsKanji) {
      currentText += ch;
    } else {
      parts.push({ text: currentText, isKanji: currentIsKanji, norm: toHiragana(currentText) });
      currentText = ch;
      currentIsKanji = k;
    }
  }
  if (currentText) {
    parts.push({ text: currentText, isKanji: currentIsKanji, norm: toHiragana(currentText) });
  }

  function match(partIdx: number, readingIdx: number): RubySegment[] | null {
    if (partIdx === parts.length) {
      return readingIdx === reading.length ? [] : null;
    }

    const part = parts[partIdx];
    if (!part.isKanji) {
      if (normRead.slice(readingIdx).startsWith(part.norm)) {
        const sub = match(partIdx + 1, readingIdx + part.text.length);
        if (sub !== null) {
          return [{ text: part.text }, ...sub];
        }
      }
      return null;
    } else {
      const nextPart = parts[partIdx + 1];
      if (nextPart && !nextPart.isKanji) {
        const remainingNormRead = normRead.slice(readingIdx);
        let searchStart = 1;
        while (true) {
          const idx = remainingNormRead.indexOf(nextPart.norm, searchStart);
          if (idx === -1) break;

          const sub = match(partIdx + 1, readingIdx + idx);
          if (sub !== null) {
            return [{ text: part.text, ruby: reading.slice(readingIdx, readingIdx + idx) }, ...sub];
          }
          searchStart = idx + 1;
        }
        return null;
      } else {
        const remainingReading = reading.slice(readingIdx);
        if (remainingReading.length > 0) {
          return [{ text: part.text, ruby: remainingReading }];
        }
        return null;
      }
    }
  }

  const aligned = match(0, 0);
  if (aligned !== null) {
    return aligned;
  }

  return [{ text: expression, ruby: reading }];
}

function TermRuby({ expression, reading, className = "" }: { expression: string; reading?: string; className?: string }) {
  if (!reading || reading === expression) {
    return <span className={className}>{expression}</span>;
  }

  const segments = generateRubySegments(expression, reading);

  return (
    <span className={`${className} inline-flex flex-wrap items-baseline`}>
      {segments.map((seg, idx) => {
        if (seg.ruby) {
          return (
            <ruby key={idx} className="ruby-position-over leading-none">
              {seg.text}
              <rt className="text-[11px] text-zinc-400 font-sans font-normal tracking-wide pb-1 select-none">
                {seg.ruby}
              </rt>
            </ruby>
          );
        }
        return (
          <span key={idx} className="leading-none select-text">
            {seg.text}
          </span>
        );
      })}
    </span>
  );
}

function PageThumbnail({
  chapterId,
  pageNumber,
  isActive,
  onClick,
  onDrop,
  count,
}: {
  chapterId: string;
  pageNumber: number;
  isActive: boolean;
  onClick: () => void;
  onDrop: (e: React.DragEvent) => any;
  count: number;
  key?: any;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let url: string | null = null;

    MangaDB.getPage(chapterId, pageNumber).then((page) => {
      if (active && page && page.imageBlob) {
        url = URL.createObjectURL(page.imageBlob);
        setImgUrl(url);
      }
    }).catch((err) => {
      console.error("Failed to load thumbnail for page", pageNumber, err);
    });

    return () => {
      active = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [chapterId, pageNumber]);

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={onClick}
      className={`group relative flex flex-col cursor-pointer transition-all duration-300 select-none overflow-hidden rounded-md ${
        isActive
          ? "bg-zinc-700/30"
          : "bg-zinc-900/40 hover:bg-zinc-800/40"
      }`}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-950/40 rounded-t-md">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={`Page ${pageNumber + 1}`}
            className={`w-full h-full object-cover transition-transform duration-500 ${
              isActive ? "scale-105" : "group-hover:scale-[1.02]"
            }`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-500 font-mono">
            ...
          </div>
        )}

        {isActive && (
          <div className="absolute inset-0 bg-white/5 pointer-events-none" />
        )}

        {count > 0 && (
          <div className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-zinc-500 px-1 text-[9px] font-bold font-mono text-white shadow-sm select-none">
            {count}
          </div>
        )}
      </div>

      <div className={`p-2 text-center text-xs sm:text-sm font-mono transition-colors border-t border-zinc-800/50 ${
        isActive ? "text-zinc-200 font-semibold" : "text-zinc-400 group-hover:text-zinc-300"
      }`}>
        Page {pageNumber + 1}
      </div>
    </div>
  );
}

interface ChapterEditorProps {
  chapterId: string;
  initialPageNumber: number;
  onBackToLibrary: () => void;
}

export default function ChapterEditor({
  chapterId,
  initialPageNumber,
  onBackToLibrary,
}: ChapterEditorProps) {
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [pagesMeta, setPagesMeta] = useState<{ pageNumber: number; fileName: string }[]>([]);
  const [activePageNum, setActivePageNum] = useState(initialPageNumber);
  const [activePage, setActivePage] = useState<Page | null>(null);
  const [entries, setEntries] = useState<DialogueEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activePageImageUrl, setActivePageImageUrl] = useState<string>("");

  // Dragging state for positioning entries on the image
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 }); // offset in percentage or pixels
  const imageContainerRef = useRef<HTMLDivElement | null>(null);

  // Global notes study mode
  const [globalHideNotes, setGlobalHideNotes] = useState(false);

  // Active workspace panel on mobile / tablet views
  const [activeMobileTab, setActiveMobileTab] = useState<"pages" | "canvas" | "editor">("canvas");

  // Track two-click entry delete state
  const [deleteConfirmEntryId, setDeleteConfirmEntryId] = useState<string | null>(null);

  // Yomitan dictionary lookup state
  const [dictSearchQuery, setDictSearchQuery] = useState("");
  const [dictSearchResults, setDictSearchResults] = useState<{
    terms: any[];
    accents: any[];
    metas: any[];
  } | null>(null);
  const [isSearchingDict, setIsSearchingDict] = useState(false);
  const [showDictPanel, setShowDictPanel] = useState(false);

  // Swipe gesture tracking refs
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleDictSearch = async () => {
    if (!dictSearchQuery.trim()) return;
    setIsSearchingDict(true);
    setShowDictPanel(true);
    try {
      const results = await MangaDB.lookupWord(dictSearchQuery);
      setDictSearchResults(results);
    } catch (err) {
      console.error("Dictionary lookup failed:", err);
    } finally {
      setIsSearchingDict(false);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touch = e.changedTouches[0];
    const diffX = touch.clientX - touchStartX.current;
    const diffY = touch.clientY - touchStartY.current;

    // Detect horizontal swipe with min 50px delta
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      if (diffX < 0) {
        // Swipe Left: moves to the PREVIOUS page in RTL manga
        handleMovePage("prev");
      } else {
        // Swipe Right: moves to the NEXT page in RTL manga
        handleMovePage("next");
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Keyboard Navigation: Arrow Left/Right in RTL direction
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl) {
        const tagName = activeEl.tagName.toUpperCase();
        if (tagName === "INPUT" || tagName === "TEXTAREA" || activeEl.hasAttribute("contenteditable")) {
          return;
        }
      }

      if (e.key === "ArrowLeft") {
        // Left Arrow -> NEXT page in RTL manga
        handleMovePage("next");
      } else if (e.key === "ArrowRight") {
        // Right Arrow -> PREV page in RTL manga
        handleMovePage("prev");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [pagesMeta.length, activePageNum]);

  // Load Chapter and Meta on mount or chapterId change
  useEffect(() => {
    loadChapterData();
  }, [chapterId]);

  // Load Page and Entries when activePageNum changes
  useEffect(() => {
    loadPageAndEntries();
  }, [chapterId, activePageNum]);

  // Generate and revoke object URL for the page image blob
  useEffect(() => {
    if (activePage?.imageBlob) {
      const url = URL.createObjectURL(activePage.imageBlob);
      setActivePageImageUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setActivePageImageUrl("");
    }
  }, [activePage]);

  const loadChapterData = async () => {
    setIsLoading(true);
    try {
      const chapters = await MangaDB.getChapters();
      const currentCh = chapters.find((c) => c.id === chapterId);
      if (currentCh) {
        setChapter(currentCh);
      }

      const meta = await MangaDB.getChapterPagesMeta(chapterId);
      setPagesMeta(meta);
    } catch (err) {
      console.error("Failed to load chapter data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPageAndEntries = async () => {
    try {
      const pageData = await MangaDB.getPage(chapterId, activePageNum);
      setActivePage(pageData);

      const allEntries = await MangaDB.getEntries(chapterId);
      setEntries(allEntries);
    } catch (err) {
      console.error("Failed to load page or entries:", err);
    }
  };

  // Get only entries on the active page
  const activePageEntries = entries
    .filter((e) => e.pageNumber === activePageNum)
    .sort((a, b) => a.order - b.order);

  const handleAddEntry = async (customCoords?: { x: number; y: number }) => {
    const defaultX = customCoords ? customCoords.x : 40;
    const defaultY = customCoords ? customCoords.y : 40;

    // Determine order: max order + 1
    const pageEntries = entries.filter((e) => e.pageNumber === activePageNum);
    const maxOrder = pageEntries.reduce((max, e) => (e.order > max ? e.order : max), 0);

    const newId = "entry_" + Date.now() + "_" + Math.random().toString(36).substring(2, 5);
    const newEntry: DialogueEntry = {
      id: newId,
      chapterId: chapterId,
      pageNumber: activePageNum,
      japanese: "",
      notes: "",
      notesHidden: false,
      x: defaultX,
      y: defaultY,
      order: maxOrder + 1,
    };

    try {
      await MangaDB.saveEntry(newEntry);
      // Refresh entries state
      const updatedEntries = await MangaDB.getEntries(chapterId);
      setEntries(updatedEntries);
      setSelectedEntryId(newId);
    } catch (err) {
      console.error("Failed to add entry:", err);
    }
  };

  const handleUpdateEntry = async (updated: DialogueEntry) => {
    // Update state synchronously in the same tick to prevent cursor jumping
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    try {
      await MangaDB.saveEntry(updated);
    } catch (err) {
      console.error("Failed to update entry:", err);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (deleteConfirmEntryId !== id) {
      setDeleteConfirmEntryId(id);
      setTimeout(() => {
        setDeleteConfirmEntryId((prev) => (prev === id ? null : prev));
      }, 4000);
      return;
    }

    try {
      await MangaDB.deleteEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (selectedEntryId === id) {
        setSelectedEntryId(null);
      }
      setDeleteConfirmEntryId(null);
    } catch (err) {
      console.error("Failed to delete entry:", err);
    }
  };

  const handleMovePage = (direction: "prev" | "next") => {
    if (direction === "prev" && activePageNum > 0) {
      setActivePageNum((p) => p - 1);
      setSelectedEntryId(null);
    } else if (direction === "next" && activePageNum < pagesMeta.length - 1) {
      setActivePageNum((p) => p + 1);
      setSelectedEntryId(null);
    }
  };

  // Reordering entries within the current page
  const handleReorderEntry = async (id: string, direction: "up" | "down") => {
    const pageEntries = [...activePageEntries];
    const index = pageEntries.findIndex((e) => e.id === id);
    if (index === -1) return;

    if (direction === "up" && index > 0) {
      // Swap with previous
      const targetIndex = index - 1;
      const tempOrder = pageEntries[index].order;
      pageEntries[index].order = pageEntries[targetIndex].order;
      pageEntries[targetIndex].order = tempOrder;

      await MangaDB.saveEntry(pageEntries[index]);
      await MangaDB.saveEntry(pageEntries[targetIndex]);
    } else if (direction === "down" && index < pageEntries.length - 1) {
      // Swap with next
      const targetIndex = index + 1;
      const tempOrder = pageEntries[index].order;
      pageEntries[index].order = pageEntries[targetIndex].order;
      pageEntries[targetIndex].order = tempOrder;

      await MangaDB.saveEntry(pageEntries[index]);
      await MangaDB.saveEntry(pageEntries[targetIndex]);
    }

    const allEntries = await MangaDB.getEntries(chapterId);
    setEntries(allEntries);
  };

  // Reallocate page number via HTML5 Drag and Drop from sidebar list to Left Nav page buttons
  const handleDropOnPage = async (e: React.DragEvent, targetPageNum: number) => {
    e.preventDefault();
    const entryId = e.dataTransfer.getData("entryId");
    if (!entryId) return;

    const entryToMove = entries.find((en) => en.id === entryId);
    if (entryToMove) {
      if (entryToMove.pageNumber === targetPageNum) return; // same page

      // Determine order on target page
      const targetPageEntries = entries.filter((en) => en.pageNumber === targetPageNum);
      const maxOrder = targetPageEntries.reduce((max, en) => (en.order > max ? en.order : max), 0);

      const updated: DialogueEntry = {
        ...entryToMove,
        pageNumber: targetPageNum,
        order: maxOrder + 1,
      };

      try {
        await MangaDB.saveEntry(updated);
        const allEntries = await MangaDB.getEntries(chapterId);
        setEntries(allEntries);
        
        // If the moved entry was selected, deselect it since it's on a different page now
        if (selectedEntryId === entryId) {
          setSelectedEntryId(null);
        }
      } catch (err) {
        console.error("Failed to drag and reallocate entry to page:", err);
      }
    }
  };

  // Move via select dropdown
  const handleMoveToPageSelect = async (entryId: string, targetPageNum: number) => {
    const entryToMove = entries.find((en) => en.id === entryId);
    if (entryToMove) {
      const targetPageEntries = entries.filter((en) => en.pageNumber === targetPageNum);
      const maxOrder = targetPageEntries.reduce((max, en) => (en.order > max ? en.order : max), 0);

      const updated: DialogueEntry = {
        ...entryToMove,
        pageNumber: targetPageNum,
        order: maxOrder + 1,
      };

      try {
        await MangaDB.saveEntry(updated);
        const allEntries = await MangaDB.getEntries(chapterId);
        setEntries(allEntries);
        setSelectedEntryId(null);
      } catch (err) {
        console.error("Failed to move entry to page:", err);
      }
    }
  };

  // Double click on page image to create dialogue box there
  const handleImageDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    
    // Calculate click coordinates as percentages of the container
    const clickX = ((e.clientX - rect.left) / rect.width) * 100;
    const clickY = ((e.clientY - rect.top) / rect.height) * 100;

    // Safety constraints
    const safeX = Math.max(2, Math.min(90, Math.round(clickX)));
    const safeY = Math.max(2, Math.min(90, Math.round(clickY)));

    handleAddEntry({ x: safeX, y: safeY });
  };

  // Dragging event handlers for moving overlays on image
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, entryId: string) => {
    e.stopPropagation(); // Prevent trigger page-wide selections
    setSelectedEntryId(entryId);
    setDraggingId(entryId);

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const entry = entries.find((en) => en.id === entryId);
    if (!entry) return;

    // Convert current percentage coordinate back to screen pixels to find clicking offset
    const entryPixelX = rect.left + (entry.x / 100) * rect.width;
    const entryPixelY = rect.top + (entry.y / 100) * rect.height;

    dragOffsetRef.current = {
      x: clientX - entryPixelX,
      y: clientY - entryPixelY,
    };
  };

  useEffect(() => {
    const handleDragMove = (e: MouseEvent | TouchEvent) => {
      if (!draggingId || !imageContainerRef.current) return;

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      const rect = imageContainerRef.current.getBoundingClientRect();

      // Position in pixels relative to container
      const localX = clientX - rect.left - dragOffsetRef.current.x;
      const localY = clientY - rect.top - dragOffsetRef.current.y;

      // Convert back to percentages (0-100)
      let pctX = (localX / rect.width) * 100;
      let pctY = (localY / rect.height) * 100;

      // Bound constraints to keep overlay boxes within the page container
      pctX = Math.max(0, Math.min(95, pctX));
      pctY = Math.max(0, Math.min(95, pctY));

      setEntries((prev) =>
        prev.map((en) =>
          en.id === draggingId ? { ...en, x: Math.round(pctX * 10) / 10, y: Math.round(pctY * 10) / 10 } : en
        )
      );
    };

    const handleDragEnd = async () => {
      if (!draggingId) return;
      const updatedEntry = entries.find((en) => en.id === draggingId);
      if (updatedEntry) {
        await handleUpdateEntry(updatedEntry);
      }
      setDraggingId(null);
    };

    if (draggingId) {
      window.addEventListener("mousemove", handleDragMove);
      window.addEventListener("mouseup", handleDragEnd);
      window.addEventListener("touchmove", handleDragMove, { passive: false });
      window.addEventListener("touchend", handleDragEnd);
    }

    return () => {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchmove", handleDragMove);
      window.removeEventListener("touchend", handleDragEnd);
    };
  }, [draggingId, entries]);

  const selectedEntry = entries.find((e) => e.id === selectedEntryId);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-[#666] bg-[#0a0a0a] font-mono text-xs uppercase tracking-wider">
        <p>Loading editor metadata...</p>
      </div>
    );
  }

  return (
    <div id="editor-root" className="h-screen flex flex-col bg-zinc-900 text-white font-sans overflow-hidden">
      {/* Top Header */}
      <header className="bg-zinc-800 flex flex-col z-10 shrink-0 select-none">
        <div className="px-4 md:px-6 py-3.5 sm:py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
          {/* Dictionary Search Bar (Left Side) */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleDictSearch();
                // Dismiss mobile virtual keyboard by blurring the input
                const activeEl = document.activeElement;
                if (activeEl instanceof HTMLElement) {
                  activeEl.blur();
                }
              }}
              className="flex items-center relative w-full md:w-auto"
            >
              <div className="relative flex items-center w-full md:w-auto">
                <input
                  type="text"
                  placeholder="Search"
                  value={dictSearchQuery}
                  onChange={(e) => setDictSearchQuery(e.target.value)}
                  className="border border-zinc-700/30 bg-zinc-900/50 px-5 py-2.5 md:py-3 pr-14 text-sm md:text-base text-white focus:outline-none placeholder-zinc-400 font-mono flex-1 md:flex-initial md:w-64 rounded-full"
                />
                {showDictPanel && dictSearchResults && (
                  <span className="absolute right-4 font-mono text-xs font-bold text-zinc-400 select-none pointer-events-none">
                    {dictSearchResults.terms?.length > 0
                      ? dictSearchResults.terms.length
                      : ((dictSearchResults.accents?.length || 0) + (dictSearchResults.metas?.length || 0))}
                  </span>
                )}
              </div>
            </form>
            {showDictPanel && (
              <button
                onClick={() => setShowDictPanel(false)}
                className="text-zinc-400 hover:text-white transition-colors cursor-pointer p-1.5 flex items-center justify-center"
                aria-label="Close"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            )}
          </div>

          {/* Bundle of Buttons (Right Side) */}
          <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-4 md:gap-6 flex-wrap w-full md:w-auto">
            <div className="flex bg-transparent font-mono text-xs sm:text-sm shrink-0 p-0 gap-2 items-center">
              <button
                onClick={onBackToLibrary}
                className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold"
              >
                <span>LIBRARY</span>
              </button>

              <InstallAppButton variant="compact" />

              {/* Mobile/Tablet View Switcher */}
              <div className="lg:hidden flex gap-2 items-center">
                <button
                  onClick={() => setActiveMobileTab("pages")}
                  className={`px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer ${
                    activeMobileTab === "pages"
                      ? "text-white bg-zinc-750 font-bold"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold"
                  }`}
                >
                  <span>Pages</span>
                </button>
                <button
                  onClick={() => setActiveMobileTab("canvas")}
                  className={`px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer ${
                    activeMobileTab === "canvas"
                      ? "text-white bg-zinc-750 font-bold"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold"
                  }`}
                >
                  <span>Reader</span>
                </button>
                <button
                  onClick={() => setActiveMobileTab("editor")}
                  className={`px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer ${
                    activeMobileTab === "editor"
                      ? "text-white bg-zinc-750 font-bold"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold"
                  }`}
                >
                  Study
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Expanding Dictionary Results Panel with Smooth Animation */}
        <AnimatePresence>
          {showDictPanel && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="bg-zinc-800 rounded-b-2xl overflow-hidden shadow-none border-none outline-none"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="px-4 md:px-6 py-5 max-h-[48vh] overflow-y-auto max-w-6xl mx-auto"
              >

              {isSearchingDict ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-xs font-mono uppercase text-zinc-400 animate-pulse">
                    Searching dictionaries...
                  </div>
                </div>
              ) : !dictSearchResults || (dictSearchResults.terms.length === 0 && dictSearchResults.accents.length === 0 && dictSearchResults.metas.length === 0) ? (
                <div className="text-center py-10 max-w-md mx-auto">
                  <p className="text-xs font-mono text-zinc-400 uppercase">No definitions found</p>
                  <p className="text-[11px] text-zinc-500 font-sans mt-2 leading-relaxed">
                    Try using the base dictionary form, or ensure Yomitan dictionaries are loaded in your Library.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Terms rendering */}
                  {dictSearchResults.terms.map((term) => {
                    const matchingAccents = dictSearchResults.accents.filter(
                      (acc) => acc.expression === term.expression && (!acc.reading || acc.reading === term.reading)
                    );
                    const matchingMetas = dictSearchResults.metas.filter(
                      (m) => m.expression === term.expression && m.mode !== "tag"
                    );
                    const termReading = term.reading || term.expression;

                    const accentList: { reading: string; accent: number }[] = [];
                    matchingAccents.forEach((acc) => {
                      const accs = Array.isArray(acc.accents) ? acc.accents : [acc.accents];
                      accs.forEach((aObj) => {
                        accentList.push({
                          reading: acc.reading || termReading,
                          accent: getAccentNumber(aObj),
                        });
                      });
                    });

                    const pitchMetas = matchingMetas.filter((m) => m.mode === "pitch");
                    const otherMetas = matchingMetas.filter((m) => m.mode !== "pitch");

                    const matchedPitchMetas = pitchMetas.map((meta) => {
                      const parsed = getParsedPitchValue(meta.value);
                      if (!parsed || !parsed.pitches) return null;
                      const isReadingMatch = !parsed.reading || parsed.reading === termReading;
                      return { meta, parsed, isReadingMatch };
                    }).filter(Boolean) as { meta: any; parsed: any; isReadingMatch: boolean }[];

                    let pitchesToRender = matchedPitchMetas.filter((p) => p.isReadingMatch);
                    if (pitchesToRender.length === 0 && matchedPitchMetas.length > 0) {
                      pitchesToRender = matchedPitchMetas;
                    }

                    pitchesToRender.forEach((p) => {
                      const pReading = p.parsed.reading || termReading;
                      p.parsed.pitches.forEach((pitchItem: any) => {
                        accentList.push({
                          reading: pReading,
                          accent: getAccentNumber(pitchItem.position),
                        });
                      });
                    });

                    const uniqueAccents: typeof accentList = [];
                    const seen = new Set<string>();
                    accentList.forEach((item) => {
                      const key = `${item.reading}-${item.accent}`;
                      if (!seen.has(key)) {
                        seen.add(key);
                        uniqueAccents.push(item);
                      }
                    });

                      return (
                        <div
                          key={term.id}
                          className="bg-zinc-900 rounded-md p-4 flex flex-col justify-between hover:bg-zinc-900/80 transition-colors"
                        >
                          <div>
                            <div className="flex items-center justify-between pb-1 mb-2">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <TermRuby
                                  expression={term.expression}
                                  reading={term.reading}
                                  className="font-serif text-3xl sm:text-4xl font-bold text-white select-text pt-2"
                                />
                              </div>
                              <button
                                onClick={() => playAudio(term.expression, term.reading || term.expression)}
                                className="text-zinc-400 hover:text-white p-1 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                                title="Listen pronunciation"
                              >
                                <Volume2 className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Tags / Badges */}
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {term.rules && (
                                <span className="text-[9px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded uppercase font-semibold">
                                  {term.rules}
                                </span>
                              )}
                              {term.termTags &&
                                term.termTags.split(" ").map((tag: string, index: number) => {
                                  const cleanTag = tag.trim();
                                  if (!cleanTag) return null;
                                  const tagMeta = dictSearchResults.metas.find(
                                    (m) => m.expression === cleanTag && m.mode === "tag"
                                  );
                                  const rawLabel = tagMeta ? getDisplayMetaValue(tagMeta.value) || cleanTag : cleanTag;
                                  let displayLabel = rawLabel;
                                  if (rawLabel.toLowerCase().includes("jlpt")) {
                                    const match = rawLabel.match(/jlpt[-_]?n?([1-5])/i);
                                    displayLabel = match ? `JLPT N${match[1]}` : rawLabel.toUpperCase().replace("JLPT-", "JLPT ").replace("JLPT_", "JLPT ");
                                  }
                                  return (
                                    <span
                                      key={index}
                                      className="text-[9px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-semibold uppercase"
                                    >
                                      {displayLabel}
                                    </span>
                                  );
                                })}
                              {otherMetas.map((meta) => {
                                const rawVal = getDisplayMetaValue(meta.value);
                                const isJlpt = rawVal.toLowerCase().includes("jlpt") || meta.mode.toLowerCase().includes("jlpt");
                                let displayLabel = "";
                                if (isJlpt) {
                                  const match = rawVal.match(/jlpt[-_]?n?([1-5])/i);
                                  displayLabel = match ? `JLPT N${match[1]}` : rawVal.toUpperCase().replace("JLPT-", "JLPT ").replace("JLPT_", "JLPT ");
                                } else {
                                  displayLabel = `${meta.mode.toUpperCase()}: ${rawVal}`;
                                }
                                return (
                                  <span
                                    key={meta.id}
                                    className="text-[9px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-semibold uppercase"
                                  >
                                    {displayLabel}
                                  </span>
                                );
                              })}
                            </div>

                            {/* Pitch Accents visualizer */}
                            {uniqueAccents.length > 0 && (
                              <div className="space-y-1.5 py-1 mb-3">
                                {uniqueAccents.map((acc, idx) => (
                                  <PitchAccentVisualizer
                                    key={idx}
                                    reading={acc.reading}
                                    accent={acc.accent}
                                  />
                                ))}
                              </div>
                            )}

                            {/* Glossary */}
                            <div className="space-y-2 mt-3 pt-1">
                              {term.glossary &&
                                term.glossary.map((definition: string, idx: number) => (
                                  <p key={idx} className="text-xs text-zinc-100 leading-relaxed font-sans select-text">
                                    <span className="text-zinc-500 mr-1.5 select-none font-mono text-[10px]">{idx + 1}.</span>
                                    {definition}
                                  </p>
                                ))}
                            </div>
                          </div>
                        </div>
                      );
                  })}

                  {/* Pitch Accents without Terms */}
                  {dictSearchResults.accents.length > 0 && dictSearchResults.terms.length === 0 && (
                    dictSearchResults.accents.map((acc) => {
                      const accs = Array.isArray(acc.accents) ? acc.accents : [acc.accents];
                      return (
                        <div
                          key={acc.id}
                          className="bg-zinc-900 rounded-md p-4 hover:bg-zinc-900/80 transition-colors"
                        >
                          <div className="font-serif pb-1 mb-2">
                            <TermRuby
                              expression={acc.expression}
                              reading={acc.reading}
                              className="font-serif text-3xl sm:text-4xl font-bold text-white select-text pt-2"
                            />
                          </div>
                          <div className="space-y-2">
                            {accs.map((aObj: any, aIdx: number) => (
                              <PitchAccentVisualizer
                                key={aIdx}
                                reading={acc.reading || acc.expression}
                                accent={getAccentNumber(aObj)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Metadata without Terms */}
                  {dictSearchResults.metas.length > 0 && dictSearchResults.terms.length === 0 && (
                    dictSearchResults.metas.map((meta) => {
                      const isPitch = meta.mode === "pitch";
                      const parsed = isPitch ? getParsedPitchValue(meta.value) : null;
                      return (
                        <div
                          key={meta.id}
                          className="bg-zinc-900 rounded-md p-4 hover:bg-zinc-900/80 transition-colors flex flex-col gap-3"
                        >
                          <div className="flex justify-between items-center pb-2">
                            <span className="font-serif text-2xl sm:text-3xl font-bold text-white">{meta.expression}</span>
                            {!isPitch && (
                              <span className="text-[9px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded uppercase font-semibold">
                                {meta.mode}
                              </span>
                            )}
                          </div>
                          {isPitch && parsed && parsed.pitches ? (
                            <div className="space-y-2">
                              {parsed.pitches.map((pitchItem: any, pitchIdx: number) => (
                                <PitchAccentVisualizer
                                  key={pitchIdx}
                                  reading={parsed.reading || meta.expression}
                                  accent={getAccentNumber(pitchItem.position)}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="font-mono text-[10px] text-zinc-400 bg-zinc-850 p-2 rounded break-all select-text">
                              {getDisplayMetaValue(meta.value)}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>


      {/* Main Container Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Panel: Pages Navigation Directory */}
        <aside className={`w-full lg:w-80 bg-zinc-800 lg:border-r border-zinc-700 overflow-y-auto p-4 flex-col justify-between shrink-0 ${
          activeMobileTab === "pages" ? "flex" : "hidden lg:flex"
        }`}>
          <div>
            <div className="grid grid-cols-3 gap-3">
              {pagesMeta.map((p) => {
                const isActive = p.pageNumber === activePageNum;
                // Count entries on this page
                const count = entries.filter((e) => e.pageNumber === p.pageNumber).length;

                return (
                  <PageThumbnail
                    key={p.pageNumber}
                    chapterId={chapterId}
                    pageNumber={p.pageNumber}
                    isActive={isActive}
                    count={count}
                    onClick={() => {
                      setActivePageNum(p.pageNumber);
                      setSelectedEntryId(null);
                    }}
                    onDrop={(e) => handleDropOnPage(e, p.pageNumber)}
                  />
                );
              })}
            </div>
          </div>
        </aside>

        {/* Middle Panel: Manga Image Canvas stage */}
        <main
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className={`flex-1 flex flex-col overflow-hidden items-center p-3 sm:p-4 relative justify-center bg-zinc-800 ${
            activeMobileTab === "canvas" ? "flex" : "hidden lg:flex"
          }`}
        >
          {/* Interactive Manga Canvas Overlay Container */}
          <div className="flex-1 w-full flex items-center justify-center p-2 overflow-auto">
            {activePageImageUrl ? (
              <div
                ref={imageContainerRef}
                className="relative border border-zinc-700 bg-zinc-800 select-none max-h-full max-w-full"
                style={{ height: "fit-content" }}
              >
                {/* Manga Page Image render */}
                <img
                  src={activePageImageUrl}
                  alt={`Manga Chapter Page ${activePageNum + 1}`}
                  className="max-h-[calc(100vh-220px)] sm:max-h-[calc(100vh-180px)] block object-contain pointer-events-none brightness-90 contrast-105"
                />
              </div>
            ) : (
              <p className="text-white text-xs font-mono uppercase">Loading page render...</p>
            )}
          </div>
        </main>

        {/* Right Panel: Side dialogue list & detailed edit form */}
        <aside className={`w-full lg:w-80 bg-zinc-800 lg:border-l border-zinc-700 overflow-y-auto p-4 flex-col justify-between shrink-0 ${
          activeMobileTab === "editor" ? "flex" : "hidden lg:flex"
        }`}>
          {/* Top of Sidebar: Page Dialogue entries inventory */}
          <div className="flex-1 flex flex-col min-h-[220px]">
            {activePageEntries.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-24">
                <button
                  onClick={() => handleAddEntry()}
                  className="text-zinc-400 hover:text-white flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer p-2"
                  title="Create first entry"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>
            ) : (
              <div className="space-y-4 overflow-y-auto pr-1 pt-2 flex flex-col">
                {activePageEntries.map((entry) => {
                  const isSelected = entry.id === selectedEntryId;
                  return (
                    <motion.div
                      key={entry.id}
                      layout
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      className="relative"
                    >
                      <div
                        className={`p-3.5 transition-colors rounded-md ${
                          isSelected
                            ? "bg-zinc-900 font-semibold"
                            : "bg-zinc-900 hover:bg-zinc-900/80"
                        }`}
                      >
                        <div className="flex justify-between items-center text-[10px] font-mono text-zinc-300 mb-2 uppercase">
                          <span className="font-mono text-xs font-bold text-zinc-400 select-none">
                            #{entry.order}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReorderEntry(entry.id, "up");
                              }}
                              className="text-zinc-400 hover:text-zinc-200 transition-colors bg-transparent border-0 p-0"
                              title="Move reading sequence order up"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReorderEntry(entry.id, "down");
                              }}
                              className="text-zinc-400 hover:text-zinc-200 transition-colors bg-transparent border-0 p-0"
                              title="Move reading sequence order down"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isSelected) {
                                  handleUpdateEntry(entry);
                                  setSelectedEntryId(null);
                                } else {
                                  setSelectedEntryId(entry.id);
                                }
                              }}
                              className="font-bold hover:underline font-mono text-[10px] text-zinc-400 hover:text-white uppercase"
                            >
                              {isSelected ? "Save" : "Edit"}
                            </button>
                          </div>
                        </div>
                        <div className="text-xl text-white font-serif leading-relaxed my-1">
                          {entry.japanese ? (
                            <InteractiveFurigana text={entry.japanese} />
                          ) : (
                            <span className="text-zinc-400 font-mono text-[10px] uppercase">Empty Entry</span>
                          )}
                        </div>

                        {/* Expand editor if selected */}
                        {isSelected && (
                          <div
                            className="mt-4 pt-1 space-y-4 text-xs font-normal text-zinc-300"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Japanese Sentence Textarea */}
                            <div>
                              <label className="block text-[9px] font-mono uppercase text-zinc-300 mb-1 font-bold">
                                Sentence
                              </label>
                              <textarea
                                rows={3}
                                placeholder=""
                                value={entry.japanese}
                                onChange={(e) =>
                                  handleUpdateEntry({ ...entry, japanese: e.target.value })
                                }
                                className="w-full p-2 font-serif text-sm bg-zinc-900/50 border border-zinc-700/30 text-white focus:outline-none focus:border-zinc-500 rounded font-normal"
                              />
                            </div>

                            {/* Notes / Translation Textarea */}
                            <div>
                              <label className="block text-[9px] font-mono uppercase text-zinc-300 mb-1 font-bold">
                                Note
                              </label>
                              <textarea
                                rows={4}
                                placeholder=""
                                value={entry.notes}
                                onChange={(e) =>
                                  handleUpdateEntry({ ...entry, notes: e.target.value })
                                }
                                className="w-full p-2 font-mono text-[11px] bg-zinc-900/50 border border-zinc-700/30 text-white focus:outline-none focus:border-zinc-500 leading-normal rounded font-normal"
                              />
                            </div>

                            {/* Delete button */}
                            <div className="pt-2">
                              <button
                                onClick={() => handleDeleteEntry(entry.id)}
                                className="w-full text-center py-1.5 font-mono text-[10px] uppercase cursor-pointer transition-colors rounded text-zinc-500 hover:text-zinc-300 bg-zinc-800/30 hover:bg-zinc-800/60 font-semibold"
                              >
                                {deleteConfirmEntryId === entry.id ? "Confirm Delete" : "Delete"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}

                {/* Dynamic Sliding grey + button always below the bottom entry */}
                <div className="flex justify-center pt-6 pb-4 transition-all duration-300">
                  <button
                    onClick={() => handleAddEntry()}
                    className="text-zinc-400 hover:text-white flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer p-2"
                    title="Add new entry"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>


      </div>
    </div>
  );
}
