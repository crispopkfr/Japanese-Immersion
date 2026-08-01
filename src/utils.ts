import JSZip from "jszip";
import { Chapter, Page, DictImportProgress } from "./types";
import { MangaDB } from "./db";

/**
 * Imports a CBZ file, extracts images, sorts them naturally,
 * and saves the chapter and all pages into IndexedDB.
 * Returns the created chapter ID.
 */
export async function importCBZ(file: File): Promise<string> {
  const zip = new JSZip();
  let loadedZip;
  try {
    loadedZip = await zip.loadAsync(file);
  } catch (err) {
    throw new Error("Invalid ZIP or CBZ file: " + (err instanceof Error ? err.message : String(err)));
  }

  const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
  const imageFiles: { name: string; file: JSZip.JSZipObject }[] = [];

  loadedZip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;
    // Skip Mac metadata or hidden/system files
    if (
      relativePath.startsWith("__MACOSX") ||
      relativePath.includes("/.") ||
      relativePath.split("/").some(part => part.startsWith("."))
    ) {
      return;
    }

    const lowerPath = relativePath.toLowerCase();
    const isImage = imageExtensions.some((ext) => lowerPath.endsWith(ext));
    if (isImage) {
      imageFiles.push({ name: relativePath, file: zipEntry });
    }
  });

  if (imageFiles.length === 0) {
    throw new Error("No valid images (.jpg, .jpeg, .png, .webp, .gif) found in the .CBZ file.");
  }

  // Sort naturally by file name so reading order is correct
  imageFiles.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
  );

  const chapterId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "ch_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);

  const chapterTitle = file.name.replace(/\.(cbz|zip)$/i, "");

  const chapter: Chapter = {
    id: chapterId,
    title: chapterTitle,
    createdAt: Date.now(),
    pageCount: imageFiles.length,
  };

  // Save the chapter
  await MangaDB.saveChapter(chapter);

  // Save each page
  for (let i = 0; i < imageFiles.length; i++) {
    const { name, file: zipEntry } = imageFiles[i];
    const imageBlob = await zipEntry.async("blob");

    let mimeType = "image/jpeg";
    const lowerName = name.toLowerCase();
    if (lowerName.endsWith(".png")) mimeType = "image/png";
    else if (lowerName.endsWith(".webp")) mimeType = "image/webp";
    else if (lowerName.endsWith(".gif")) mimeType = "image/gif";

    const typedBlob = new Blob([imageBlob], { type: mimeType });

    const page: Page = {
      id: `${chapterId}_${i}`,
      chapterId: chapterId,
      pageNumber: i,
      fileName: name.split("/").pop() || name,
      imageBlob: typedBlob,
    };

    await MangaDB.savePage(page);
  }

  return chapterId;
}

/**
 * Creates an object URL for a Page's Blob so it can be displayed in an <img> tag.
 * Make sure to revoke this URL when it's no longer needed to prevent memory leaks.
 */
export function getPageImageUrl(page: Page): string {
  return URL.createObjectURL(page.imageBlob);
}

export interface TextSegment {
  type: "text" | "furigana";
  text: string;
  kana?: string;
  id: string;
}

/**
 * Parses Japanese text syntax like 漢字[かんじ] or 任[まか] into structured segments.
 * Match characters belonging to Japanese kanji or standard iteration mark (々) followed by brackets containing kana.
 */
export function parseFurigana(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /([\u3005\u4e00-\u9faf]+)\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const matchIndex = match.index;
    
    // Push preceding text segment
    if (matchIndex > lastIndex) {
      segments.push({
        type: "text",
        text: text.slice(lastIndex, matchIndex),
        id: `txt_${lastIndex}`,
      });
    }

    // Push furigana segment
    segments.push({
      type: "furigana",
      text: match[1], // Kanji part
      kana: match[2], // Kana part
      id: `furi_${matchIndex}`,
    });

    lastIndex = regex.lastIndex;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      text: text.slice(lastIndex),
      id: `txt_${lastIndex}`,
    });
  }

  return segments;
}

/**
 * Imports a Yomitan dictionary ZIP file and saves the dictionary
 * metadata, terms, pitch accents, and metadata banks into IndexedDB.
 */
