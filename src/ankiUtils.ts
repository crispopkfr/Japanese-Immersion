import JSZip from "jszip";
import initSqlJs from "sql.js";
// @ts-ignore
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { getMedia, saveMedia, dataUrlToUint8Array, fetchAndCacheMedia } from "./mediaStore";

export interface AnkiTemplate {
  id: string;
  name: string;
  fields: string[];
  qfmt?: string;
  afmt?: string;
  css?: string;
}

export interface AnkiCard {
  id: string;
  templateId: string;
  templateName?: string;
  fields: Record<string, string>;
  createdAt: number;
  hidden?: boolean;
}

export const DEFAULT_CARD_TEMPLATE: AnkiTemplate = {
  id: "subminer_card_template",
  name: "Subminer Anki Template",
  fields: [
    "Word",
    "Word Reading",
    "Word Meaning",
    "Word Furigana",
    "Word Audio",
    "Sentence",
    "Sentence Meaning",
    "Sentence Furigana",
    "Sentence Audio",
    "Notes",
    "Pitch Accent",
    "Pitch Accent Notes",
    "Frequency",
    "Picture"
  ],
  qfmt: `<div lang="ja">
{{Word}}
<div style='font-size: 30px;'>{{Sentence}}</div>
</div>`,
  afmt: `<div lang="ja">
{{furigana:Word Furigana}}


{{#Pitch Accent}}
	<br><div style='font-size: 24px'>{{Pitch Accent}}</div>
{{/Pitch Accent}} 


<div style='font-size: 25px; padding-bottom:20px'>{{Word Meaning}}</div>
<div style='font-size: 25px;'>{{furigana:Sentence Furigana}}</div>
<div style='font-size: 25px; padding-bottom:10px'>{{Sentence Meaning}}</div>

{{Word Audio}}
{{Sentence Audio}}
<br>
{{Picture}}

{{#Notes}}
	<br>
	<div style="font-size: 20px; padding-top:12px">Note: {{Notes}}</div>
{{/Notes}}


{{#Pitch Accent Notes}}
<div style="font-size: 20px; width: fit-content; max-width:40vw; margin: auto">
	<details><summary>Pitch Accent Notes</summary>
		<br>{{Pitch Accent Notes}}
	</details>
</div>
{{/Pitch Accent Notes}}


</div>`,
  css: `html, body {
  height: 100%;
  margin: 0;
  overflow: hidden;
}

.card {
  font-family: "ヒラギノ角ゴ Pro W3", "Hiragino Kaku Gothic Pro", "Noto Sans JP", "Noto Sans CJK JP", Osaka, "メイリオ", Meiryo, "ＭＳ Ｐゴシック", "MS PGothic", "MS UI Gothic", sans-serif;
  font-size: 44px;
  text-align: center;

  height: 100vh;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;

  padding: 12px;
}

img {
  width: 300px;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  object-position: center;
  border-radius: 12px;
  display: block;
  margin: 0 auto;
}

.mobile img {
  max-width: 50vw;
}

/* Prevents the furigana from being selected */
ruby > rt {
  user-select: none;
}

/* This part defines the bold color. */
b {
  color: #72b75b;
}`
};

