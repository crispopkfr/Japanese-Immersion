export interface Chapter {
  id: string;
  title: string;
  createdAt: number;
  pageCount: number;
}

export interface Page {
  id: string;
  chapterId: string;
  pageNumber: number; // 0-indexed
  fileName: string;
  imageBlob: Blob;
}

export interface DialogueEntry {
  id: string;
  chapterId: string;
  pageNumber: number; // 0-indexed
  japanese: string;
  notes: string;
  notesHidden: boolean;
  x: number; // percentage (0 - 100) from left
  y: number; // percentage (0 - 100) from top
  order: number; // reading order on the page
}

export interface SearchResult {
  chapter: Chapter;
  pageNumber: number;
  entry: DialogueEntry;
}

export interface DictImportProgress {
  step: "loading" | "parsing" | "saving" | "done";
  message: string;
  percent: number;
  processedRecords?: number;
  totalRecords?: number;
}

export interface AnimeTracker {
  id: string;
  name: string;
  totalEpisodes: number;
  watchedEpisodes: number[];
  createdAt: number;
  background?: string;
}

