import { Chapter, Page, DialogueEntry, AnimeTracker } from "./types";

const DB_NAME = "MangaDialogueEditorDB";
const DB_VERSION = 4;

export function deinflectEnglish(text: string): string[] {
  const results = new Set<string>();
  if (!text) return [];

  const lower = text.toLowerCase().trim();
  if (!lower) return [];

  const add = (str: string) => {
    if (str && str.length >= 1) results.add(str);
  };

  add(lower);

  const irregulars: Record<string, string[]> = {
    running: ["run"], ran: ["run"], runs: ["run"],
    went: ["go"], gone: ["go"], going: ["go"], goes: ["go"],
    saw: ["see"], seen: ["see"], seeing: ["see"], sees: ["see"],
    came: ["come"], coming: ["come"], comes: ["come"],
    took: ["take"], taken: ["take"], taking: ["take"], takes: ["take"],
    got: ["get"], gotten: ["get"], getting: ["get"], gets: ["get"],
    made: ["make"], making: ["make"], makes: ["make"],
    said: ["say"], saying: ["say"], says: ["say"],
    thought: ["think"], thinking: ["think"], thinks: ["think"],
    bought: ["buy"], buying: ["buy"], buys: ["buy"],
    brought: ["bring"], bringing: ["bring"], brings: ["bring"],
    found: ["find"], finding: ["find"], finds: ["find"],
    knew: ["know"], known: ["know"], knowing: ["know"], knows: ["know"],
    wrote: ["write"], written: ["write"], writing: ["write"], writes: ["write"],
    drove: ["drive"], driven: ["drive"], driving: ["drive"], drives: ["drive"],
    ate: ["eat"], eaten: ["eat"], eating: ["eat"], eats: ["eat"],
    drank: ["drink"], drunk: ["drink"], drinking: ["drink"], drinks: ["drink"],
    gave: ["give"], given: ["give"], giving: ["give"], gives: ["give"],
    spoke: ["speak"], spoken: ["speak"], speaking: ["speak"], speaks: ["speak"],
    broke: ["break"], broken: ["break"], breaking: ["break"], breaks: ["break"],
    chose: ["choose"], chosen: ["choose"], choosing: ["choose"], chooses: ["choose"],
    flew: ["fly"], flown: ["fly"], flying: ["fly"], flies: ["fly"],
    fell: ["fall"], fallen: ["fall"], falling: ["fall"], falls: ["fall"],
    held: ["hold"], holding: ["hold"], holds: ["hold"],
    left: ["leave"], leaving: ["leave"], leaves: ["leave"],
    felt: ["feel"], feeling: ["feel"], feels: ["feel"],
    kept: ["keep"], keeping: ["keep"], keeps: ["keep"],
    meant: ["mean"], meaning: ["mean"], means: ["mean"],
    met: ["meet"], meeting: ["meet"], meets: ["meet"],
    paid: ["pay"], paying: ["pay"], pays: ["pay"],
    sold: ["sell"], selling: ["sell"], sells: ["sell"],
    stood: ["stand"], standing: ["stand"], stands: ["stand"],
    understood: ["understand"], understanding: ["understand"], understands: ["understand"],
    wore: ["wear"], worn: ["wear"], wearing: ["wear"], wears: ["wear"],
    won: ["win"], winning: ["win"], wins: ["win"],
    better: ["good", "well"], best: ["good", "well"],
    worse: ["bad"], worst: ["bad"],
    children: ["child"], men: ["man"], women: ["woman"],
    mice: ["mouse"], teeth: ["tooth"], feet: ["foot"], geese: ["goose"], people: ["person"]
  };

  if (irregulars[lower]) {
    irregulars[lower].forEach(i => add(i));
  }

  if (lower.endsWith("ies") && lower.length > 4) {
    add(lower.slice(0, -3) + "y");
  }
  if (lower.endsWith("es") && lower.length > 3) {
    add(lower.slice(0, -2));
    add(lower.slice(0, -1));
  }
  if (lower.endsWith("s") && !lower.endsWith("ss") && lower.length > 2) {
    add(lower.slice(0, -1));
  }
  if (lower.endsWith("ing") && lower.length > 4) {
    const stem = lower.slice(0, -3);
    add(stem);
    add(stem + "e");
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      add(stem.slice(0, -1));
    }
  }
  if (lower.endsWith("ied") && lower.length > 4) {
    add(lower.slice(0, -3) + "y");
  } else if (lower.endsWith("ed") && lower.length > 3) {
    const stem = lower.slice(0, -2);
    add(stem);
    add(stem + "e");
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      add(stem.slice(0, -1));
    }
  }
  if (lower.endsWith("ily") && lower.length > 4) {
    add(lower.slice(0, -3) + "y");
  } else if (lower.endsWith("ly") && lower.length > 3) {
    add(lower.slice(0, -2));
  }
  if (lower.endsWith("ier") && lower.length > 4) {
    add(lower.slice(0, -3) + "y");
  } else if (lower.endsWith("iest") && lower.length > 5) {
    add(lower.slice(0, -4) + "y");
  } else if (lower.endsWith("er") && lower.length > 3) {
    const stem = lower.slice(0, -2);
    add(stem);
    add(stem + "e");
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      add(stem.slice(0, -1));
    }
  } else if (lower.endsWith("est") && lower.length > 4) {
    const stem = lower.slice(0, -3);
    add(stem);
    add(stem + "e");
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      add(stem.slice(0, -1));
    }
  }

  return Array.from(results);
}