let sqlPromise: Promise<any> | null = null;
async function getSql() {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      // 1. Try local bundled sql-wasm.wasm asset
      try {
        const res = await fetch(sqlWasmUrl);
        if (res.ok) {
          const wasmBinary = await res.arrayBuffer();
          return await initSqlJs({ wasmBinary });
        }
      } catch (e) {
        console.warn("Failed to fetch bundled sql-wasm.wasm, trying fallback CDNs...", e);
      }

      // 2. Fallback to CDN ArrayBuffer fetches
      const cdnUrls = [
        "https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/sql-wasm.wasm",
        "https://unpkg.com/sql.js@1.8.0/dist/sql-wasm.wasm",
        "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm"
      ];

      for (const url of cdnUrls) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const wasmBinary = await res.arrayBuffer();
            return await initSqlJs({ wasmBinary });
          }
        } catch (e) {
          console.warn(`Failed fetching WASM binary from ${url}`, e);
        }
      }

      // 3. Last resort locateFile fallback
      return await initSqlJs({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/${file}`
      });
    })();
  }
  return sqlPromise;
}

/**
 * Import a .apkg file and extract the note templates (models), fields, and CSS templates.
 * Does NOT import the actual cards inside, as requested.
 */
export async function parseApkgTemplates(file: File): Promise<AnkiTemplate[]> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Anki deck archives store SQLite database under collection.anki2, anki2, or collection.anki21
  const dbFile = zip.file("collection.anki2") || zip.file("anki2") || zip.file("collection.anki21");
  if (!dbFile) {
    throw new Error("Invalid .apkg file: collection.anki2 database not found.");
  }

  const dbBuffer = await dbFile.async("uint8array");
  const SQL = await getSql();
  const db = new SQL.Database(dbBuffer);

  const stmt = db.prepare("SELECT models FROM col LIMIT 1");
  if (!stmt.step()) {
    throw new Error("No collection model data found in .apkg database.");
  }

  const row = stmt.getAsObject();
  stmt.free();
  db.close();

  if (!row.models) {
    throw new Error("No model templates found in .apkg file.");
  }

  let modelsObj: Record<string, any> = {};
  try {
    modelsObj = typeof row.models === "string" ? JSON.parse(row.models) : row.models;
  } catch (err) {
    throw new Error("Failed to parse model templates from .apkg file.");
  }

  const extractedTemplates: AnkiTemplate[] = [];

  for (const key of Object.keys(modelsObj)) {
    const m = modelsObj[key];
    if (!m) continue;

    const name = m.name || `Model ${key}`;
    const rawFields = Array.isArray(m.flds) ? m.flds : [];
    // Sort fields by ord
    rawFields.sort((a: any, b: any) => (a.ord ?? 0) - (b.ord ?? 0));
    const fieldNames = rawFields.map((f: any) => f.name || "Field").filter(Boolean);

    const tmpls = Array.isArray(m.tmpls) ? m.tmpls : [];
    const firstTmpl = tmpls[0] || {};

    extractedTemplates.push({
      id: `apkg_model_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: name,
      fields: fieldNames.length > 0 ? fieldNames : ["Front", "Back"],
      qfmt: firstTmpl.qfmt || "{{Front}}",
      afmt: firstTmpl.afmt || "{{FrontSide}}<hr id=answer>{{Back}}",
      css: m.css || ""
    });
  }

  return extractedTemplates;
}

function sanitizeUtf8(str: string): string {
  if (!str) return "";
  let s = str.replace(/\0/g, "");
  if (typeof (s as any).toWellFormed === "function") {
    s = (s as any).toWellFormed();
  } else {
    s = s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, "");
  }
  return s;
}