export async function importDictionary(
  file: File,
  onProgress?: (progress: DictImportProgress) => void
): Promise<string> {
  onProgress?.({
    step: "loading",
    message: "Loading ZIP file...",
    percent: 2,
  });

  const zip = new JSZip();
  let loadedZip;
  try {
    loadedZip = await zip.loadAsync(file);
  } catch (err) {
    throw new Error("Invalid ZIP file: " + (err instanceof Error ? err.message : String(err)));
  }

  onProgress?.({
    step: "loading",
    message: "Reading index.json...",
    percent: 5,
  });

  const indexFile = loadedZip.file("index.json");
  if (!indexFile) {
    throw new Error("Invalid Yomitan dictionary ZIP: missing index.json. Ensure you upload a valid Yomitan dictionary zip.");
  }

  const indexContent = await indexFile.async("string");
  const indexData = JSON.parse(indexContent);
  const dictTitle = indexData.title || file.name.replace(/\.zip$/i, "");
  const dictId = "dict_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);

  const termBankFiles: JSZip.JSZipObject[] = [];
  const accentBankFiles: JSZip.JSZipObject[] = [];
  const metaBankFiles: JSZip.JSZipObject[] = [];
  const tagBankFiles: JSZip.JSZipObject[] = [];

  loadedZip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;
    const filename = relativePath.split("/").pop() || relativePath;
    if (filename.startsWith("term_bank_") && filename.endsWith(".json")) {
      termBankFiles.push(zipEntry);
    } else if (filename.startsWith("accent_bank_") && filename.endsWith(".json")) {
      accentBankFiles.push(zipEntry);
    } else if (
      (filename.startsWith("term_meta_") || filename.startsWith("kanji_meta_")) &&
      filename.endsWith(".json")
    ) {
      metaBankFiles.push(zipEntry);
    } else if (filename.startsWith("tag_bank_") && filename.endsWith(".json")) {
      tagBankFiles.push(zipEntry);
    }
  });

  if (termBankFiles.length === 0 && accentBankFiles.length === 0 && metaBankFiles.length === 0 && tagBankFiles.length === 0) {
    throw new Error("No valid bank files (term_bank, accent_bank, term_meta, tag_bank) found in ZIP archive.");
  }

  let termCount = 0;
  let accentCount = 0;
  let metaCount = 0;
  let tagCount = 0;

  let processedFilesCount = 0;
  const totalBankFiles = termBankFiles.length + accentBankFiles.length + metaBankFiles.length + tagBankFiles.length;
  const bankFileWeight = 90 / (totalBankFiles || 1);

  // Process term banks
  for (let i = 0; i < termBankFiles.length; i++) {
    const fileIndex = processedFilesCount;
    const basePercent = Math.round(5 + fileIndex * bankFileWeight);

    onProgress?.({
      step: "parsing",
      message: `Parsing term bank ${i + 1}/${termBankFiles.length}...`,
      percent: basePercent,
    });

    const tFile = termBankFiles[i];
    const text = await tFile.async("string");
    const entries = JSON.parse(text);
    const termsToSave = [];

    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx];
      const expression = entry[0];
      const reading = entry[1];
      const definition_tags = entry[2];
      const rules = entry[3];
      const score = entry[4];
      const glossaryVal = entry[5];
      const sequence = entry[6];
      const term_tags = entry[7];

      let glossary: string[] = [];
      if (Array.isArray(glossaryVal)) {
        glossary = glossaryVal.map((g: any) => {
          if (typeof g === "string") return g;
          if (g && typeof g === "object") {
            if (g.content) {
              if (typeof g.content === "string") return g.content;
              if (Array.isArray(g.content)) return g.content.filter((c: any) => typeof c === "string").join("; ");
            }
            return JSON.stringify(g);
          }
          return String(g);
        });
      } else if (typeof glossaryVal === "string") {
        glossary = [glossaryVal];
      }

      termsToSave.push({
        id: `${dictId}_term_${termCount++}`,
        dictId,
        expression: String(expression || ""),
        reading: String(reading || ""),
        glossary,
        rules: String(rules || ""),
        score: Number(score || 0),
        sequence: Number(sequence || 0),
        termTags: String(term_tags || "")
      });
    }

    const BATCH_SIZE = 2500;
    const totalBatches = Math.ceil(termsToSave.length / BATCH_SIZE);
    
    for (let j = 0; j < termsToSave.length; j += BATCH_SIZE) {
      const chunk = termsToSave.slice(j, j + BATCH_SIZE);
      await MangaDB.saveDictionaryTerms(chunk);

      const batchIdx = j / BATCH_SIZE;
      const progressInFile = (batchIdx / totalBatches) * bankFileWeight;
      const currentPercent = Math.round(5 + fileIndex * bankFileWeight + progressInFile);

      onProgress?.({
        step: "saving",
        message: `Saving term bank ${i + 1}/${termBankFiles.length} (${termCount - termsToSave.length + j + chunk.length} terms stored)`,
        percent: currentPercent,
        processedRecords: termCount - termsToSave.length + j + chunk.length,
        totalRecords: termCount,
      });
    }
    processedFilesCount++;
  }

  // Process accent banks
  for (let i = 0; i < accentBankFiles.length; i++) {
    const fileIndex = processedFilesCount;
    const basePercent = Math.round(5 + fileIndex * bankFileWeight);

    onProgress?.({
      step: "parsing",
      message: `Parsing accent bank ${i + 1}/${accentBankFiles.length}...`,
      percent: basePercent,
    });

    const aFile = accentBankFiles[i];
    const text = await aFile.async("string");
    const entries = JSON.parse(text);
    const accentsToSave = [];

    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx];
      const expression = entry[0];
      const reading = entry[1];
      const accent_details = entry[2];

      accentsToSave.push({
        id: `${dictId}_accent_${accentCount++}`,
        dictId,
        expression: String(expression || ""),
        reading: String(reading || ""),
        accents: accent_details
      });
    }

    const BATCH_SIZE = 2500;
    const totalBatches = Math.ceil(accentsToSave.length / BATCH_SIZE);

    for (let j = 0; j < accentsToSave.length; j += BATCH_SIZE) {
      const chunk = accentsToSave.slice(j, j + BATCH_SIZE);
      await MangaDB.saveDictionaryAccents(chunk);

      const batchIdx = j / BATCH_SIZE;
      const progressInFile = (batchIdx / totalBatches) * bankFileWeight;
      const currentPercent = Math.round(5 + fileIndex * bankFileWeight + progressInFile);

      onProgress?.({
        step: "saving",
        message: `Saving accent bank ${i + 1}/${accentBankFiles.length} (${accentCount - accentsToSave.length + j + chunk.length} accents stored)`,
        percent: currentPercent,
        processedRecords: accentCount - accentsToSave.length + j + chunk.length,
        totalRecords: accentCount,
      });
    }
    processedFilesCount++;
  }

  // Process meta banks
  for (let i = 0; i < metaBankFiles.length; i++) {
    const fileIndex = processedFilesCount;
    const basePercent = Math.round(5 + fileIndex * bankFileWeight);

    onProgress?.({
      step: "parsing",
      message: `Parsing metadata bank ${i + 1}/${metaBankFiles.length}...`,
      percent: basePercent,
    });

    const mFile = metaBankFiles[i];
    const text = await mFile.async("string");
    const entries = JSON.parse(text);
    const metasToSave = [];

    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx];
      const expression = entry[0];
      const mode = entry[1];
      const value = entry[2];

      metasToSave.push({
        id: `${dictId}_meta_${metaCount++}`,
        dictId,
        expression: String(expression || ""),
        mode: String(mode || ""),
        value: typeof value === "object" ? value : String(value)
      });
    }

    const BATCH_SIZE = 2500;
    const totalBatches = Math.ceil(metasToSave.length / BATCH_SIZE);

    for (let j = 0; j < metasToSave.length; j += BATCH_SIZE) {
      const chunk = metasToSave.slice(j, j + BATCH_SIZE);
      await MangaDB.saveDictionaryMeta(chunk);

      const batchIdx = j / BATCH_SIZE;
      const progressInFile = (batchIdx / totalBatches) * bankFileWeight;
      const currentPercent = Math.round(5 + fileIndex * bankFileWeight + progressInFile);

      onProgress?.({
        step: "saving",
        message: `Saving metadata bank ${i + 1}/${metaBankFiles.length} (${metaCount - metasToSave.length + j + chunk.length} entries stored)`,
        percent: currentPercent,
        processedRecords: metaCount - metasToSave.length + j + chunk.length,
        totalRecords: metaCount,
      });
    }
    processedFilesCount++;
  }

  // Process tag banks
  for (let i = 0; i < tagBankFiles.length; i++) {
    const fileIndex = processedFilesCount;
    const basePercent = Math.round(5 + fileIndex * bankFileWeight);

    onProgress?.({
      step: "parsing",
      message: `Parsing tag bank ${i + 1}/${tagBankFiles.length}...`,
      percent: basePercent,
    });

    const tFile = tagBankFiles[i];
    const text = await tFile.async("string");
    const entries = JSON.parse(text);
    const tagsToSave = [];

    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx];
      if (!Array.isArray(entry)) continue;
      const name = entry[0];
      const category = entry[1];
      const sorting_order = entry[2];
      const notes = entry[3];
      const popularity = entry[4];

      tagsToSave.push({
        id: `${dictId}_tag_${tagCount++}`,
        dictId,
        expression: String(name || ""),
        mode: "tag",
        value: {
          category: String(category || ""),
          notes: String(notes || ""),
          order: Number(sorting_order || 0),
          popularity: Number(popularity || 0)
        }
      });
    }

    const BATCH_SIZE = 2500;
    const totalBatches = Math.ceil(tagsToSave.length / BATCH_SIZE);

    for (let j = 0; j < tagsToSave.length; j += BATCH_SIZE) {
      const chunk = tagsToSave.slice(j, j + BATCH_SIZE);
      await MangaDB.saveDictionaryMeta(chunk);

      const batchIdx = j / BATCH_SIZE;
      const progressInFile = (batchIdx / totalBatches) * bankFileWeight;
      const currentPercent = Math.round(5 + fileIndex * bankFileWeight + progressInFile);

      onProgress?.({
        step: "saving",
        message: `Saving tag bank ${i + 1}/${tagBankFiles.length} (${tagCount - tagsToSave.length + j + chunk.length} tags stored)`,
        percent: currentPercent,
        processedRecords: tagCount - tagsToSave.length + j + chunk.length,
        totalRecords: tagCount,
      });
    }
    processedFilesCount++;
  }

  onProgress?.({
    step: "saving",
    message: "Saving dictionary metadata...",
    percent: 98,
  });

  const dictMeta = {
    id: dictId,
    title: dictTitle,
    createdAt: Date.now(),
    termCount,
    accentCount,
    metaCount,
    tagCount
  };
  await MangaDB.saveDictionary(dictMeta);

  onProgress?.({
    step: "done",
    message: "Import finished successfully!",
    percent: 100,
  });

  return dictId;
}