async function fetchFreeEnglishDictionary(query: string): Promise<any[]> {
  const cleanWord = query.replace(/[^a-zA-Z0-9'-]/g, "").trim().toLowerCase();
  if (!cleanWord || cleanWord.length < 2) return [];

  const wordsToTry = Array.from(new Set([cleanWord, ...deinflectEnglish(cleanWord)]));
  const results: any[] = [];

  for (const targetWord of wordsToTry) {
    if (results.length >= 3) break;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(targetWord)}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) continue;

      const data = await response.json();
      if (Array.isArray(data)) {
        data.forEach((entry: any) => {
          let phoneticText = entry.phonetic || "";
          let audioUrl = "";
          if (Array.isArray(entry.phonetics)) {
            entry.phonetics.forEach((p: any) => {
              if (!phoneticText && p.text) phoneticText = p.text;
              if (!audioUrl && p.audio) audioUrl = p.audio;
            });
          }

          const glossaryList: string[] = [];
          if (Array.isArray(entry.meanings)) {
            entry.meanings.forEach((m: any) => {
              const pos = m.partOfSpeech ? `(${m.partOfSpeech}) ` : "";
              if (Array.isArray(m.definitions)) {
                m.definitions.slice(0, 3).forEach((defObj: any) => {
                  let str = `${pos}${defObj.definition || ""}`;
                  if (defObj.example) {
                    str += ` e.g. "${defObj.example}"`;
                  }
                  glossaryList.push(str);
                });
              }
            });
          }

          if (glossaryList.length > 0) {
            results.push({
              id: `free_dict_${entry.word}_${Math.random().toString(36).substring(2, 7)}`,
              dictId: "free_dict_en",
              dictName: "English Dictionary",
              expression: entry.word,
              reading: phoneticText || entry.word,
              glossary: glossaryList,
              rules: "English",
              score: targetWord === cleanWord ? 120000 : 90000,
              audioUrl: audioUrl || ""
            });
          }
        });
      }
    } catch (e) {
      // Ignore network or timeout error
    }
  }

  return results;
}