function calcChecksum(str: string): number {
  const clean = str.replace(/<[^>]*>/g, "").trim();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Export cards into a valid .apkg Anki deck file.
 */
export async function exportCardsToApkg(
  deckName: string,
  template: AnkiTemplate,
  cards: AnkiCard[]
): Promise<Blob> {
  const SQL = await getSql();
  const db = new SQL.Database();

  // Create Anki SQLite schema
  db.run(`
    CREATE TABLE col (
      id integer primary key,
      crt integer,
      mod integer,
      scm integer,
      ver integer,
      dconf text,
      models text,
      decks text,
      dndts text,
      conf text,
      tags text
    );

    CREATE TABLE notes (
      id integer primary key,
      guid text,
      mid integer,
      mod integer,
      usn integer,
      tags text,
      flds text,
      sfld text,
      csum integer,
      flags integer,
      data text
    );

    CREATE TABLE cards (
      id integer primary key,
      nid integer,
      did integer,
      ord integer,
      mod integer,
      usn integer,
      type integer,
      queue integer,
      due integer,
      ivl integer,
      factor integer,
      reps integer,
      lapses integer,
      left integer,
      odue integer,
      odid integer,
      flags integer,
      data text
    );

    CREATE TABLE revlog (
      id integer primary key,
      cid integer,
      usn integer,
      ease integer,
      ivl integer,
      lastIvl integer,
      factor integer,
      time integer,
      type integer
    );

    CREATE TABLE graves (
      usn integer,
      oid integer,
      type integer
    );
  `);

  const nowSec = Math.floor(Date.now() / 1000);
  const nowMs = Date.now();
  const modelId = 1600000000000;
  const deckId = 1;

  // Build field list for Anki model JSON
  const flds = template.fields.map((fieldName, idx) => ({
    name: sanitizeUtf8(fieldName),
    ord: idx,
    sticky: false,
    rtl: false,
    font: "Arial",
    size: 20,
    media: []
  }));

  const tmpls = [
    {
      name: "Card 1",
      ord: 0,
      qfmt: sanitizeUtf8(template.qfmt || "{{Front}}"),
      afmt: sanitizeUtf8(template.afmt || "{{FrontSide}}<hr id=answer>{{Back}}"),
      bqfmt: "",
      bafmt: "",
      did: null
    }
  ];

  const modelsJson = JSON.stringify({
    [modelId]: {
      id: modelId,
      name: sanitizeUtf8(template.name || "Default Model"),
      type: 0,
      mod: nowSec,
      usn: -1,
      sortf: 0,
      did: deckId,
      tmpls: tmpls,
      flds: flds,
      css: sanitizeUtf8(template.css || ".card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }"),
      latexPre: "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
      latexPost: "\\end{document}",
      req: [[0, "all", [0]]]
    }
  });

  const decksJson = JSON.stringify({
    [deckId]: {
      id: deckId,
      mod: nowSec,
      name: sanitizeUtf8(deckName || "Default Deck"),
      usn: -1,
      lrnToday: [0, 0],
      revToday: [0, 0],
      newToday: [0, 0],
      timeToday: [0, 0],
      collapsed: false,
      browserCollapsed: false,
      desc: "",
      dyn: 0,
      conf: 1,
      extendNew: 10,
      extendRev: 50
    }
  });

  const dconfJson = JSON.stringify({
    "1": {
      "id": 1,
      "mod": nowSec,
      "name": "Default",
      "usn": -1,
      "maxTaken": 60,
      "autoplay": true,
      "timer": 0,
      "replayq": true,
      "new": {
        "bury": false,
        "delays": [1.0, 10.0],
        "initialFactor": 2500,
        "ints": [1, 4, 0],
        "order": 1,
        "perDay": 20
      },
      "rev": {
        "bury": false,
        "ease4": 1.3,
        "fuzz": 0.05,
        "ivlFct": 1.0,
        "maxIvl": 36500,
        "perDay": 200,
        "hardFactor": 1.2
      },
      "lapse": {
        "delays": [10.0],
        "mult": 0.0,
        "minInt": 1,
        "leechFails": 8,
        "leechAction": 0
      }
    }
  });

  const confJson = JSON.stringify({
    "nextPos": 1,
    "estTimes": true,
    "activeDecks": [1],
    "sortType": "noteFld",
    "timeLim": 0,
    "sortBackwards": false,
    "addToCur": true,
    "curDeck": 1,
    "newBury": true,
    "dids": [1],
    "disabledColls": []
  });

  db.run(
    `INSERT INTO col VALUES (1, ?, ?, ?, 11, ?, ?, ?, '{}', ?, '{}')`,
    [nowSec, nowSec, nowMs, dconfJson, modelsJson, decksJson, confJson]
  );

  const zip = new JSZip();
  const mediaMap: Record<string, string> = {};
  let mediaCounter = 0;

  // Insert notes and cards
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const noteId = nowMs + i;
    const cardId = nowMs + i + 100000;
    const guid = Math.random().toString(36).substring(2, 12);
    
    // Join field values in exact template.fields order separated by \x1f
    const fieldValues: string[] = [];

    for (const f of template.fields) {
      let val = card.fields[f] || "";
      if (!val) {
        fieldValues.push("");
        continue;
      }

      // 1. Check for [sound:...] or data:audio or http(s) audio
      const soundMatches = Array.from(val.matchAll(/\[sound:([^\]]+)\]/g));
      for (const match of soundMatches) {
        const rawRef = match[1].trim();
        let filename = rawRef;
        let mediaDataUrl: string | undefined = undefined;

        if (rawRef.startsWith("http://") || rawRef.startsWith("https://")) {
          const now = new Date();
          const YYYY = now.getUTCFullYear();
          const MM = String(now.getUTCMonth() + 1).padStart(2, '0');
          const DD = String(now.getUTCDate()).padStart(2, '0');
          const HH = String(now.getUTCHours()).padStart(2, '0');
          const min = String(now.getUTCMinutes()).padStart(2, '0');
          const ss = String(now.getUTCSeconds()).padStart(2, '0');
          const isoStamp = `${YYYY}${MM}${DD}T${HH}${min}${ss}`;
          const rand = Math.floor(100000 + Math.random() * 900000);
          filename = `Immersion-${isoStamp}_${Date.now()}${rand}.mp3`;
          mediaDataUrl = await fetchAndCacheMedia(filename, rawRef);
          val = val.replace(`[sound:${rawRef}]`, `[sound:${filename}]`);
        } else if (rawRef.startsWith("data:audio/")) {
          const now = new Date();
          const YYYY = now.getUTCFullYear();
          const MM = String(now.getUTCMonth() + 1).padStart(2, '0');
          const DD = String(now.getUTCDate()).padStart(2, '0');
          const HH = String(now.getUTCHours()).padStart(2, '0');
          const min = String(now.getUTCMinutes()).padStart(2, '0');
          const ss = String(now.getUTCSeconds()).padStart(2, '0');
          const isoStamp = `${YYYY}${MM}${DD}T${HH}${min}${ss}`;
          const rand = Math.floor(100000 + Math.random() * 900000);
          filename = `Immersion-${isoStamp}_${Date.now()}${rand}.mp3`;
          mediaDataUrl = rawRef;
          saveMedia(filename, mediaDataUrl);
          val = val.replace(`[sound:${rawRef}]`, `[sound:${filename}]`);
        } else {
          mediaDataUrl = getMedia(filename);
        }

        if (mediaDataUrl) {
          const u8 = dataUrlToUint8Array(mediaDataUrl);
          if (u8) {
            const idxStr = String(mediaCounter++);
            zip.file(idxStr, u8);
            mediaMap[idxStr] = filename;
          }
        }
      }

      // 2. Check for <img ... src="..."> or data:image or http(s) image
      const imgMatches = Array.from(val.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/g));
      for (const match of imgMatches) {
        const rawSrc = match[1].trim();
        let filename = rawSrc;
        let mediaDataUrl: string | undefined = undefined;

        if (rawSrc.startsWith("http://") || rawSrc.startsWith("https://")) {
          const now = new Date();
          const YYYY = now.getUTCFullYear();
          const MM = String(now.getUTCMonth() + 1).padStart(2, '0');
          const DD = String(now.getUTCDate()).padStart(2, '0');
          const HH = String(now.getUTCHours()).padStart(2, '0');
          const min = String(now.getUTCMinutes()).padStart(2, '0');
          const ss = String(now.getUTCSeconds()).padStart(2, '0');
          const isoStamp = `${YYYY}${MM}${DD}T${HH}${min}${ss}`;
          const rand = Math.floor(100000 + Math.random() * 900000);
          filename = `Immersion-${isoStamp}_${Date.now()}${rand}.jpg`;
          mediaDataUrl = await fetchAndCacheMedia(filename, rawSrc);
          val = val.replace(rawSrc, filename);
        } else if (rawSrc.startsWith("data:image/")) {
          const now = new Date();
          const YYYY = now.getUTCFullYear();
          const MM = String(now.getUTCMonth() + 1).padStart(2, '0');
          const DD = String(now.getUTCDate()).padStart(2, '0');
          const HH = String(now.getUTCHours()).padStart(2, '0');
          const min = String(now.getUTCMinutes()).padStart(2, '0');
          const ss = String(now.getUTCSeconds()).padStart(2, '0');
          const isoStamp = `${YYYY}${MM}${DD}T${HH}${min}${ss}`;
          const rand = Math.floor(100000 + Math.random() * 900000);
          filename = `Immersion-${isoStamp}_${Date.now()}${rand}.jpg`;
          mediaDataUrl = rawSrc;
          saveMedia(filename, mediaDataUrl);
          val = val.replace(rawSrc, filename);
        } else {
          mediaDataUrl = getMedia(filename);
        }

        if (mediaDataUrl) {
          const u8 = dataUrlToUint8Array(mediaDataUrl);
          if (u8) {
            const idxStr = String(mediaCounter++);
            zip.file(idxStr, u8);
            mediaMap[idxStr] = filename;
          }
        }
      }

      fieldValues.push(sanitizeUtf8(val));
    }

    const fldsStr = fieldValues.join("\u001f");
    const sfldStr = fieldValues[0] || "";
    const csumVal = calcChecksum(sfldStr);

    db.run(
      `INSERT INTO notes VALUES (?, ?, ?, ?, -1, '', ?, ?, ?, 0, '')`,
      [noteId, guid, modelId, nowSec, fldsStr, sfldStr, csumVal]
    );

    db.run(
      `INSERT INTO cards VALUES (?, ?, ?, 0, ?, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '')`,
      [cardId, noteId, deckId, nowSec]
    );
  }

  const binaryDb = db.export();
  db.close();

  zip.file("collection.anki2", binaryDb);

  // Encode media mapping JSON explicitly as UTF-8 Uint8Array to avoid truncation or non-UTF8 zip string issues
  const mediaJson = JSON.stringify(mediaMap);
  const mediaUtf8Bytes = new TextEncoder().encode(mediaJson);
  zip.file("media", mediaUtf8Bytes);

  const zipBlob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/apkg",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
  return zipBlob;
}
