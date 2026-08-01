import React, { useState, useEffect } from "react";
import { Chapter, SearchResult, DictImportProgress } from "../types";
import { MangaDB } from "../db";
import { importCBZ, importDictionary } from "../utils";
import { InteractiveFurigana } from "./InteractiveFurigana";
import { InstallAppButton } from "./InstallAppButton";

interface LibraryProps {
  onOpenChapter: (chapterId: string, pageNumber?: number) => void;
  onOpenPlayer: () => void;
}

export default function Library({ onOpenChapter, onOpenPlayer }: LibraryProps) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [deleteConfirmChapterId, setDeleteConfirmChapterId] = useState<string | null>(null);

  // Yomitan dictionary state
  const [dictionaries, setDictionaries] = useState<any[]>([]);
  const [isImportingDict, setIsImportingDict] = useState(false);
  const [dictImportProgress, setDictImportProgress] = useState<DictImportProgress | null>(null);
  const [dictImportError, setDictImportError] = useState<string | null>(null);
  const [dictDragActive, setDictDragActive] = useState(false);

  // Video player cache state
  const [videoCacheSuccess, setVideoCacheSuccess] = useState(false);

  const handleClearVideoCache = () => {
    localStorage.removeItem("subminer_cached_videos");
    setVideoCacheSuccess(true);
    setTimeout(() => setVideoCacheSuccess(false), 3000);
  };

  // Load chapters and dictionaries on mount
  useEffect(() => {
    loadChapters();
    loadDictionaries();
  }, []);

  const loadChapters = async () => {
    try {
      const list = await MangaDB.getChapters();
      setChapters(list);
    } catch (err) {
      console.error("Failed to load chapters:", err);
    }
  };

  const loadDictionaries = async () => {
    try {
      const list = await MangaDB.getDictionaries();
      setDictionaries(list);
    } catch (err) {
      console.error("Failed to load dictionaries:", err);
    }
  };

  const handleDictFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setDictImportError("Please upload a valid Yomitan ZIP dictionary file.");
      return;
    }

    setIsImportingDict(true);
    setDictImportError(null);
    setDictImportProgress({
      step: "loading",
      message: "Reading archive...",
      percent: 0,
    });
    try {
      await importDictionary(file, (progress) => {
        setDictImportProgress(progress);
      });
      await loadDictionaries();
      setIsImportingDict(false);
      setDictImportProgress(null);
    } catch (err) {
      console.error("Dictionary import failed:", err);
      setDictImportError(err instanceof Error ? err.message : "Failed to import dictionary.");
      setIsImportingDict(false);
      setDictImportProgress(null);
    }
  };

  const onDictFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleDictFileUpload(e.target.files[0]);
    }
  };

  const handleDictDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDictDragActive(true);
    } else if (e.type === "dragleave") {
      setDictDragActive(false);
    }
  };

  const handleDictDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDictDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleDictFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDeleteDictionary = async (dictId: string) => {
    if (confirm("Are you sure you want to remove this dictionary? This will delete all imported terms, pitch accents, and metadata.")) {
      try {
        await MangaDB.deleteDictionary(dictId);
        await loadDictionaries();
      } catch (err) {
        console.error("Failed to delete dictionary:", err);
      }
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const results = await MangaDB.searchAllChapters(searchQuery);
      setSearchResults(results);
    } catch (err) {
      console.error("Search failed:", err);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setIsSearching(false);
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".cbz") && !file.name.toLowerCase().endsWith(".zip")) {
      setImportError("Please upload a valid .CBZ or .ZIP manga chapter file.");
      return;
    }

    setIsImporting(true);
    setImportError(null);
    try {
      const newId = await importCBZ(file);
      await loadChapters();
      setIsImporting(false);
      onOpenChapter(newId, 0); // Automatically open the imported chapter
    } catch (err) {
      console.error("Import failed:", err);
      setImportError(err instanceof Error ? err.message : "Failed to import chapter.");
      setIsImporting(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDeleteChapter = async (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleteConfirmChapterId !== id) {
      setDeleteConfirmChapterId(id);
      setTimeout(() => {
        setDeleteConfirmChapterId((prev) => (prev === id ? null : prev));
      }, 4000);
      return;
    }

    try {
      await MangaDB.deleteChapter(id);
      await loadChapters();
      // If we are showing search results, clear them or refresh search
      if (searchQuery) {
        const results = await MangaDB.searchAllChapters(searchQuery);
        setSearchResults(results);
      }
      setDeleteConfirmChapterId(null);
    } catch (err) {
      console.error("Failed to delete chapter:", err);
    }
  };

  return (
    <div id="library-root" className="max-w-7xl mx-auto px-6 py-10 text-white font-sans">
      <div className="border-b border-zinc-850 pb-6 mb-8 select-none flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white tracking-wide">
            Immersion Study Hub
          </h1>
          <p className="text-xs font-mono text-zinc-500 uppercase mt-1 tracking-wider">
            Yomitan Dictionary & Subtitle Mining
          </p>
        </div>
        <InstallAppButton />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left column: Imports, Video Player, and Global Search */}
        <div className="lg:col-span-5 space-y-8">
          {/* Anime Video Player Box (No icons, grey styling) */}
          <div className="bg-zinc-800 border border-zinc-700/30 rounded-xl p-6 shadow-md transition-all duration-300 hover:shadow-lg">
            <div className="flex items-center gap-2.5 mb-4 border-b border-zinc-700/50 pb-3 select-none">
              <h2 className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-300">
                Anime Video Player
              </h2>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed mb-4">
              Open the anime media player to play videos, manage interactive subtitle tracks, and mine dialogue.
            </p>
            <button
              onClick={onOpenPlayer}
              className="w-full py-2.5 bg-zinc-900/30 hover:bg-zinc-900/50 border border-zinc-700 text-xs font-mono tracking-wider font-bold transition-all uppercase rounded-lg text-center cursor-pointer text-zinc-300 hover:text-white"
            >
              <span>Launch Anime Video Player</span>
            </button>
          </div>

          {/* CBZ Import Tool */}
          <div className="bg-zinc-800 border border-zinc-700/30 rounded-xl p-6 shadow-md transition-all duration-300 hover:shadow-lg">
            <div className="flex items-center gap-2.5 mb-5 border-b border-zinc-700/50 pb-3 select-none">
              <h2 className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-300">
                Import Chapter
              </h2>
            </div>
            <div
              className={`border-2 rounded-xl p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3 ${
                dragActive
                  ? "border-zinc-400 bg-zinc-700/30 scale-[0.99]"
                  : "border-dashed border-zinc-700 hover:border-zinc-500 bg-zinc-900/30 hover:bg-zinc-900/50"
              }`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById("file-upload-input")?.click()}
            >
              <input
                id="file-upload-input"
                type="file"
                accept=".cbz,.zip"
                className="hidden"
                onChange={onFileChange}
              />
              <p className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">
                {isImporting ? "Processing CBZ Archive..." : "Select Manga CBZ File"}
              </p>
              <p className="text-[10px] text-zinc-500 font-mono">
                Drag & drop or click to upload
              </p>
            </div>
            {importError && (
              <p className="text-xs text-red-400 mt-3 font-mono uppercase bg-red-950/20 border border-red-900/50 rounded-lg p-2.5">
                Error: {importError}
              </p>
            )}
          </div>

          {/* Yomitan Dictionary Import Tool */}
          <div className="bg-zinc-800 border border-zinc-700/30 rounded-xl p-6 shadow-md transition-all duration-300 hover:shadow-lg">
            <div className="flex items-center gap-2.5 mb-5 border-b border-zinc-700/50 pb-3 select-none">
              <h2 className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-300">
                Import Dictionary
              </h2>
            </div>
            <div
              className={`border-2 rounded-xl p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3 ${
                dictDragActive
                  ? "border-zinc-400 bg-zinc-700/30 scale-[0.99]"
                  : "border-dashed border-zinc-700 hover:border-zinc-500 bg-zinc-900/30 hover:bg-zinc-900/50"
              }`}
              onDragEnter={handleDictDrag}
              onDragOver={handleDictDrag}
              onDragLeave={handleDictDrag}
              onDrop={handleDictDrop}
              onClick={() => !isImportingDict && document.getElementById("dict-upload-input")?.click()}
            >
              <input
                id="dict-upload-input"
                type="file"
                accept=".zip"
                className="hidden"
                onChange={onDictFileChange}
                disabled={isImportingDict}
              />
              <p className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">
                {isImportingDict ? "Importing dictionary..." : "Select Yomitan ZIP Dictionary"}
              </p>
              <p className="text-[10px] text-zinc-500 font-mono leading-relaxed max-w-xs mx-auto">
                Supports Yomichan/Yomitan formats (Terms, Pitch Accents, JLPT, Frequencies)
              </p>
            </div>

            {/* Rich Real-Time Progress Bar Component (Yomitan Extension Style) */}
            {isImportingDict && dictImportProgress && (
              <div className="mt-4 p-4 border border-zinc-700/40 bg-zinc-900/40 rounded-lg space-y-3">
                <div className="flex justify-between items-center text-[10px] font-mono uppercase font-bold text-zinc-300">
                  <span className="bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700 text-[9px]">
                    {dictImportProgress.step}
                  </span>
                  <span>{dictImportProgress.percent}%</span>
                </div>
                {/* Progress bar line */}
                <div className="w-full h-1.5 bg-zinc-850 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-zinc-400 rounded-full transition-all duration-300"
                    style={{ width: `${dictImportProgress.percent}%` }}
                  />
                </div>
                <p className="text-[10px] font-mono text-zinc-400 uppercase leading-snug">
                  {dictImportProgress.message}
                </p>
                {dictImportProgress.processedRecords !== undefined && (
                  <p className="text-[9px] font-mono text-zinc-500 uppercase">
                    Processed: {dictImportProgress.processedRecords.toLocaleString()}{" "}
                    {dictImportProgress.totalRecords ? `/ ${dictImportProgress.totalRecords.toLocaleString()}` : ""}{" "}
                    entries
                  </p>
                )}
              </div>
            )}

            {dictImportError && (
              <p className="text-xs text-red-400 mt-3 font-mono uppercase bg-red-950/20 border border-red-900/50 rounded-lg p-2.5">
                Error: {dictImportError}
              </p>
            )}

            {/* List of imported dictionaries */}
            {dictionaries.length > 0 && (
              <div className="mt-6 border-t border-zinc-700/50 pt-4 space-y-3">
                <h3 className="text-[10px] font-mono font-bold tracking-wider uppercase text-zinc-500">
                  Imported Dictionaries ({dictionaries.length})
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {dictionaries.map((dict) => {
                    const isHidden = !!dict.hidden;
                    return (
                      <div
                        key={dict.id}
                        className={`text-xs border border-zinc-700/40 p-3 bg-zinc-900/20 rounded-lg flex flex-col justify-between gap-2 hover:bg-zinc-900/40 hover:border-zinc-700 transition-all duration-200 ${
                          isHidden ? "opacity-60" : ""
                        }`}
                      >
                        <div className="flex justify-between items-start gap-3">
                          <div className="min-w-0">
                            <p className={`font-bold text-zinc-200 truncate ${isHidden ? "line-through text-zinc-400" : ""}`}>
                              {dict.title}
                            </p>
                            <p className="text-[10px] text-zinc-500 font-mono mt-1">
                              {dict.termCount > 0 && `• ${dict.termCount} terms `}
                              {dict.accentCount > 0 && `• ${dict.accentCount} accents `}
                              {dict.metaCount > 0 && `• ${dict.metaCount} metadata `}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={async () => {
                                await MangaDB.toggleDictionaryHidden(dict.id);
                                await loadDictionaries();
                              }}
                              className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-700/30 rounded-md cursor-pointer shrink-0 transition-all flex items-center justify-center border-none outline-none"
                              title={isHidden ? "Show dictionary" : "Hide dictionary"}
                            >
                              <span className="material-symbols-rounded !text-[18px] !w-[18px] !h-[18px] !leading-[18px]">
                                {isHidden ? "visibility_off" : "visibility"}
                              </span>
                            </button>
                            <button
                              onClick={() => handleDeleteDictionary(dict.id)}
                              className="text-[10px] font-mono uppercase font-bold text-red-400/85 hover:text-red-400 hover:underline cursor-pointer p-1 shrink-0 transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Search Dialogue Text */}
          <div className="bg-zinc-800 border border-zinc-700/30 rounded-xl p-6 shadow-md transition-all duration-300 hover:shadow-lg">
            <div className="flex items-center gap-2.5 mb-5 border-b border-zinc-700/50 pb-3 select-none">
              <h2 className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-300">
                Search Dialogue Text
              </h2>
            </div>
            <form onSubmit={handleSearch} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type Japanese text to search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-zinc-900/50 border border-zinc-700/80 hover:border-zinc-600 focus:border-zinc-500 px-3.5 py-2 text-xs text-white placeholder-zinc-500 font-sans rounded-lg focus:outline-none transition-all"
                />
                <button
                  type="submit"
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-lg cursor-pointer transition-all duration-200"
                >
                  Search
                </button>
              </div>
              {isSearching && (
                <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400 uppercase select-none">
                  <span>Found {searchResults.length} matches</span>
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="text-zinc-300 hover:text-white hover:underline font-bold transition-colors"
                  >
                    Clear Search
                  </button>
                </div>
              )}
            </form>

            {/* Search Results Display */}
            {isSearching && searchResults.length > 0 && (
              <div className="mt-4 space-y-3 max-h-96 overflow-y-auto border-t border-zinc-700/50 pt-4 pr-1">
                {searchResults.map((result) => (
                  <div
                    key={result.entry.id}
                    onClick={() => onOpenChapter(result.chapter.id, result.pageNumber)}
                    className="border border-zinc-750/50 rounded-lg p-3.5 bg-zinc-900/20 hover:bg-zinc-900/40 hover:border-zinc-650 cursor-pointer transition-all duration-200 flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500 uppercase">
                      <span className="font-bold text-zinc-400 max-w-[70%] truncate">{result.chapter.title}</span>
                      <span>Page {result.pageNumber + 1}</span>
                    </div>
                    <div className="text-sm font-medium text-zinc-100 leading-normal font-serif select-none">
                      <InteractiveFurigana text={result.entry.japanese} />
                    </div>
                    {result.entry.notes && (
                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed font-sans">
                        {result.entry.notes}
                      </p>
                    )}
                    <div className="text-[9px] font-mono text-zinc-500 text-right uppercase tracking-wider mt-1 font-bold">
                      Click to Go to Page →
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isSearching && searchResults.length === 0 && (
              <p className="text-xs text-zinc-400 mt-4 font-mono text-center py-4 uppercase">
                No matching dialogues found.
              </p>
            )}
          </div>

          {/* Cache Management Box */}
          <div className="bg-zinc-800 border border-zinc-700/30 rounded-xl p-6 shadow-md transition-all duration-300 hover:shadow-lg">
            <div className="flex items-center gap-2.5 mb-4 border-b border-zinc-700/50 pb-3 select-none">
              <h2 className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-300">
                Cache Management
              </h2>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed mb-4">
              Wipe out cached video files meta, playback timestamps, and imported subtitles from your browser storage.
            </p>
            <button
              onClick={handleClearVideoCache}
              disabled={videoCacheSuccess}
              className={`w-full py-2.5 border text-xs font-mono tracking-wider font-bold transition-all uppercase rounded-lg text-center cursor-pointer ${
                videoCacheSuccess
                  ? "bg-emerald-950/25 border-emerald-500/40 text-emerald-400 cursor-default"
                  : "bg-zinc-900/30 hover:bg-red-950/20 hover:text-red-400 hover:border-red-500/40 border-zinc-700 text-zinc-400"
              }`}
            >
              {videoCacheSuccess ? "Cache Cleared!" : "Clear Video Cache"}
            </button>
          </div>
        </div>

        {/* Right column: Chapters Library */}
        <div className="lg:col-span-7">
          <div className="bg-zinc-800 border border-zinc-700/30 rounded-xl p-6 min-h-[400px] flex flex-col shadow-md transition-all duration-300 hover:shadow-lg">
            <div className="flex items-center gap-2.5 mb-6 border-b border-zinc-700/50 pb-3 select-none">
              <h2 className="text-sm font-mono font-bold tracking-wider text-zinc-300 uppercase">
                Your Manga Library
              </h2>
            </div>

            {chapters.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-zinc-550 border-2 border-dashed border-zinc-700/50 rounded-xl bg-zinc-900/10">
                <p className="text-xs uppercase font-mono tracking-wider text-zinc-400">Your library is currently empty.</p>
                <p className="text-[10px] text-zinc-500 mt-1">Import some manga chapters to start studying!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {chapters.map((chapter) => (
                  <div
                    key={chapter.id}
                    onClick={() => onOpenChapter(chapter.id, 0)}
                    className="group border border-zinc-750/45 hover:border-zinc-700 bg-zinc-900/15 hover:bg-zinc-900/40 p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition-all duration-200 rounded-xl"
                  >
                    <div className="space-y-1">
                      <h3 className="font-serif font-bold text-lg text-zinc-200 group-hover:text-white transition-colors">
                        {chapter.title}
                      </h3>
                      <div className="flex items-center gap-3 text-xs font-mono text-zinc-500 uppercase">
                        <span>{chapter.pageCount} pages</span>
                        <span>•</span>
                        <span>
                          Imported {new Date(chapter.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 text-xs font-mono self-start sm:self-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenChapter(chapter.id, 0);
                        }}
                        className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 rounded-lg transition-all uppercase cursor-pointer font-bold tracking-wide shadow-sm"
                      >
                        Open Chapter
                      </button>
                      <button
                        onClick={(e) => handleDeleteChapter(chapter.id, chapter.title, e)}
                        className={`px-3.5 py-2 rounded-lg border transition-all uppercase cursor-pointer font-bold tracking-wide ${
                          deleteConfirmChapterId === chapter.id
                            ? "text-white bg-red-600 hover:bg-red-700 border-red-500"
                            : "text-zinc-400 hover:text-red-400 bg-zinc-900/40 hover:bg-red-950/20 border-zinc-805 hover:border-red-900/55"
                        }`}
                      >
                        {deleteConfirmChapterId === chapter.id ? "Confirm Delete" : "Delete"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