export function deinflectJapanese(text: string): string[] {
  const results = new Set<string>();
  if (!text) return [];

  const add = (str: string) => {
    if (str && str.length >= 1) results.add(str);
  };

  // 1. Polite form: 〜ます / 〜ました / 〜ません / 〜ませんでした / 〜ましょう / 〜ませ
  if (text.endsWith("ませんでした")) {
    const stem = text.slice(0, -6);
    add(stem + "る"); add(stem + "う"); add(stem + "つ"); add(stem + "く"); add(stem + "ぐ"); add(stem + "む"); add(stem + "ぶ"); add(stem + "ぬ"); add(stem + "す");
  } else if (text.endsWith("ました") || text.endsWith("ません") || text.endsWith("ましょう")) {
    const stem = text.slice(0, -3);
    if (text.endsWith("しました")) add(text.slice(0, -4) + "する");
    add(stem + "る"); add(stem + "う"); add(stem + "つ"); add(stem + "く"); add(stem + "ぐ"); add(stem + "む"); add(stem + "ぶ"); add(stem + "ぬ"); add(stem + "す");
  } else if (text.endsWith("ます") || text.endsWith("ませ")) {
    const stem = text.slice(0, -2);
    if (text.endsWith("します")) add(text.slice(0, -3) + "する");
    add(stem + "る"); add(stem + "う"); add(stem + "つ"); add(stem + "く"); add(stem + "ぐ"); add(stem + "む"); add(stem + "ぶ"); add(stem + "ぬ"); add(stem + "す");
  }

  // 2. Auxiliary verb endings: 〜ております / 〜ています / 〜ていた / 〜ていました / 〜ている / 〜てある / 〜てください / 〜ておく / 〜てあげる / 〜てみる
  if (text.endsWith("ております") || text.endsWith("ています") || text.endsWith("ていました")) {
    const stem = text.slice(0, -5);
    add(stem);
    if (stem.endsWith("し")) add(stem.slice(0, -1) + "する");
    add(stem + "る");
  } else if (text.endsWith("ている") || text.endsWith("ていた") || text.endsWith("てください") || text.endsWith("ておく") || text.endsWith("てあげる") || text.endsWith("てみる")) {
    const stem = text.slice(0, -3);
    add(stem);
    if (stem.endsWith("し")) add(stem.slice(0, -1) + "する");
    add(stem + "る");
  }

  // 3. Te-form / Ta-form (〜て / 〜で / 〜た / 〜だ)
  if (text.endsWith("って") || text.endsWith("った")) {
    const stem = text.slice(0, -2);
    add(stem + "る"); add(stem + "つ"); add(stem + "う");
  } else if (text.endsWith("んで") || text.endsWith("んだ")) {
    const stem = text.slice(0, -2);
    add(stem + "む"); add(stem + "ぶ"); add(stem + "ぬ");
  } else if (text.endsWith("いて") || text.endsWith("いた")) {
    const stem = text.slice(0, -2);
    add(stem + "く");
  } else if (text.endsWith("いで") || text.endsWith("いだ")) {
    const stem = text.slice(0, -2);
    add(stem + "ぐ");
  } else if (text.endsWith("して") || text.endsWith("した")) {
    const stem = text.slice(0, -2);
    add(stem + "す"); add(stem + "する");
  } else if (text.endsWith("て") || text.endsWith("た")) {
    const stem = text.slice(0, -1);
    add(stem + "る");
  }

  // 4. Negative: 〜ない / 〜なかった / 〜なく / 〜なければ
  if (text.endsWith("なかった") || text.endsWith("なければ")) {
    const stem = text.slice(0, -4);
    add(stem + "い"); add(stem + "る");
  } else if (text.endsWith("ない") || text.endsWith("なく")) {
    const stem = text.slice(0, -2);
    if (text.endsWith("しない")) add(text.slice(0, -3) + "する");
    if (text.endsWith("こない")) add(text.slice(0, -3) + "くる");
    if (stem.endsWith("わ")) add(stem.slice(0, -1) + "う");
    if (stem.endsWith("か")) add(stem.slice(0, -1) + "く");
    if (stem.endsWith("が")) add(stem.slice(0, -1) + "ぐ");
    if (stem.endsWith("さ")) add(stem.slice(0, -1) + "す");
    if (stem.endsWith("た")) add(stem.slice(0, -1) + "つ");
    if (stem.endsWith("な")) add(stem.slice(0, -1) + "ぬ");
    if (stem.endsWith("ば")) add(stem.slice(0, -1) + "ぶ");
    if (stem.endsWith("ま")) add(stem.slice(0, -1) + "む");
    if (stem.endsWith("ら")) add(stem.slice(0, -1) + "る");
    add(stem + "る");
    add(stem + "い");
  }

  // 5. Adjectives: 〜く / 〜くて / 〜かった / 〜ければ / 〜さ / 〜そう
  if (text.endsWith("く") || text.endsWith("くて") || text.endsWith("かった") || text.endsWith("ければ") || text.endsWith("さ") || text.endsWith("そう")) {
    if (text.endsWith("かった") || text.endsWith("ければ")) {
      add(text.slice(0, -3) + "い");
    } else if (text.endsWith("くて") || text.endsWith("そう")) {
      add(text.slice(0, -2) + "い");
    } else if (text.endsWith("く") || text.endsWith("さ")) {
      add(text.slice(0, -1) + "い");
    }
  }

  // 6. Passive / Potential / Causative / Volitional / Conditional:
  if (text.endsWith("られる") || text.endsWith("られた") || text.endsWith("させる") || text.endsWith("させた")) {
    const stem = text.slice(0, -3);
    add(stem + "る"); add(stem + "す"); add(stem + "する");
  } else if (text.endsWith("れる") || text.endsWith("れた") || text.endsWith("せる") || text.endsWith("せた")) {
    const stem = text.slice(0, -2);
    add(stem + "る"); add(stem + "す"); add(stem + "う");
  } else if (text.endsWith("えば") || text.endsWith("けば") || text.endsWith("げば") || text.endsWith("せば") || text.endsWith("てば") || text.endsWith("ねば") || text.endsWith("べば") || text.endsWith("めば") || text.endsWith("れば")) {
    const stem = text.slice(0, -2);
    const lastChar = text.slice(-2, -1);
    const map: Record<string, string> = { え: "う", け: "く", げ: "ぐ", せ: "す", て: "つ", ね: "ぬ", べ: "ぶ", め: "む", れ: "る" };
    if (map[lastChar]) add(stem + map[lastChar]);
  }

  // 7. Na-adjective / Noun particle suffixes: 〜な / 〜に / 〜だ / 〜だった / 〜である / 〜ではない / 〜じゃない
  if (text.endsWith("ではない") || text.endsWith("じゃない")) {
    add(text.slice(0, -4));
  } else if (text.endsWith("だった") || text.endsWith("である")) {
    add(text.slice(0, -3));
  } else if (text.endsWith("な") || text.endsWith("に") || text.endsWith("だ")) {
    add(text.slice(0, -1));
  }

  return Array.from(results);
}

export class MangaDB {
  private static db: IDBDatabase | null = null;

  public static async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onblocked = () => {
        console.warn("IndexedDB open blocked by another connection");
        if (this.db) {
          this.db.close();
          this.db = null;
        }
      };

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.db = null;
        };
        this.db = db;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;

        // Chapters store
        if (!db.objectStoreNames.contains("chapters")) {
          db.createObjectStore("chapters", { keyPath: "id" });
        }

        // Pages store - key is `${chapterId}_${pageNumber}`
        if (!db.objectStoreNames.contains("pages")) {
          const pageStore = db.createObjectStore("pages", { keyPath: "id" });
          pageStore.createIndex("chapterId", "chapterId", { unique: false });
        }

        // Dialogue entries store
        if (!db.objectStoreNames.contains("entries")) {
          const entryStore = db.createObjectStore("entries", { keyPath: "id" });
          entryStore.createIndex("chapterId", "chapterId", { unique: false });
        }

        // --- NEW IN VERSION 2 ---
        // Dictionaries metadata store
        if (!db.objectStoreNames.contains("dictionaries")) {
          db.createObjectStore("dictionaries", { keyPath: "id" });
        }

        // Dictionary terms store
        if (!db.objectStoreNames.contains("dictionary_terms")) {
          const termStore = db.createObjectStore("dictionary_terms", { keyPath: "id" });
          termStore.createIndex("dictId", "dictId", { unique: false });
          termStore.createIndex("expression", "expression", { unique: false });
          termStore.createIndex("reading", "reading", { unique: false });
        }

        // Dictionary accents store
        if (!db.objectStoreNames.contains("dictionary_accents")) {
          const accentStore = db.createObjectStore("dictionary_accents", { keyPath: "id" });
          accentStore.createIndex("dictId", "dictId", { unique: false });
          accentStore.createIndex("expression", "expression", { unique: false });
          accentStore.createIndex("reading", "reading", { unique: false });
        }

        // Dictionary meta store
        if (!db.objectStoreNames.contains("dictionary_meta")) {
          const metaStore = db.createObjectStore("dictionary_meta", { keyPath: "id" });
          metaStore.createIndex("dictId", "dictId", { unique: false });
          metaStore.createIndex("expression", "expression", { unique: false });
        }

        // --- NEW IN VERSION 3 ---
        // Anki card templates store
        if (!db.objectStoreNames.contains("card_templates")) {
          db.createObjectStore("card_templates", { keyPath: "id" });
        }

        // Created cards store
        if (!db.objectStoreNames.contains("created_cards")) {
          const cardStore = db.createObjectStore("created_cards", { keyPath: "id" });
          cardStore.createIndex("templateId", "templateId", { unique: false });
        }

        // --- NEW IN VERSION 4 ---
        // Anime trackers store
        if (!db.objectStoreNames.contains("anime_trackers")) {
          db.createObjectStore("anime_trackers", { keyPath: "id" });
        }
      };
    });
  }

  // --- CHAPTERS ---

  public static async getChapters(): Promise<Chapter[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("chapters", "readonly");
      const store = transaction.objectStore("chapters");
      const request = store.getAll();

      request.onsuccess = () => {
        const chapters = request.result as Chapter[];
        // Sort by created date descending
        chapters.sort((a, b) => b.createdAt - a.createdAt);
        resolve(chapters);
      };
      request.onerror = () => reject(request.error);
    });
  }

  public static async saveChapter(chapter: Chapter): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("chapters", "readwrite");
      const store = transaction.objectStore("chapters");
      const request = store.put(chapter);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public static async deleteChapter(chapterId: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["chapters", "pages", "entries"], "readwrite");

      // Delete chapter metadata
      transaction.objectStore("chapters").delete(chapterId);

      // Delete pages associated with chapter
      const pageStore = transaction.objectStore("pages");
      const pageIndex = pageStore.index("chapterId");
      const pageCursorReq = pageIndex.openCursor(IDBKeyRange.only(chapterId));
      pageCursorReq.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Delete entries associated with chapter
      const entryStore = transaction.objectStore("entries");
      const entryIndex = entryStore.index("chapterId");
      const entryCursorReq = entryIndex.openCursor(IDBKeyRange.only(chapterId));
      entryCursorReq.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // --- PAGES ---

  public static async savePage(page: any): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("pages", "readwrite");
      const store = transaction.objectStore("pages");

      let blob: Blob;
      const rawImage = page.imageBlob || page.imageDataUrl;
      if (rawImage instanceof Blob) {
        blob = rawImage;
      } else if (typeof rawImage === "string" && rawImage.startsWith("data:")) {
        try {
          const parts = rawImage.split(",");
          const mime = parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
          const bstr = atob(parts[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          blob = new Blob([u8arr], { type: mime });
        } catch (e) {
          blob = new Blob([], { type: "image/jpeg" });
        }
      } else {
        blob = new Blob([], { type: "image/jpeg" });
      }

      const dbRecord = {
        id: page.id || `${page.chapterId}_${page.pageNumber}`,
        chapterId: page.chapterId,
        pageNumber: page.pageNumber,
        fileName: page.fileName || `page_${page.pageNumber}.jpg`,
        imageBlob: blob,
      };

      const request = store.put(dbRecord);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public static async getAllPages(): Promise<any[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("pages", "readonly");
      const store = transaction.objectStore("pages");
      const request = store.getAll();

      request.onsuccess = async () => {
        const records = request.result || [];
        const serializablePages = await Promise.all(
          records.map(async (rec: any) => {
            let dataUrl = "";
            if (rec.imageBlob instanceof Blob) {
              dataUrl = await new Promise<string>((res) => {
                const reader = new FileReader();
                reader.onloadend = () => res((reader.result as string) || "");
                reader.onerror = () => res("");
                reader.readAsDataURL(rec.imageBlob);
              });
            } else if (typeof rec.imageBlob === "string") {
              dataUrl = rec.imageBlob;
            }
            return {
              id: rec.id,
              chapterId: rec.chapterId,
              pageNumber: rec.pageNumber,
              fileName: rec.fileName,
              imageDataUrl: dataUrl,
            };
          })
        );
        resolve(serializablePages);
      };
      request.onerror = () => reject(request.error);
    });
  }

  public static async getPage(chapterId: string, pageNumber: number): Promise<Page | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("pages", "readonly");
      const store = transaction.objectStore("pages");
      const id = `${chapterId}_${pageNumber}`;
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result as Page);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  public static async getChapterPagesMeta(chapterId: string): Promise<{ pageNumber: number; fileName: string }[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("pages", "readonly");
      const store = transaction.objectStore("pages");
      const index = store.index("chapterId");
      const request = index.openCursor(IDBKeyRange.only(chapterId));
      
      const pages: { pageNumber: number; fileName: string }[] = [];
      request.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          pages.push({
            pageNumber: cursor.value.pageNumber,
            fileName: cursor.value.fileName
          });
          cursor.continue();
        } else {
          // Sort pages by pageNumber ascending
          pages.sort((a, b) => a.pageNumber - b.pageNumber);
          resolve(pages);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // --- ENTRIES (DIALOGUES) ---

  public static async getAllEntries(): Promise<DialogueEntry[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("entries", "readonly");
      const store = transaction.objectStore("entries");
      const request = store.getAll();

      request.onsuccess = () => {
        resolve((request.result || []) as DialogueEntry[]);
      };
      request.onerror = () => reject(request.error);
    });
  }

  public static async getEntries(chapterId: string): Promise<DialogueEntry[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("entries", "readonly");
      const store = transaction.objectStore("entries");
      const index = store.index("chapterId");
      const request = index.openCursor(IDBKeyRange.only(chapterId));

      const entries: DialogueEntry[] = [];
      request.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          entries.push(cursor.value as DialogueEntry);
          cursor.continue();
        } else {
          // Sort by pageNumber and then by order ascending
          entries.sort((a, b) => {
            if (a.pageNumber !== b.pageNumber) {
              return a.pageNumber - b.pageNumber;
            }
            return a.order - b.order;
          });
          resolve(entries);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  public static async saveEntry(entry: DialogueEntry): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("entries", "readwrite");
      const store = transaction.objectStore("entries");
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public static async deleteEntry(entryId: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("entries", "readwrite");
      const store = transaction.objectStore("entries");
      const request = store.delete(entryId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- GLOBAL SEARCH ---

  public static async searchAllChapters(query: string): Promise<{ chapter: Chapter; pageNumber: number; entry: DialogueEntry }[]> {
    const db = await this.init();
    const queryLower = query.toLowerCase();

    // 1. Get all chapters first
    const chapters = await this.getChapters();
    const chapterMap = new Map<string, Chapter>();
    chapters.forEach(c => chapterMap.set(c.id, c));

    return new Promise((resolve, reject) => {
      const transaction = db.transaction("entries", "readonly");
      const store = transaction.objectStore("entries");
      const request = store.openCursor();
      const results: { chapter: Chapter; pageNumber: number; entry: DialogueEntry }[] = [];

      request.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          const entry = cursor.value as DialogueEntry;
          const jpMatch = entry.japanese.toLowerCase().includes(queryLower);
          const notesMatch = entry.notes.toLowerCase().includes(queryLower);

          if (jpMatch || notesMatch) {
            const ch = chapterMap.get(entry.chapterId);
            if (ch) {
              results.push({
                chapter: ch,
                pageNumber: entry.pageNumber,
                entry
              });
            }
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // --- DICTIONARIES ---

  public static async getDictionaries(): Promise<any[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("dictionaries", "readonly");
      const store = transaction.objectStore("dictionaries");
      const request = store.getAll();

      request.onsuccess = () => {
        const list = request.result || [];
        list.sort((a, b) => b.createdAt - a.createdAt);
        resolve(list);
      };
      request.onerror = () => reject(request.error);
    });
  }

  public static async saveDictionary(dict: any): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("dictionaries", "readwrite");
      const store = transaction.objectStore("dictionaries");
      const request = store.put(dict);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public static async toggleDictionaryHidden(dictId: string): Promise<boolean> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("dictionaries", "readwrite");
      const store = transaction.objectStore("dictionaries");
      const getReq = store.get(dictId);

      getReq.onsuccess = () => {
        const dict = getReq.result;
        if (!dict) return resolve(false);
        dict.hidden = !dict.hidden;
        const putReq = store.put(dict);
        putReq.onsuccess = () => resolve(dict.hidden);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  public static async deleteDictionary(dictId: string): Promise<void> {
    const db = await this.init();

    // 1. Delete dictionary metadata record
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("dictionaries", "readwrite");
      tx.objectStore("dictionaries").delete(dictId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const stores = ["dictionary_terms", "dictionary_accents", "dictionary_meta"];

    for (const storeName of stores) {
      // Step A: Fast key-range deletion using primary key prefix `${dictId}_`
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        store.delete(IDBKeyRange.bound(`${dictId}_`, `${dictId}_\uffff`));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      // Step B: Fetch any remaining keys indexed by dictId and delete in batch transactions
      const remainingKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const index = store.index("dictId");
        const req = index.getAllKeys(IDBKeyRange.only(dictId));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      if (remainingKeys.length > 0) {
        const BATCH_SIZE = 5000;
        for (let i = 0; i < remainingKeys.length; i += BATCH_SIZE) {
          const chunk = remainingKeys.slice(i, i + BATCH_SIZE);
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            for (const key of chunk) {
              store.delete(key);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
        }
      }
    }
  }

  public static async saveDictionaryTerms(terms: any[]): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("dictionary_terms", "readwrite");
      const store = transaction.objectStore("dictionary_terms");
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      for (const term of terms) {
        store.put(term);
      }
    });
  }

  public static async saveDictionaryAccents(accents: any[]): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("dictionary_accents", "readwrite");
      const store = transaction.objectStore("dictionary_accents");
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      for (const item of accents) {
        store.put(item);
      }
    });
  }

  public static async saveDictionaryMeta(metas: any[]): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("dictionary_meta", "readwrite");
      const store = transaction.objectStore("dictionary_meta");
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      for (const item of metas) {
        store.put(item);
      }
    });
  }

  public static async lookupWord(query: string): Promise<{
    terms: any[];
    accents: any[];
    metas: any[];
  }> {
    const db = await this.init();
    const queryClean = query.trim();
    if (!queryClean) return { terms: [], accents: [], metas: [] };

    interface CandidateInfo {
      term: string;
      prefixLen: number;
      isDeinflected: boolean;
    }

    const candidateMap = new Map<string, CandidateInfo>();
    const maxLen = Math.min(15, queryClean.length);

    const toKatakana = (str: string) => str.replace(/[\u3041-\u3096]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
    const toHiragana = (str: string) => str.replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));

    const queryKata = toKatakana(queryClean);
    const queryHira = toHiragana(queryClean);

    // Generate candidate strings starting strictly at character index 0 of queryClean
    for (let len = maxLen; len >= 1; len--) {
      const prefix = queryClean.substring(0, len).trim();
      if (!prefix) continue;

      const altKanaList = new Set<string>();
      altKanaList.add(prefix);
      const kata = toKatakana(prefix);
      if (kata !== prefix) altKanaList.add(kata);
      const hira = toHiragana(prefix);
      if (hira !== prefix) altKanaList.add(hira);

      if (/[a-zA-Z]/.test(prefix)) {
        const lower = prefix.toLowerCase();
        const upper = prefix.toUpperCase();
        const title = prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase();
        altKanaList.add(lower);
        altKanaList.add(upper);
        altKanaList.add(title);
      }

      for (const p of altKanaList) {
        if (!candidateMap.has(p)) {
          candidateMap.set(p, { term: p, prefixLen: len, isDeinflected: false });
        }

        const deinflections = deinflectJapanese(p);
        for (const d of deinflections) {
          if (d && d !== p && !candidateMap.has(d)) {
            candidateMap.set(d, { term: d, prefixLen: len, isDeinflected: true });
          }
        }

        if (/[a-zA-Z]/.test(p)) {
          const engDeinflections = deinflectEnglish(p);
          for (const d of engDeinflections) {
            if (d && d !== p && !candidateMap.has(d)) {
              candidateMap.set(d, { term: d, prefixLen: len, isDeinflected: true });
            }
          }
        }
      }
    }

    const hiddenDictIds = new Set<string>();
    try {
      const allDicts = await this.getDictionaries();
      for (const d of allDicts) {
        if (d.hidden) hiddenDictIds.add(d.id);
      }
    } catch (e) {
      console.error("Failed to fetch dictionary hidden status:", e);
    }

    const candidateList = Array.from(candidateMap.values());
    const rawTerms: { term: any; info: CandidateInfo; score: number }[] = [];
    const accents: any[] = [];
    const metas: any[] = [];

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        ["dictionary_terms", "dictionary_accents", "dictionary_meta"],
        "readonly"
      );

      const termStore = transaction.objectStore("dictionary_terms");
      const exprIndex = termStore.index("expression");
      const readIndex = termStore.index("reading");

      const accentStore = transaction.objectStore("dictionary_accents");
      const accExprIndex = accentStore.index("expression");
      const accReadIndex = accentStore.index("reading");

      const metaStore = transaction.objectStore("dictionary_meta");
      const metaExprIndex = metaStore.index("expression");

      for (const cand of candidateList) {
        const exprReq = exprIndex.getAll(cand.term);
        exprReq.onsuccess = () => {
          if (exprReq.result) {
            for (const item of exprReq.result) {
              let score = cand.prefixLen * 1000 + (cand.isDeinflected ? 500 : 800) + (item.expression ? item.expression.length : 0);
              if (
                item.expression === queryClean || item.reading === queryClean ||
                item.expression === queryKata || item.reading === queryKata ||
                item.expression === queryHira || item.reading === queryHira
              ) {
                score += 100000;
              } else if (cand.prefixLen === queryClean.length) {
                score += 50000;
              }
              rawTerms.push({ term: item, info: cand, score });
            }
          }
        };

        const readReq = readIndex.getAll(cand.term);
        readReq.onsuccess = () => {
          if (readReq.result) {
            for (const item of readReq.result) {
              let score = cand.prefixLen * 1000 + (cand.isDeinflected ? 400 : 700) + (item.expression ? item.expression.length : 0);
              if (
                item.expression === queryClean || item.reading === queryClean ||
                item.expression === queryKata || item.reading === queryKata ||
                item.expression === queryHira || item.reading === queryHira
              ) {
                score += 100000;
              } else if (cand.prefixLen === queryClean.length) {
                score += 50000;
              }
              rawTerms.push({ term: item, info: cand, score });
            }
          }
        };

        // Prefix range search: find words in dictionary starting with the same kanji/kana stem
        if (!cand.isDeinflected && cand.term.trim().length >= 1) {
          const range = IDBKeyRange.bound(cand.term, cand.term + "\uffff", false, false);
          
          const prefixCursorReq = exprIndex.openCursor(range);
          let count = 0;
          prefixCursorReq.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
            if (cursor && count < 30) {
              const item = cursor.value;
              if (item && item.expression && item.expression.length > cand.term.length) {
                let score = cand.prefixLen * 1000 + 200 - (item.expression.length - cand.prefixLen) * 10;
                rawTerms.push({ term: item, info: cand, score });
                count++;
              }
              cursor.continue();
            }
          };

          const readCursorReq = readIndex.openCursor(range);
          let readCount = 0;
          readCursorReq.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
            if (cursor && readCount < 15) {
              const item = cursor.value;
              if (item && item.reading && item.reading.length > cand.term.length) {
                let score = cand.prefixLen * 1000 + 150 - (item.reading.length - cand.prefixLen) * 10;
                rawTerms.push({ term: item, info: cand, score });
                readCount++;
              }
              cursor.continue();
            }
          };
        }

        const accExprReq = accExprIndex.getAll(cand.term);
        accExprReq.onsuccess = () => {
          if (accExprReq.result) accents.push(...accExprReq.result);
        };
        const accReadReq = accReadIndex.getAll(cand.term);
        accReadReq.onsuccess = () => {
          if (accReadReq.result) accents.push(...accReadReq.result);
        };

        const metaExprReq = metaExprIndex.getAll(cand.term);
        metaExprReq.onsuccess = () => {
          if (metaExprReq.result) metas.push(...metaExprReq.result);
        };
      }

      transaction.oncomplete = () => {
        const filteredRawTerms = hiddenDictIds.size > 0
          ? rawTerms.filter(rt => !rt.term.dictId || !hiddenDictIds.has(rt.term.dictId))
          : rawTerms;

        filteredRawTerms.sort((a, b) => b.score - a.score);

        const seen = new Set<string>();
        const finalTerms: any[] = [];

        for (const item of filteredRawTerms) {
          const key = item.term.id || `${item.term.expression}_${item.term.reading}`;
          if (!seen.has(key)) {
            seen.add(key);
            item.term.matchedPrefixLength = item.info.prefixLen;
            finalTerms.push(item.term);
          }
        }

        const filteredAccents = hiddenDictIds.size > 0
          ? accents.filter(a => !a.dictId || !hiddenDictIds.has(a.dictId))
          : accents;

        const filteredMetas = hiddenDictIds.size > 0
          ? metas.filter(m => !m.dictId || !hiddenDictIds.has(m.dictId))
          : metas;

        const allTags = new Set<string>();
        finalTerms.forEach(term => {
          if (term.termTags) {
            term.termTags.split(" ").forEach((tag: string) => {
              const cleanTag = tag.trim();
              if (cleanTag) allTags.add(cleanTag);
            });
          }
        });

        const fetchTagsAndResolve = async () => {
          const tagMetas: any[] = [];
          if (allTags.size > 0) {
            try {
              await new Promise<void>((resVal) => {
                const tagTx = db.transaction("dictionary_meta", "readonly");
                const tagStore = tagTx.objectStore("dictionary_meta");
                const tagExprIndex = tagStore.index("expression");
                let completedCount = 0;
                const tagList = Array.from(allTags);

                tagList.forEach(tagName => {
                  const req = tagExprIndex.getAll(tagName);
                  req.onsuccess = () => {
                    if (req.result) {
                      const filtered = req.result.filter(m => m.mode === "tag");
                      tagMetas.push(...filtered);
                    }
                    completedCount++;
                    if (completedCount === tagList.length) resVal();
                  };
                  req.onerror = () => {
                    completedCount++;
                    if (completedCount === tagList.length) resVal();
                  };
                });
              });
            } catch (err) {
              console.error("Failed to fetch tag metas:", err);
            }
          }

          if (/[a-zA-Z]/.test(queryClean)) {
            try {
              const freeApiTerms = await fetchFreeEnglishDictionary(queryClean);
              if (freeApiTerms.length > 0) {
                const existingExpressions = new Set(finalTerms.map(t => (t.expression || "").toLowerCase()));
                for (const apiTerm of freeApiTerms) {
                  if (!existingExpressions.has(apiTerm.expression.toLowerCase())) {
                    finalTerms.push(apiTerm);
                  } else {
                    const match = finalTerms.find(t => (t.expression || "").toLowerCase() === apiTerm.expression.toLowerCase());
                    if (match && !match.audioUrl && apiTerm.audioUrl) {
                      match.audioUrl = apiTerm.audioUrl;
                    }
                  }
                }
              }
            } catch (err) {
              console.error("Free English Dictionary lookup error:", err);
            }
          }

          const uniqueAccents = Array.from(new Map(filteredAccents.map(a => [a.id || `${a.expression}_${a.reading}`, a])).values());
          const uniqueMetas = Array.from(new Map([...filteredMetas, ...tagMetas].map(m => [m.id || `${m.expression}_${m.mode}`, m])).values());

          resolve({
            terms: finalTerms,
            accents: uniqueAccents,
            metas: uniqueMetas
          });
        };

        fetchTagsAndResolve();
      };

      transaction.onerror = () => reject(transaction.error);
    });
  }

  // --- CARD TEMPLATES & CREATED CARDS ---

  public static async getCardTemplates(): Promise<any[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("card_templates", "readonly");
      const store = transaction.objectStore("card_templates");
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  public static async saveCardTemplate(template: any): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("card_templates", "readwrite");
      const store = transaction.objectStore("card_templates");
      const request = store.put(template);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public static async deleteCardTemplate(templateId: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("card_templates", "readwrite");
      const store = transaction.objectStore("card_templates");
      const request = store.delete(templateId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public static async getCreatedCards(): Promise<any[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("created_cards", "readonly");
      const store = transaction.objectStore("created_cards");
      const request = store.getAll();

      request.onsuccess = () => {
        const list = request.result || [];
        list.sort((a, b) => {
          let timeA = a.createdAt;
          if (!timeA && a.id) {
            const match = String(a.id).match(/(\d+)/);
            if (match) timeA = parseInt(match[1], 10);
          }
          let timeB = b.createdAt;
          if (!timeB && b.id) {
            const match = String(b.id).match(/(\d+)/);
            if (match) timeB = parseInt(match[1], 10);
          }
          if ((timeB || 0) !== (timeA || 0)) {
            return (timeB || 0) - (timeA || 0);
          }
          return String(b.id || "").localeCompare(String(a.id || ""));
        });
        resolve(list);
      };
      request.onerror = () => reject(request.error);
    });
  }

  public static async saveCreatedCard(card: any): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("created_cards", "readwrite");
      const store = transaction.objectStore("created_cards");
      const request = store.put(card);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public static async deleteCreatedCard(cardId: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("created_cards", "readwrite");
      const store = transaction.objectStore("created_cards");
      const request = store.delete(cardId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public static async toggleCardHidden(cardId: string): Promise<boolean> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("created_cards", "readwrite");
      const store = transaction.objectStore("created_cards");
      const getReq = store.get(cardId);

      getReq.onsuccess = () => {
        const card = getReq.result;
        if (!card) return resolve(false);
        card.hidden = !card.hidden;
        const putReq = store.put(card);
        putReq.onsuccess = () => resolve(card.hidden);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  // --- ANIME TRACKERS ---

  public static async getAnimeTrackers(): Promise<AnimeTracker[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("anime_trackers", "readonly");
      const store = transaction.objectStore("anime_trackers");
      const request = store.getAll();

      request.onsuccess = () => {
        const list = (request.result || []) as AnimeTracker[];
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(list);
      };
      request.onerror = () => reject(request.error);
    });
  }

  public static async saveAnimeTracker(tracker: AnimeTracker): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("anime_trackers", "readwrite");
      const store = transaction.objectStore("anime_trackers");
      const request = store.put(tracker);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public static async deleteAnimeTracker(id: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("anime_trackers", "readwrite");
      const store = transaction.objectStore("anime_trackers");
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

