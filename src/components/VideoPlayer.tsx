import React, { useState, useEffect, useRef } from "react";
import { MangaDB } from "../db";
import { AnkiCard, DEFAULT_CARD_TEMPLATE } from "../ankiUtils";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  Volume2,
  Upload,
  Search,
  ArrowLeft,
  X,
  Plus,
  Minus,
  Check,
  BookOpen,
  VolumeX,
  Maximize2,
  Languages,
  Trash2,
  Clock,
  Copy
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { importDictionary } from "../utils";
import { CardCreationPanel } from "./CardCreationPanel";
import { StatsPanel, WatchStatsData, getTodayDateString } from "./StatsPanel";
import { AnimeTrackerPanel } from "./AnimeTrackerPanel";
import { SettingsPanel } from "./SettingsPanel";
import { AudioPreviewPlayer } from "./AudioPreviewPlayer";
import { InstallAppButton } from "./InstallAppButton";
import { saveMedia, resolveMediaSrc, fetchAndCacheMedia, getMediaAsync, deleteMedia } from "../mediaStore";

// --- HELPERS FROM CHAPTER EDITOR ---
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
    console.error("Audio pronunciation failed:", err);
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
    if (val.displayValue !== undefined) {
      return getDisplayMetaValue(val.displayValue);
    }
    if (val.frequency !== undefined) {
      return getDisplayMetaValue(val.frequency);
    }
    if (val.value !== undefined) {
      return getDisplayMetaValue(val.value);
    }
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

function extractFrequencyNumber(metas: any[], expression: string, reading?: string): string {
  if (!metas || !Array.isArray(metas) || metas.length === 0) return "";

  const expr = (expression || "").trim();
  const read = (reading || expr).trim();

  if (!expr && !read) return "";

  const parseDigits = (val: any, targetReading?: string, targetExpr?: string): string => {
    if (val === null || val === undefined) return "";

    if (typeof val === "number") {
      return String(val);
    }

    if (typeof val === "string") {
      const match = val.trim().match(/\d+/);
      return match ? match[0] : "";
    }

    if (Array.isArray(val)) {
      for (const item of val) {
        const d = parseDigits(item, targetReading, targetExpr);
        if (d) return d;
      }
      return "";
    }

    if (typeof val === "object") {
      if (val.reading && typeof val.reading === "string") {
        const r = val.reading.trim();
        if (targetReading && r !== targetReading && targetExpr && r !== targetExpr) {
          return "";
        }
      }

      const priorityProps = [
        val.frequency,
        val.displayValue,
        val.rank,
        val.count,
        val.value,
        val.freq,
        val.order
      ];

      for (const prop of priorityProps) {
        if (prop !== undefined && prop !== null) {
          const d = parseDigits(prop, targetReading, targetExpr);
          if (d) return d;
        }
      }

      for (const key of Object.keys(val)) {
        if (key === "reading") continue;
        const d = parseDigits(val[key], targetReading, targetExpr);
        if (d) return d;
      }
    }

    return "";
  };

  const matching = metas.filter((m: any) => {
    if (!m) return false;
    const mExpr = String(m.expression || "").trim();
    if (!mExpr) return false;

    const mode = String(m.mode || "").toLowerCase();
    if (mode === "tag" || mode === "pitch" || mode.includes("audio")) return false;

    return mExpr === expr || mExpr === read;
  });

  if (matching.length === 0) return "";

  for (const m of matching) {
    const mode = String(m.mode || "").toLowerCase();
    if (
      mode.includes("freq") ||
      mode.includes("rank") ||
      mode.includes("count") ||
      mode.includes("occur") ||
      mode.includes("stat")
    ) {
      const digits = parseDigits(m.value, read, expr);
      if (digits) return digits;
    }
  }

  for (const m of matching) {
    const digits = parseDigits(m.value, read, expr);
    if (digits) return digits;
  }

  return "";
}

function PitchAccentVisualizer({ reading, accent }: { reading: any; accent: any; key?: any }) {
  const moras = splitIntoMoras(reading);
  const N = moras.length;
  if (N === 0) return null;
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

  const particleIsHigh = A === 0;

  const getPitchTypeName = (acc: number, len: number) => {
    if (acc === 0) return "平板 Heiban";
    if (acc === 1) return "頭高 Atamadaka";
    if (acc === len) return "尾高 Odaka";
    return `中高 Nakadaka [${acc}]`;
  };

  const step = 35;
  const startX = 16;
  const width = step * N + 32;
  const height = 75;

  const points = [];
  for (let i = 0; i < N; i++) {
    points.push({
      x: startX + step * i,
      y: pitches[i] ? 5 : 30,
      mora: moras[i],
      isParticle: false,
    });
  }
  points.push({
    x: startX + step * N,
    y: particleIsHigh ? 5 : 30,
    mora: "",
    isParticle: true,
  });

  return (
    <div className="inline-flex flex-col items-start gap-1 py-1 font-sans text-[10px]">
      <div className="flex items-center gap-2 select-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 0 ${width} ${height}`}
          style={{ height: "45px", width: `${width * 0.6}px` }}
          className="text-zinc-100 fill-zinc-100 stroke-zinc-100"
        >
          {/* Connecting lines */}
          {points.map((pt, idx) => {
            if (idx === points.length - 1) return null;
            const nextPt = points[idx + 1];
            return (
              <line
                key={`line-${idx}`}
                x1={pt.x}
                y1={pt.y}
                x2={nextPt.x}
                y2={nextPt.y}
                stroke="currentColor"
                strokeWidth="1.5"
              />
            );
          })}

          {/* Dots/Circles */}
          {points.map((pt, idx) => {
            if (pt.isParticle) {
              return (
                <circle
                  key={`circle-${idx}`}
                  r="4"
                  cx={pt.x}
                  cy={pt.y}
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                />
              );
            }
            return (
              <circle
                key={`circle-${idx}`}
                r="5"
                cx={pt.x}
                cy={pt.y}
                fill="currentColor"
              />
            );
          })}

          {/* Texts */}
          {points.map((pt, idx) => {
            if (pt.isParticle) return null;
            return (
              <text
                key={`text-${idx}`}
                x={pt.x}
                y="67.5"
                fontSize="20"
                fontFamily="sans-serif"
                fill="currentColor"
                textAnchor="middle"
              >
                {pt.mora}
              </text>
            );
          })}
        </svg>

        <CollapsibleBadge
          label={getPitchTypeName(A, N)}
          className="ml-2 text-[9px] font-bold text-zinc-500 uppercase self-center tracking-wider cursor-pointer select-none"
        />
      </div>
    </div>
  );
}

function captureVideoFramePng(videoEl: HTMLVideoElement | null): string {
  if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return "";
  try {
    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      return `<img src="${dataUrl}">`;
    }
  } catch (err) {
    console.error("Failed to capture video frame screenshot:", err);
  }
  return "";
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const outBuffer = new ArrayBuffer(length);
  const view = new DataView(outBuffer);
  const channels: Float32Array[] = [];
  let sample = 0;
  let offset = 0;
  let pos = 0;

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8);
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt "
  setUint32(16);
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);
  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([outBuffer], { type: "audio/wav" });
}

async function extractAudioSegment(
  videoUrl: string | null,
  startTime: number,
  endTime: number
): Promise<string> {
  if (!videoUrl || endTime <= startTime) return "";
  try {
    const response = await fetch(videoUrl);
    const arrayBuffer = await response.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return "";
    const audioCtx = new AudioCtx();
    const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const sampleRate = decodedBuffer.sampleRate;
    const startSample = Math.floor(Math.max(0, startTime) * sampleRate);
    const endSample = Math.min(decodedBuffer.length, Math.ceil(endTime * sampleRate));
    const frameCount = Math.max(1, endSample - startSample);

    const numberOfChannels = decodedBuffer.numberOfChannels;
    const slicedBuffer = audioCtx.createBuffer(numberOfChannels, frameCount, sampleRate);

    for (let c = 0; c < numberOfChannels; c++) {
      const sourceData = decodedBuffer.getChannelData(c);
      const destData = slicedBuffer.getChannelData(c);
      destData.set(sourceData.subarray(startSample, endSample));
    }

    const wavBlob = audioBufferToWavBlob(slicedBuffer);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        resolve(`<audio controls src="${dataUrl}"></audio>`);
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(wavBlob);
    });
  } catch (err) {
    console.error("Audio extraction failed:", err);
    return "";
  }
}

function generatePitchAccentSvgCode(reading: string, accent: number): string {
  const moras = splitIntoMoras(reading || "");
  const N = moras.length;
  if (N === 0) return "";
  const A = Number(accent);

  const pitches = new Array(N).fill(false);
  if (A === 0) {
    for (let i = 1; i < N; i++) pitches[i] = true;
  } else if (A === 1) {
    pitches[0] = true;
  } else if (A > 1) {
    for (let i = 1; i < Math.min(A, N); i++) pitches[i] = true;
  }

  const particleIsHigh = A === 0;

  const getPitchTypeName = (acc: number, len: number) => {
    if (acc === 0) return "平板 Heiban";
    if (acc === 1) return "頭高 Atamadaka";
    if (acc === len) return "尾高 Odaka";
    return `中高 Nakadaka [${acc}]`;
  };

  const step = 35;
  const startX = 16;
  const width = step * N + 32;
  const height = 75;

  const points = [];
  for (let i = 0; i < N; i++) {
    points.push({
      x: startX + step * i,
      y: pitches[i] ? 5 : 30,
      mora: moras[i],
      isParticle: false,
    });
  }
  points.push({
    x: startX + step * N,
    y: particleIsHigh ? 5 : 30,
    mora: "",
    isParticle: true,
  });

  const lines = points
    .map((pt, idx) => {
      if (idx === points.length - 1) return "";
      const nextPt = points[idx + 1];
      return `<line x1="${pt.x}" y1="${pt.y}" x2="${nextPt.x}" y2="${nextPt.y}" stroke="currentColor" stroke-width="1.5"/>`;
    })
    .join("");

  const circles = points
    .map((pt) => {
      if (pt.isParticle) {
        return `<circle r="4" cx="${pt.x}" cy="${pt.y}" stroke="currentColor" stroke-width="2" fill="none"/>`;
      }
      return `<circle r="5" cx="${pt.x}" cy="${pt.y}" fill="currentColor"/>`;
    })
    .join("");

  const texts = points
    .map((pt) => {
      if (pt.isParticle) return "";
      return `<text x="${pt.x}" y="67.5" font-size="20" font-family="sans-serif" fill="currentColor" text-anchor="middle">${pt.mora}</text>`;
    })
    .join("");

  const pitchTypeName = getPitchTypeName(A, N);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="height:45px;width:${width * 0.6}px;" fill="currentColor" stroke="currentColor">${lines}${circles}${texts}</svg>`;
}

function generateRubySegments(expression: string, reading: string) {
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

  function match(partIdx: number, readingIdx: number): any[] | null {
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

function formatWordFurigana(expression: string, reading: string): string {
  if (!expression) return "";
  if (!reading || reading === expression) return expression;

  const segments = generateRubySegments(expression, reading);
  let result = "";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.ruby) {
      const prefix = result.length > 0 ? " " : "";
      result += `${prefix}${seg.text}[${seg.ruby}]`;
    } else {
      result += seg.text;
    }
  }

  return result;
}

function TermRuby({ expression, reading, className = "" }: { expression: string; reading?: string; className?: string }) {
  if (!reading || reading === expression) {
    return <span className={className}>{expression}</span>;
  }

  const segments = generateRubySegments(expression, reading);

  return (
    <span className={`${className} inline-flex flex-wrap items-baseline`}>
      {segments.map((seg: any, idx: number) => {
        if (seg.ruby) {
          return (
            <ruby key={idx} className="ruby-position-over leading-none">
              {seg.text}
              <rt className="text-[10px] text-zinc-400 font-sans font-normal tracking-wide pb-1 select-none">
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

function CollapsibleBadge({ label, className, isFullscreenLookup }: { label: string; className?: string; isFullscreenLookup?: boolean; key?: React.Key }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const displayText = isExpanded ? label : (label.length > 0 ? label.charAt(0) : "");
  const bgClass = "bg-zinc-800 hover:bg-zinc-700";

  return (
    <span
      onClick={handleClick}
      className={className || `text-[9px] font-mono ${bgClass} text-zinc-400 px-1.5 py-0.5 rounded font-semibold uppercase cursor-pointer select-none transition-colors`}
      title={isExpanded ? "Click to collapse" : `Click to expand: ${label}`}
    >
      {displayText}
    </span>
  );
}

// --- SUBTITLE INTERFACES & PARSER ---
export interface SubtitleLine {
  id: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
  text: string;
}

export interface CachedVideo {
  id: string;
  videoName: string;
  subFileName: string;
  subtitles: SubtitleLine[];
  lastTime: number;
  addedAt: number;
}

function parseTimeToSeconds(timeStr: string | undefined | null): number {
  if (!timeStr || typeof timeStr !== "string") return NaN;
  const firstWord = timeStr.trim().split(/\s+/)[0] || "";
  const cleanStr = firstWord.replace(",", ".");
  if (!cleanStr) return NaN;

  const parts = cleanStr.split(":");
  let hours = 0;
  let minutes = 0;
  let secondsAndMs = 0;

  if (parts.length === 3) {
    hours = parseFloat(parts[0]);
    minutes = parseFloat(parts[1]);
    secondsAndMs = parseFloat(parts[2]);
  } else if (parts.length === 2) {
    minutes = parseFloat(parts[0]);
    secondsAndMs = parseFloat(parts[1]);
  } else if (parts.length === 1) {
    secondsAndMs = parseFloat(parts[0]);
  } else {
    return NaN;
  }

  if (isNaN(hours) || isNaN(minutes) || isNaN(secondsAndMs)) return NaN;

  return hours * 3600 + minutes * 60 + secondsAndMs;
}

export function cleanSubText(text: string | undefined | null): string {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/\{[^\}]*\}/g, "") // removes ASS/SSA formatting tags such as {\an8}, {\pos(...)}, {\b1}, etc.
    .replace(/<[^>]+>/g, "")    // removes HTML/VTT/SRT formatting tags like <i>, <b>, <font...>
    .replace(/\\[Nnh]/g, " ")    // replaces ASS line breaks \N, \n, \h with spaces
    .replace(/\s+/g, " ")        // collapses multiple spaces
    .trim();
}

export function formatLrcTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds % 1) * 100);

  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  const xx = String(hundredths).padStart(2, "0");

  return `[${mm}:${ss}.${xx}]`;
}

export function formatSrtTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  const hh = String(hours).padStart(2, "0");
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  const mmm = String(millis).padStart(3, "0");

  return `${hh}:${mm}:${ss},${mmm}`;
}

export function parseASSSubtitles(text: string): SubtitleLine[] {
  if (!text || typeof text !== "string") return [];
  const subs: SubtitleLine[] = [];
  const lines = text.split("\n");
  let formatFields: string[] = ["layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"]; // defaults
  let idCounter = 0;

  for (const line of lines) {
    try {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.toLowerCase().startsWith("format:")) {
        const formatContent = trimmed.substring(7).trim();
        if (formatContent) {
          formatFields = formatContent.split(",").map(f => f.trim().toLowerCase());
        }
      } else if (trimmed.toLowerCase().startsWith("dialogue:") || trimmed.toLowerCase().startsWith("comment:")) {
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx === -1) continue;
        const dialogueContent = trimmed.substring(colonIdx + 1).trim();
        
        const numFields = formatFields.length;
        const fields: string[] = [];
        let remaining = dialogueContent;
        
        for (let i = 0; i < numFields - 1; i++) {
          const commaIdx = remaining.indexOf(",");
          if (commaIdx === -1) {
            break;
          }
          fields.push(remaining.substring(0, commaIdx).trim());
          remaining = remaining.substring(commaIdx + 1);
        }
        fields.push(remaining); // The rest is the Text field
        
        let startStr = "";
        let endStr = "";
        let textStr = "";
        
        for (let i = 0; i < fields.length; i++) {
          const fieldName = formatFields[i];
          if (fieldName === "start") {
            startStr = fields[i];
          } else if (fieldName === "end") {
            endStr = fields[i];
          } else if (fieldName === "text") {
            textStr = fields[i];
          }
        }
        
        // Fallback if not mapped correctly
        if (!startStr && fields.length > 1) startStr = fields[1];
        if (!endStr && fields.length > 2) endStr = fields[2];
        if (!textStr && fields.length > 0) textStr = fields[fields.length - 1];
        
        if (startStr && endStr && textStr) {
          const startTime = parseTimeToSeconds(startStr);
          const endTime = parseTimeToSeconds(endStr);
          
          let cleanText = cleanSubText(textStr);
            
          if (!isNaN(startTime) && !isNaN(endTime) && cleanText) {
            subs.push({
              id: `ass_sub_${idCounter++}`,
              startTime,
              endTime,
              text: cleanText,
            });
          }
        }
      }
    } catch (e) {
      // Safe skip corrupted line
    }
  }
  return subs;
}

export function parseSubtitles(rawText: string): SubtitleLine[] {
  if (!rawText || typeof rawText !== "string") return [];
  const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  
  // Auto-detect ASS subtitles
  if (text.includes("[Events]") || text.includes("Dialogue:") || text.includes("Format:")) {
    return parseASSSubtitles(text);
  }

  const subs: SubtitleLine[] = [];
  const blocks = text.split(/\n{2,}/);

  let idCounter = 0;
  for (const block of blocks) {
    try {
      const lines = block.trim().split("\n");
      if (lines.length < 2) continue;

      let timeLineIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("-->")) {
          timeLineIdx = i;
          break;
        }
      }

      if (timeLineIdx === -1) continue;

      const timeLine = lines[timeLineIdx];
      const textLines = lines.slice(timeLineIdx + 1);
      const textContent = cleanSubText(textLines.join("\n"));

      const timeParts = timeLine.split("-->");
      if (timeParts.length !== 2) continue;

      const startTime = parseTimeToSeconds(timeParts[0]);
      const endTime = parseTimeToSeconds(timeParts[1]);

      if (!isNaN(startTime) && !isNaN(endTime) && textContent) {
        subs.push({
          id: `sub_${idCounter++}`,
          startTime,
          endTime,
          text: textContent,
        });
      }
    } catch (e) {
      // Safe skip corrupted block
    }
  }

  return subs;
}

interface VideoPlayerProps {
  onBackToLibrary: () => void;
}

export default function VideoPlayer({ onBackToLibrary }: VideoPlayerProps) {
  // Video and Subtitles state
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string>("");
  const [subtitles, setSubtitles] = useState<SubtitleLine[]>([]);
  const [subFileName, setSubFileName] = useState<string>("");
  const [activeSub, setActiveSub] = useState<SubtitleLine | null>(null);
  const [pendingSeekTime, setPendingSeekTime] = useState<number | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Playback control states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedSub, setLockedSub] = useState<SubtitleLine | null>(null);

  // Search and panels
  const [subSearchQuery, setSubSearchQuery] = useState("");
  const [showDictPanel, setShowDictPanel] = useState(false);

  // Dictionaries, Card Creation, and Stats lists state
  const [showSubtitlesList, setShowSubtitlesList] = useState(false);
  const [showDictionariesList, setShowDictionariesList] = useState(false);
  const [showCardCreationList, setShowCardCreationList] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [showTrackPanel, setShowTrackPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  // Watch Time Stats State & Tracking
  const [watchStats, setWatchStats] = useState<WatchStatsData>(() => {
    try {
      const saved = localStorage.getItem("subminer_watch_stats_v1");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const lastWatchTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      lastWatchTimeRef.current = null;
      return;
    }

    lastWatchTimeRef.current = performance.now();

    const interval = setInterval(() => {
      if (!videoRef.current || videoRef.current.paused || document.hidden) {
        lastWatchTimeRef.current = null;
        return;
      }

      const now = performance.now();
      if (lastWatchTimeRef.current !== null) {
        const deltaSec = (now - lastWatchTimeRef.current) / 1000;
        if (deltaSec > 0 && deltaSec < 3) {
          const dateNow = new Date();
          const todayKey = getTodayDateString(dateNow);
          const hourKey = `${todayKey}_H${String(dateNow.getHours()).padStart(2, "0")}`;
          setWatchStats((prev) => {
            const currentSec = prev[todayKey] || 0;
            const currentHourSec = prev[hourKey] || 0;
            const updated = {
              ...prev,
              [todayKey]: currentSec + deltaSec,
              [hourKey]: currentHourSec + deltaSec,
            };
            localStorage.setItem("subminer_watch_stats_v1", JSON.stringify(updated));
            return updated;
          });
        }
      }
      lastWatchTimeRef.current = now;
    }, 1000);

    return () => {
      clearInterval(interval);
      lastWatchTimeRef.current = null;
    };
  }, [isPlaying]);

  const handleResetWatchStats = () => {
    setWatchStats({});
    localStorage.removeItem("subminer_watch_stats_v1");
  };

  const handleAddManualMinutes = (mins: number) => {
    const dateNow = new Date();
    const todayKey = getTodayDateString(dateNow);
    const hourKey = `${todayKey}_H${String(dateNow.getHours()).padStart(2, "0")}`;
    setWatchStats((prev) => {
      const currentSec = prev[todayKey] || 0;
      const currentHourSec = prev[hourKey] || 0;
      const addedSec = mins * 60;
      const updated = {
        ...prev,
        [todayKey]: currentSec + addedSec,
        [hourKey]: currentHourSec + addedSec,
      };
      localStorage.setItem("subminer_watch_stats_v1", JSON.stringify(updated));
      return updated;
    });
  };
  const [dictionaries, setDictionaries] = useState<any[]>([]);
  const [isImportingDict, setIsImportingDict] = useState(false);
  const [dictImportProgress, setDictImportProgress] = useState<any>(null);
  const [dictImportError, setDictImportError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingDictId, setDeletingDictId] = useState<string | null>(null);
  const [deleteProgress, setDeleteProgress] = useState<number>(0);
  const [importingDictName, setImportingDictName] = useState<string | null>(null);

  // Favorites state
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("subminer_favorite_subtitles");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("subminer_favorite_subtitles", JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (subId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) =>
      prev.includes(subId) ? prev.filter((id) => id !== subId) : [...prev, subId]
    );
  };

  const alignSubtitleWithCurrentTime = (clickedSub: SubtitleLine) => {
    if (subtitles.length === 0) return;
    const offset = currentTime - clickedSub.startTime;
    if (Math.abs(offset) < 0.01) return;

    const updated = subtitles.map((sub) => ({
      ...sub,
      startTime: Math.max(0, sub.startTime + offset),
      endTime: Math.max(0, sub.endTime + offset)
    }));

    setSubtitles(updated);
    
    if (lockedSub) {
      const updatedLocked = updated.find((s) => s.id === lockedSub.id);
      if (updatedLocked) {
        setLockedSub(updatedLocked);
      }
    }

    saveToCache(videoName, subFileName, updated);
  };

  const loadDictionaries = async () => {
    try {
      const list = await MangaDB.getDictionaries();
      setDictionaries(list);
    } catch (err) {
      console.error("Failed to load dictionaries:", err);
    }
  };

  useEffect(() => {
    loadDictionaries();
  }, []);

  const handleDeleteDictionary = async (dictId: string) => {
    setDeletingDictId(dictId);
    setDeleteProgress(30);

    try {
      setDeleteProgress(60);
      await MangaDB.deleteDictionary(dictId);
      setDeleteProgress(100);
      await loadDictionaries();
    } catch (err) {
      console.error("Failed to delete dictionary:", err);
    } finally {
      setConfirmingDeleteId(null);
      setDeletingDictId(null);
      setDeleteProgress(0);
    }
  };

  const handleDictFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setDictImportError("Please upload a valid Yomitan ZIP dictionary file.");
      return;
    }

    setIsImportingDict(true);
    setImportingDictName(file.name.replace(/\.zip$/i, ""));
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
      setImportingDictName(null);
    } catch (err) {
      console.error("Dictionary import failed:", err);
      setDictImportError(
        err instanceof Error ? err.message : "Failed to import dictionary."
      );
      setIsImportingDict(false);
      setDictImportProgress(null);
      setImportingDictName(null);
    }
  };

  const onDictFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleDictFileUpload(e.target.files[0]);
    }
  };

  const toggleSubtitlesList = () => {
    setShowSubtitlesList((prev) => !prev);
    setShowDictionariesList(false);
    setShowCardCreationList(false);
    setShowStatsPanel(false);
    setShowTrackPanel(false);
    setShowSettingsPanel(false);
    setShowDictPanel(false);
  };

  const toggleDictionariesList = () => {
    setShowDictionariesList((prev) => !prev);
    setShowSubtitlesList(false);
    setShowCardCreationList(false);
    setShowStatsPanel(false);
    setShowTrackPanel(false);
    setShowSettingsPanel(false);
    setShowDictPanel(false);
  };

  const toggleCardCreationList = () => {
    setShowCardCreationList((prev) => !prev);
    setShowSubtitlesList(false);
    setShowDictionariesList(false);
    setShowStatsPanel(false);
    setShowTrackPanel(false);
    setShowSettingsPanel(false);
    setShowDictPanel(false);
  };

  const toggleStatsPanel = () => {
    setShowStatsPanel((prev) => !prev);
    setShowSubtitlesList(false);
    setShowDictionariesList(false);
    setShowCardCreationList(false);
    setShowTrackPanel(false);
    setShowSettingsPanel(false);
    setShowDictPanel(false);
  };

  const toggleTrackPanel = () => {
    setShowTrackPanel((prev) => !prev);
    setShowSubtitlesList(false);
    setShowDictionariesList(false);
    setShowCardCreationList(false);
    setShowStatsPanel(false);
    setShowSettingsPanel(false);
    setShowDictPanel(false);
  };

  const toggleSettingsPanel = () => {
    setShowSettingsPanel((prev) => !prev);
    setShowSubtitlesList(false);
    setShowDictionariesList(false);
    setShowCardCreationList(false);
    setShowStatsPanel(false);
    setShowTrackPanel(false);
    setShowDictPanel(false);
  };

  // Lookup state
  const [selectedSubText, setSelectedSubText] = useState<string>("");
  const [lookupStartIndex, setLookupStartIndex] = useState<number>(0);
  const [lookupEndIndex, setLookupEndIndex] = useState<number>(0);
  const [lookupResults, setLookupResults] = useState<{
    terms: any[];
    accents: any[];
    metas: any[];
  } | null>(null);
  const [isSearchingDict, setIsSearchingDict] = useState(false);

  // Video cache list state
  const [cachedVideos, setCachedVideos] = useState<CachedVideo[]>([]);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenCardEditor, setShowFullscreenCardEditor] = useState<boolean>(false);
  const [showFullscreenLines, setShowFullscreenLines] = useState<boolean>(false);
  const [fullscreenCardFields, setFullscreenCardFields] = useState<Record<string, string>>({});
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);
  const [recordingProgress, setRecordingProgress] = useState<number>(0);
  const [isManualRecording, setIsManualRecording] = useState<boolean>(false);
  const manualRecorderRef = useRef<{
    mediaRecorder: MediaRecorder | null;
    chunks: Blob[];
    capturedStream: any;
    startTime: number;
  } | null>(null);
  const [isImportingWordAudio, setIsImportingWordAudio] = useState<boolean>(false);
  const [wordAudioProgress, setWordAudioProgress] = useState<number>(0);

  const handleStartManualRecord = () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    setIsManualRecording(true);

    const chunks: Blob[] = [];
    let mediaRecorder: MediaRecorder | null = null;
    let capturedStream: any = null;

    try {
      const stream = (videoEl as any).captureStream
        ? (videoEl as any).captureStream()
        : (videoEl as any).mozCaptureStream
        ? (videoEl as any).mozCaptureStream()
        : null;
      if (stream) {
        capturedStream = stream;
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          const audioStream = new MediaStream(audioTracks);
          let options: MediaRecorderOptions | undefined = undefined;
          if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function") {
            if (MediaRecorder.isTypeSupported("audio/webm")) {
              options = { mimeType: "audio/webm" };
            } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
              options = { mimeType: "audio/mp4" };
            } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
              options = { mimeType: "audio/ogg" };
            }
          }
          mediaRecorder = options ? new MediaRecorder(audioStream, options) : new MediaRecorder(audioStream);
          mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              chunks.push(e.data);
            }
          };
          mediaRecorder.start(50);
        }
      }
    } catch (e) {
      console.warn("captureStream MediaRecorder not available for manual record:", e);
    }

    manualRecorderRef.current = {
      mediaRecorder,
      chunks,
      capturedStream,
      startTime: videoEl.currentTime,
    };

    if (videoEl.paused) {
      videoEl.play().catch((err) => console.warn("Error playing video during manual record:", err));
      setIsPlaying(true);
    }
  };

  const handleStopManualRecord = async () => {
    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.pause();
      setIsPlaying(false);
    }

    const rec = manualRecorderRef.current;
    manualRecorderRef.current = null;

    if (!rec) {
      setIsManualRecording(false);
      return;
    }

    const { mediaRecorder, chunks, capturedStream, startTime } = rec;

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      try {
        mediaRecorder.stop();
      } catch (e) {}
    }

    await new Promise((r) => setTimeout(r, 150));

    if (capturedStream) {
      try {
        capturedStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      } catch (e) {}
    }

    const now = new Date();
    const YYYY = now.getUTCFullYear();
    const MM = String(now.getUTCMonth() + 1).padStart(2, '0');
    const DD = String(now.getUTCDate()).padStart(2, '0');
    const HH = String(now.getUTCHours()).padStart(2, '0');
    const min = String(now.getUTCMinutes()).padStart(2, '0');
    const ss = String(now.getUTCSeconds()).padStart(2, '0');
    const isoStamp = `${YYYY}${MM}${DD}T${HH}${min}${ss}`;
    const randomDigits = `${Date.now()}${Math.floor(100000 + Math.random() * 900000)}`;
    const filename = `Immersion-${isoStamp}_${randomDigits}.mp3`;
    const soundCode = `[sound:${filename}]`;

    if (chunks.length > 0) {
      const mimeType = chunks[0].type || "audio/webm";
      const recordedBlob = new Blob(chunks, { type: mimeType });
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        saveMedia(filename, dataUrl);
        setFullscreenCardFields((prev) => ({
          ...prev,
          "Sentence Audio": soundCode,
        }));
        setIsManualRecording(false);
      };
      reader.readAsDataURL(recordedBlob);
    } else if (videoUrl && videoEl) {
      try {
        const endTime = videoEl.currentTime;
        const rawAudioResult = await extractAudioSegment(videoUrl, startTime, Math.max(startTime + 0.5, endTime));
        const srcMatch = rawAudioResult.match(/src="([^"]+)"/);
        if (srcMatch && srcMatch[1]) {
          saveMedia(filename, srcMatch[1]);
        }
      } catch (e) {
        console.error("Manual audio extraction fallback failed:", e);
      }
      setFullscreenCardFields((prev) => ({
        ...prev,
        "Sentence Audio": soundCode,
      }));
      setIsManualRecording(false);
    } else {
      setIsManualRecording(false);
    }
  };

  const handleRecordSentenceAudio = async (): Promise<string | undefined> => {
    const targetSub = lockedSub || activeSub || (subtitles.length > 0 ? subtitles.find(s => (currentTime - subDelay) >= s.startTime - 0.05 && (currentTime - subDelay) <= s.endTime + 0.05) : null);
    const videoEl = videoRef.current;
    if (!targetSub || !videoEl) return undefined;

    setIsRecordingAudio(true);
    setRecordingProgress(0);

    const seekTime = targetSub.startTime + subDelay + 0.01;
    videoEl.currentTime = seekTime;
    setCurrentTime(seekTime);

    const durationMs = Math.max(800, (targetSub.endTime - targetSub.startTime) * 1000);

    return new Promise<string | undefined>((resolve) => {
      let mediaRecorder: MediaRecorder | null = null;
      let capturedStream: any = null;
      const chunks: Blob[] = [];

      try {
        const stream = (videoEl as any).captureStream ? (videoEl as any).captureStream() : (videoEl as any).mozCaptureStream ? (videoEl as any).mozCaptureStream() : null;
        if (stream) {
          capturedStream = stream;
          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length > 0) {
            const audioStream = new MediaStream(audioTracks);
            let options: MediaRecorderOptions | undefined = undefined;
            if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function") {
              if (MediaRecorder.isTypeSupported("audio/webm")) {
                options = { mimeType: "audio/webm" };
              } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
                options = { mimeType: "audio/mp4" };
              } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
                options = { mimeType: "audio/ogg" };
              }
            }
            mediaRecorder = options ? new MediaRecorder(audioStream, options) : new MediaRecorder(audioStream);
            mediaRecorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) {
                chunks.push(e.data);
              }
            };
          }
        }
      } catch (e) {
        console.warn("captureStream MediaRecorder not available, falling back:", e);
      }

      let timer: any = null;
      let animFrame: number | null = null;
      let hasFinished = false;
      let hasStartedRecording = false;

      let recStartTime = performance.now();

      const updateProgress = () => {
        if (hasFinished) return;
        const totalSec = Math.max(0.5, targetSub.endTime - targetSub.startTime);
        const totalMs = totalSec * 1000;
        const wallElapsedMs = performance.now() - recStartTime;
        const videoElapsedMs = videoEl ? Math.max(0, (videoEl.currentTime - (targetSub.startTime + subDelay)) * 1000) : 0;
        const elapsedMs = Math.max(wallElapsedMs, videoElapsedMs);
        const pct = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
        setRecordingProgress(pct);

        if (!hasFinished) {
          animFrame = requestAnimationFrame(updateProgress);
        }
      };

      const startRecordingWhenPlaying = () => {
        if (hasFinished || hasStartedRecording) return;
        hasStartedRecording = true;

        if (mediaRecorder && mediaRecorder.state === "inactive") {
          try {
            mediaRecorder.start(50);
          } catch (e) {
            console.warn("Error starting MediaRecorder:", e);
          }
        }

        videoEl.addEventListener("timeupdate", checkTime);
        recStartTime = performance.now();
        animFrame = requestAnimationFrame(updateProgress);

        timer = setTimeout(() => {
          finishRecording();
        }, durationMs + 500);
      };

      const onPlaying = () => {
        videoEl.removeEventListener("playing", onPlaying);
        startRecordingWhenPlaying();
      };

      const finishRecording = async () => {
        if (hasFinished) return;
        hasFinished = true;

        if (animFrame !== null) cancelAnimationFrame(animFrame);
        videoEl.removeEventListener("playing", onPlaying);
        videoEl.removeEventListener("timeupdate", checkTime);
        if (timer) clearTimeout(timer);

        videoEl.pause();
        setIsPlaying(false);

        let soundCode = "";
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          try {
            mediaRecorder.stop();
          } catch (e) {}
        }

        await new Promise((r) => setTimeout(r, 150));

        if (capturedStream) {
          try {
            capturedStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
          } catch (e) {}
        }

        const now = new Date();
        const YYYY = now.getUTCFullYear();
        const MM = String(now.getUTCMonth() + 1).padStart(2, '0');
        const DD = String(now.getUTCDate()).padStart(2, '0');
        const HH = String(now.getUTCHours()).padStart(2, '0');
        const min = String(now.getUTCMinutes()).padStart(2, '0');
        const ss = String(now.getUTCSeconds()).padStart(2, '0');
        const isoStamp = `${YYYY}${MM}${DD}T${HH}${min}${ss}`;
        const randomDigits = `${Date.now()}${Math.floor(100000 + Math.random() * 900000)}`;
        const filename = `Immersion-${isoStamp}_${randomDigits}.mp3`;
        soundCode = `[sound:${filename}]`;

        if (chunks.length > 0) {
          const mimeType = chunks[0].type || "audio/webm";
          const recordedBlob = new Blob(chunks, { type: mimeType });
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            saveMedia(filename, dataUrl);
            setFullscreenCardFields((prev) => ({
              ...prev,
              "Sentence Audio": soundCode,
            }));
            setIsRecordingAudio(false);
            setRecordingProgress(0);
            resolve(soundCode);
          };
          reader.readAsDataURL(recordedBlob);
          return;
        } else if (videoUrl) {
          try {
            const rawAudioResult = await extractAudioSegment(videoUrl, targetSub.startTime + subDelay, targetSub.endTime + subDelay);
            const srcMatch = rawAudioResult.match(/src="([^"]+)"/);
            if (srcMatch && srcMatch[1]) {
              saveMedia(filename, srcMatch[1]);
            }
          } catch (e) {
            console.error("Audio extraction fallback failed:", e);
          }
          setFullscreenCardFields((prev) => ({
            ...prev,
            "Sentence Audio": soundCode,
          }));
          setIsRecordingAudio(false);
          setRecordingProgress(0);
          resolve(soundCode);
          return;
        }

        setIsRecordingAudio(false);
        setRecordingProgress(0);
        resolve(undefined);
      };

      const checkTime = () => {
        if (videoEl.currentTime >= targetSub.endTime + subDelay) {
          finishRecording();
        }
      };

      if (videoEl.paused) {
        videoEl.addEventListener("playing", onPlaying);
        videoEl.play().catch((err) => {
          console.error("Playback error:", err);
          videoEl.removeEventListener("playing", onPlaying);
          finishRecording();
        });
        setIsPlaying(true);
      } else {
        startRecordingWhenPlaying();
      }
    });
  };

  const handleCapturePicture = async (): Promise<string | undefined> => {
    const videoEl = videoRef.current;
    if (!videoEl) return undefined;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoEl.videoWidth || 1280;
      canvas.height = videoEl.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;

      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

      const now = new Date();
      const YYYY = now.getUTCFullYear();
      const MM = String(now.getUTCMonth() + 1).padStart(2, '0');
      const DD = String(now.getUTCDate()).padStart(2, '0');
      const HH = String(now.getUTCHours()).padStart(2, '0');
      const min = String(now.getUTCMinutes()).padStart(2, '0');
      const ss = String(now.getUTCSeconds()).padStart(2, '0');
      const isoStamp = `${YYYY}${MM}${DD}T${HH}${min}${ss}`;
      const randomDigits = `${Date.now()}${Math.floor(100000 + Math.random() * 900000)}`;
      const filename = `Immersion-${isoStamp}_${randomDigits}.jpg`;
      const imgTag = `<img src="${filename}">`;

      saveMedia(filename, dataUrl);

      setFullscreenCardFields((prev) => ({
        ...prev,
        "Picture": imgTag,
      }));

      return imgTag;
    } catch (err) {
      console.error("Failed to capture screenshot frame:", err);
      return undefined;
    }
  };

  const handleRecordWordAudio = async (overrideWord?: string, overrideReading?: string): Promise<string | undefined> => {
    const expr = overrideWord || fullscreenCardFields["Word"] || selectedSubText || "";
    const read = overrideReading || fullscreenCardFields["Word Reading"] || "";

    if (!expr && !read) return undefined;

    setIsImportingWordAudio(true);
    setWordAudioProgress(0);

    let animFrame: number | null = null;
    let hasFinished = false;
    let startTime = performance.now();
    let targetDurationMs = 2000;

    const updateProgress = () => {
      if (hasFinished) return;
      const elapsed = performance.now() - startTime;
      const pct = Math.min(99, Math.max(0, (elapsed / targetDurationMs) * 100));
      setWordAudioProgress(pct);
      animFrame = requestAnimationFrame(updateProgress);
    };

    animFrame = requestAnimationFrame(updateProgress);

    try {
      const remoteUrl = `https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kanji=${encodeURIComponent(expr)}&kana=${encodeURIComponent(read || expr)}`;
      const now = new Date();
      const YYYY = now.getUTCFullYear();
      const MM = String(now.getUTCMonth() + 1).padStart(2, '0');
      const DD = String(now.getUTCDate()).padStart(2, '0');
      const HH = String(now.getUTCHours()).padStart(2, '0');
      const min = String(now.getUTCMinutes()).padStart(2, '0');
      const ss = String(now.getUTCSeconds()).padStart(2, '0');
      const isoStamp = `${YYYY}${MM}${DD}T${HH}${min}${ss}`;
      const randomDigits = `${Date.now()}${Math.floor(100000 + Math.random() * 900000)}`;
      const filename = `Immersion-${isoStamp}_${randomDigits}.mp3`;
      const soundCode = `[sound:${filename}]`;

      const dataUrl = await fetchAndCacheMedia(filename, remoteUrl);

      if (dataUrl) {
        await new Promise<void>((resolve) => {
          const audio = new Audio(dataUrl);
          audio.onloadedmetadata = () => {
            if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
              targetDurationMs = (audio.duration + 0.3) * 1000;
            }
          };
          audio.onended = () => resolve();
          audio.onerror = () => resolve();

          audio.play().catch((e) => {
            console.warn("Audio playback issue:", e);
            resolve();
          });

          setTimeout(() => resolve(), 3500);
        });

        hasFinished = true;
        if (animFrame !== null) cancelAnimationFrame(animFrame);
        setWordAudioProgress(100);

        setFullscreenCardFields((prev) => ({
          ...prev,
          "Word Audio": soundCode,
        }));

        setIsImportingWordAudio(false);
        setWordAudioProgress(0);
        return soundCode;
      }

      hasFinished = true;
      if (animFrame !== null) cancelAnimationFrame(animFrame);
      setIsImportingWordAudio(false);
      setWordAudioProgress(0);
      return undefined;
    } catch (err) {
      console.error("Failed to record/fetch word audio:", err);
      hasFinished = true;
      if (animFrame !== null) cancelAnimationFrame(animFrame);
      setIsImportingWordAudio(false);
      setWordAudioProgress(0);
      return undefined;
    }
  };

  const handleFieldPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>, fieldName: string) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf("image") !== -1) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const dataUrl = event.target?.result as string;
              const imgTag = `<img src="${dataUrl}">`;
              setFullscreenCardFields((prev) => ({
                ...prev,
                [fieldName]: prev[fieldName] ? `${prev[fieldName]}\n${imgTag}` : imgTag,
              }));
            };
            reader.readAsDataURL(blob);
          }
          return;
        }
      }
    }
  };

  const handleCancelFullscreenCard = () => {
    setShowFullscreenCardEditor(false);
    if (isLocked) {
      setIsLocked(false);
      setLockedSub(null);
    }
    if (videoRef.current) {
      videoRef.current.play().catch(err => {
        if (err && err.name !== "AbortError") console.error(err);
      });
      setIsPlaying(true);
    }
  };

  const handleSaveFullscreenCard = async () => {
    try {
      const cardToSave: AnkiCard = {
        id: `card_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        templateId: DEFAULT_CARD_TEMPLATE.id,
        templateName: DEFAULT_CARD_TEMPLATE.name,
        fields: { ...fullscreenCardFields },
        createdAt: Date.now(),
      };

      await MangaDB.saveCreatedCard(cardToSave);
      window.dispatchEvent(new Event("subminer_card_created"));
      setShowFullscreenCardEditor(false);
      if (isLocked) {
        setIsLocked(false);
        setLockedSub(null);
      }
      if (videoRef.current) {
        videoRef.current.play().catch(err => {
          if (err && err.name !== "AbortError") console.error(err);
        });
        setIsPlaying(true);
      }
    } catch (err) {
      console.error("Failed to save card from fullscreen editor:", err);
    }
  };

  // Subtitles visibility state
  const [subsEnabled, setSubsEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("subminer_subs_enabled");
      return saved !== "false";
    } catch {
      return true;
    }
  });

  // Subtitle font size scale state
  const [subScale, setSubScale] = useState<number>(() => {
    const saved = localStorage.getItem("subminer_sub_scale");
    return saved ? parseFloat(saved) : 1;
  });
  const [subScaleStr, setSubScaleStr] = useState<string>(() => {
    const saved = localStorage.getItem("subminer_sub_scale");
    return saved || "1";
  });

  const handleSubScaleBlur = () => {
    const parsed = parseFloat(subScaleStr);
    if (isNaN(parsed) || parsed <= 0) {
      setSubScaleStr(subScale.toString());
    } else {
      setSubScale(parsed);
      setSubScaleStr(parsed.toString());
    }
  };

  // Global font size scale state
  const [globalScale, setGlobalScale] = useState<number>(() => {
    const saved = localStorage.getItem("subminer_global_font_scale");
    return saved ? parseFloat(saved) : 1;
  });
  const [globalScaleStr, setGlobalScaleStr] = useState<string>(() => {
    const saved = localStorage.getItem("subminer_global_font_scale");
    return saved || "1";
  });

  const handleGlobalScaleBlur = () => {
    const parsed = parseFloat(globalScaleStr);
    if (isNaN(parsed) || parsed <= 0) {
      setGlobalScaleStr(globalScale.toString());
    } else {
      setGlobalScale(parsed);
      setGlobalScaleStr(parsed.toString());
    }
  };

  // Subtitle height position multiplier state (starts at 1)
  const [subHeightFactor, setSubHeightFactor] = useState<number>(() => {
    const saved = localStorage.getItem("subminer_sub_height_factor");
    return saved ? parseFloat(saved) : 1;
  });
  const [subHeightFactorStr, setSubHeightFactorStr] = useState<string>(() => {
    const saved = localStorage.getItem("subminer_sub_height_factor");
    return saved || "1";
  });

  const handleSubHeightBlur = () => {
    const parsed = parseFloat(subHeightFactorStr);
    if (isNaN(parsed) || parsed <= 0) {
      setSubHeightFactorStr(subHeightFactor.toString());
    } else {
      setSubHeightFactor(parsed);
      setSubHeightFactorStr(parsed.toString());
    }
  };

  // Subtitle backdrop blur intensity state (starts at 0)
  const [subBlur, setSubBlur] = useState<number>(() => {
    const saved = localStorage.getItem("subminer_sub_blur");
    return saved ? parseFloat(saved) : 0;
  });

  // Subtitle stroke thickness state (default 2px)
  const [subStroke, setSubStroke] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("subminer_sub_stroke");
      return saved !== null ? Math.min(2.5, parseFloat(saved)) : 2;
    } catch {
      return 2;
    }
  });

  const getSubStrokeStyle = (s: number): React.CSSProperties => {
    if (s <= 0) {
      return {
        WebkitTextStroke: "0px transparent",
        textShadow: "none"
      };
    }
    return {
      WebkitTextStroke: `${s * 2}px #000000`,
      paintOrder: "stroke fill",
      WebkitPaintOrder: "stroke fill",
      strokeLinejoin: "round",
      textShadow: "0px 1px 3px rgba(0, 0, 0, 0.75)"
    };
  };
  const [subBlurStr, setSubBlurStr] = useState<string>(() => {
    const saved = localStorage.getItem("subminer_sub_blur");
    return saved || "0";
  });

  const handleSubBlurBlur = () => {
    const parsed = parseFloat(subBlurStr);
    if (isNaN(parsed) || parsed < 0) {
      setSubBlurStr(subBlur.toString());
    } else {
      setSubBlur(parsed);
      setSubBlurStr(parsed.toString());
    }
  };

  // Subtitle delay state (in seconds, can be negative or positive)
  const [subDelay, setSubDelay] = useState<number>(() => {
    const saved = localStorage.getItem("subminer_sub_delay");
    return saved ? parseFloat(saved) : 0;
  });
  const [subDelayStr, setSubDelayStr] = useState<string>(() => {
    const saved = localStorage.getItem("subminer_sub_delay");
    return saved || "0";
  });

  const changeSubDelay = (delta: number) => {
    const newDelay = Math.round((subDelay + delta) * 10) / 10;
    setSubDelay(newDelay);
    setSubDelayStr(newDelay.toString());
  };

  const renderDelayControl = () => {
    const displayVal = subDelay > 0 ? `+${subDelay.toFixed(1)}s` : `${subDelay.toFixed(1)}s`;
    return (
      <div
        className="flex items-center text-zinc-400 font-bold font-mono text-xs shrink-0 select-none bg-zinc-900/50 border-none rounded-full px-2 py-1"
        title="Subtitle delay in seconds (-/+ 0.1s)"
      >
        <button
          type="button"
          onClick={() => changeSubDelay(-0.1)}
          className="w-6 h-6 flex items-center justify-center rounded-full transition-all cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/40 font-bold border-none outline-none"
          title="Decrease delay by 0.1s"
        >
          -
        </button>
        <span className="px-1 text-center text-zinc-400 min-w-[38px] text-xs font-mono font-bold">
          {displayVal}
        </span>
        <button
          type="button"
          onClick={() => changeSubDelay(0.1)}
          className="w-6 h-6 flex items-center justify-center rounded-full transition-all cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/40 font-bold border-none outline-none"
          title="Increase delay by 0.1s"
        >
          +
        </button>
      </div>
    );
  };

  const handleSubDelayBlur = () => {
    const parsed = parseFloat(subDelayStr);
    if (isNaN(parsed)) {
      setSubDelayStr(subDelay.toString());
    } else {
      setSubDelay(parsed);
      setSubDelayStr(parsed.toString());
    }
  };

  const [copiedSubId, setCopiedSubId] = useState<string | null>(null);

  const handleCopySubText = (id: string, text: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
    setCopiedSubId(id);
    setTimeout(() => {
      setCopiedSubId((prev) => (prev === id ? null : prev));
    }, 1500);
  };

  const [addedCardId, setAddedCardId] = useState<string | null>(null);

  const handleAddCardFromTerm = async (term: any, uniqueAccents: any[] = []) => {
    const targetSub = activeSub || lockedSub || (subtitles.length > 0 ? subtitles.find(s => (currentTime - subDelay) >= s.startTime - 0.05 && (currentTime - subDelay) <= s.endTime + 0.05) : null);

    const rawGlossary = term.glossary || term.definitions || term.meanings || term.definition || "";
    const glossaryText = Array.isArray(rawGlossary)
      ? rawGlossary.map((g: any) => (typeof g === "string" ? g.trim() : String(g))).filter(Boolean).join("; ")
      : String(rawGlossary || "");

    if (isFullscreen) {
      // 0. Automatically seek to target subtitle line start time and pause video (fullscreen only) without locking
      if (targetSub) {
        setActiveSub(targetSub);
        if (videoRef.current) {
          const seekTime = targetSub.startTime + subDelay + 0.01;
          videoRef.current.currentTime = seekTime;
          setCurrentTime(seekTime);
          videoRef.current.pause();
          setIsPlaying(false);
        }
      }

      // 1. Close media controls & lookup window immediately
      closeLookup();

      // 2. Word & Word Furigana
      const expr = term.expression || "";
      const read = term.reading || "";
      const wordFurigana = formatWordFurigana(expr, read);
      const freqVal = extractFrequencyNumber(lookupResults?.metas || [], expr, read);

      // 3. Word Audio - left empty by default when card editor opens
      const wordAudioHtml = "";

      // 4. Sentence & Sentence Furigana
      const subText = targetSub ? targetSub.text : (selectedSubText || activeSub?.text || "");

      // 5. Pitch Accent SVG without badges
      const pitchAccentCode = uniqueAccents.length > 0
        ? uniqueAccents.map((a) => generatePitchAccentSvgCode(a.reading, a.accent)).filter(Boolean).join("<br/>")
        : "";

      // 6. Initial field values
      const fields: Record<string, string> = {
        "Word": expr,
        "Word Reading": "",
        "Word Meaning": glossaryText,
        "Word Furigana": wordFurigana,
        "Word Audio": wordAudioHtml,
        "Sentence": subText,
        "Sentence Meaning": "",
        "Sentence Furigana": subText,
        "Sentence Audio": "",
        "Notes": "",
        "Pitch Accent": pitchAccentCode,
        "Pitch Accent Notes": "",
        "Frequency": freqVal,
        "Picture": "",
      };

      setFullscreenCardFields(fields);
      setShowFullscreenCardEditor(true);
      return;
    }

    const pitchText = uniqueAccents.length > 0
      ? uniqueAccents.map((a) => `${a.reading} [${a.accent}]`).join(", ")
      : "";

    let nonFsWordAudioHtml = "";
    const nonFsExpr = term.expression || "";
    const nonFsRead = term.reading || "";
    const nonFsFreqVal = extractFrequencyNumber(lookupResults?.metas || [], nonFsExpr, nonFsRead);

    if (nonFsExpr) {
      const remoteUrl = `https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kanji=${encodeURIComponent(nonFsExpr)}&kana=${encodeURIComponent(nonFsRead || nonFsExpr)}`;
      const now = new Date();
      const YYYY = now.getUTCFullYear();
      const MM = String(now.getUTCMonth() + 1).padStart(2, '0');
      const DD = String(now.getUTCDate()).padStart(2, '0');
      const HH = String(now.getUTCHours()).padStart(2, '0');
      const min = String(now.getUTCMinutes()).padStart(2, '0');
      const ss = String(now.getUTCSeconds()).padStart(2, '0');
      const isoStamp = `${YYYY}${MM}${DD}T${HH}${min}${ss}`;
      const randomDigits = `${Date.now()}${Math.floor(100000 + Math.random() * 900000)}`;
      const filename = `Immersion-${isoStamp}_${randomDigits}.mp3`;
      nonFsWordAudioHtml = `[sound:${filename}]`;

      fetchAndCacheMedia(filename, remoteUrl);
    }

    const newCard: AnkiCard = {
      id: `card_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      templateId: DEFAULT_CARD_TEMPLATE.id,
      templateName: DEFAULT_CARD_TEMPLATE.name,
      fields: {
        "Word": term.expression || "",
        "Word Reading": term.reading || term.expression || "",
        "Word Meaning": glossaryText,
        "Word Furigana": formatWordFurigana(term.expression || "", term.reading || ""),
        "Word Audio": nonFsWordAudioHtml,
        "Sentence": activeSub?.text || selectedSubText || "",
        "Sentence Meaning": "",
        "Sentence Furigana": "",
        "Sentence Audio": "",
        "Notes": "",
        "Pitch Accent": pitchText,
        "Pitch Accent Notes": "",
        "Frequency": nonFsFreqVal,
        "Picture": "",
      },
      createdAt: Date.now(),
    };

    try {
      await MangaDB.saveCreatedCard(newCard);
      window.dispatchEvent(new Event("subminer_card_created"));
      setAddedCardId(term.id || term.expression);
      setTimeout(() => {
        setAddedCardId((prev) => (prev === (term.id || term.expression) ? null : prev));
      }, 1500);
    } catch (err) {
      console.error("Failed to add card from term:", err);
    }
  };

  // Save subtitle adjustments to cache
  useEffect(() => {
    localStorage.setItem("subminer_sub_scale", subScale.toString());
  }, [subScale]);

  useEffect(() => {
    localStorage.setItem("subminer_global_font_scale", globalScale.toString());
    document.documentElement.style.fontSize = `${globalScale * 100}%`;
  }, [globalScale]);

  useEffect(() => {
    const syncSettings = () => {
      const savedSubsEnabled = localStorage.getItem("subminer_subs_enabled");
      setSubsEnabled(savedSubsEnabled !== "false");

      // Secretly debug/reset subtitle positioning and playback state
      if (videoRef.current) {
        setIsPlaying(!videoRef.current.paused);
        const time = videoRef.current.currentTime;
        setCurrentTime(time);
        if (subtitles.length > 0) {
          const current = subtitles.find((s) => time >= s.startTime && time <= s.endTime);
          setActiveSub(current || null);
        }
      }

      const savedFontScale = localStorage.getItem("subminer_global_font_scale");
      if (savedFontScale) {
        const parsed = parseFloat(savedFontScale);
        if (!isNaN(parsed) && parsed > 0) {
          setGlobalScale(parsed);
          setGlobalScaleStr(savedFontScale);
        }
      }
      const savedSubScale = localStorage.getItem("subminer_sub_scale");
      if (savedSubScale) {
        const parsed = parseFloat(savedSubScale);
        if (!isNaN(parsed) && parsed > 0) {
          setSubScale(parsed);
          setSubScaleStr(savedSubScale);
        }
      }
      const savedSubHeight = localStorage.getItem("subminer_sub_height_factor");
      if (savedSubHeight) {
        const parsed = parseFloat(savedSubHeight);
        if (!isNaN(parsed) && parsed > 0) {
          setSubHeightFactor(parsed);
          setSubHeightFactorStr(savedSubHeight);
        }
      }
      const savedSubBlur = localStorage.getItem("subminer_sub_blur");
      if (savedSubBlur) {
        const parsed = parseFloat(savedSubBlur);
        if (!isNaN(parsed) && parsed >= 0) {
          setSubBlur(parsed);
          setSubBlurStr(savedSubBlur);
        }
      }
      const savedSubStroke = localStorage.getItem("subminer_sub_stroke");
      if (savedSubStroke !== null) {
        const parsed = parseFloat(savedSubStroke);
        if (!isNaN(parsed) && parsed >= 0) {
          setSubStroke(Math.min(2.5, parsed));
        }
      }

      const savedStats = localStorage.getItem("subminer_watch_stats_v1") || localStorage.getItem("subminer_watch_stats");
      if (savedStats) {
        try {
          setWatchStats(JSON.parse(savedStats));
        } catch {}
      }
    };
    window.addEventListener("site-background-updated", syncSettings);
    window.addEventListener("subminer-subs-enabled-updated", syncSettings);
    window.addEventListener("subminer-debug-subs", syncSettings);
    window.addEventListener("subminer_watch_stats_updated", syncSettings);
    window.addEventListener("storage", syncSettings);
    return () => {
      window.removeEventListener("site-background-updated", syncSettings);
      window.removeEventListener("subminer-subs-enabled-updated", syncSettings);
      window.removeEventListener("subminer-debug-subs", syncSettings);
      window.removeEventListener("subminer_watch_stats_updated", syncSettings);
      window.removeEventListener("storage", syncSettings);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("subminer_sub_height_factor", subHeightFactor.toString());
  }, [subHeightFactor]);

  useEffect(() => {
    localStorage.setItem("subminer_sub_blur", subBlur.toString());
  }, [subBlur]);

  useEffect(() => {
    localStorage.setItem("subminer_sub_delay", subDelay.toString());
  }, [subDelay]);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeSubScrollRef = useRef<HTMLDivElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const fullscreenActiveSubScrollRef = useRef<HTMLDivElement | null>(null);
  const fullscreenListContainerRef = useRef<HTMLDivElement | null>(null);
  const draggingSubTextRef = useRef<string | null>(null);
  const loadedVideoFileRef = useRef<File | null>(null);
  const videoUrlRef = useRef<string | null>(null);

  const getEpisodeDisplayName = () => {
    const sourceName = videoName || (loadedVideoFileRef.current ? loadedVideoFileRef.current.name : "") || subFileName;
    if (sourceName && sourceName.trim()) {
      return sourceName.replace(/\.[^/.]+$/, "");
    }
    return "";
  };

  // Drag-to-select lookups state
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);
  const [dragEndIdx, setDragEndIdx] = useState<number | null>(null);

  // Refs for drag selecting
  const dragStartIdxRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<any>(null);
  const hasExceededClickRef = useRef<boolean>(false);

  // Fullscreen listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  // Lock body scroll in fullscreen mode
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      document.body.classList.add("fullscreen-active");
      document.documentElement.classList.add("fullscreen-active");
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      document.body.classList.remove("fullscreen-active");
      document.documentElement.classList.remove("fullscreen-active");
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      document.body.classList.remove("fullscreen-active");
      document.documentElement.classList.remove("fullscreen-active");
    };
  }, [isFullscreen]);

  // Load cache on initialization and auto-restore the last used session
  useEffect(() => {
    let restored = false;

    const restoreFromSession = (session: {
      videoName?: string;
      subFileName?: string;
      subtitles?: SubtitleLine[];
      lastTime?: number;
    }) => {
      if (!session) return false;
      const rawSubs = session.subtitles || [];
      if (rawSubs.length === 0 && !session.subFileName && !session.videoName) return false;

      if (session.videoName) setVideoName(session.videoName);
      if (session.subFileName) setSubFileName(session.subFileName);

      const cleaned = rawSubs.map((s: SubtitleLine) => ({
        ...s,
        text: cleanSubText(s.text),
      }));
      setSubtitles(cleaned);
      if (session.lastTime && session.lastTime > 0) {
        setCurrentTime(session.lastTime);
      }
      return true;
    };

    // 1. Try local storage for last used subtitle session first
    const rawLast = localStorage.getItem("subminer_last_used_subs_v1");
    if (rawLast) {
      try {
        const parsed = JSON.parse(rawLast);
        if (parsed && (parsed.subtitles?.length > 0 || parsed.subFileName)) {
          restored = restoreFromSession(parsed);
        }
      } catch (e) {}
    }

    // 2. Try cached_videos array from localStorage
    const rawCached = localStorage.getItem("subminer_cached_videos");
    if (rawCached) {
      try {
        const list: CachedVideo[] = JSON.parse(rawCached);
        if (Array.isArray(list) && list.length > 0) {
          setCachedVideos(list);
          if (!restored) {
            restored = restoreFromSession(list[0]);
          }
        }
      } catch (e) {}
    }

    // 3. Always check IndexedDB mediaStore as durable fallback (bypasses localStorage size limits)
    getMediaAsync("last_used_subtitles.json").then((dataStr) => {
      if (dataStr) {
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed && (parsed.subtitles?.length > 0 || parsed.subFileName)) {
            restoreFromSession(parsed);
            restored = true;
          }
        } catch (e) {}
      }

      getMediaAsync("cached_videos.json").then((cachedStr) => {
        if (cachedStr) {
          try {
            const list: CachedVideo[] = JSON.parse(cachedStr);
            if (Array.isArray(list) && list.length > 0) {
              setCachedVideos(list);
              if (!restored) {
                restoreFromSession(list[0]);
              }
            }
          } catch (e) {}
        }
      });
    });
  }, []);

  const saveLastSubtitleSession = (
    vName: string,
    sName: string,
    subs: SubtitleLine[],
    time: number
  ) => {
    if (!sName && (!subs || subs.length === 0) && !vName) return;
    const session = {
      videoName: vName || "",
      subFileName: sName || "",
      subtitles: subs || [],
      lastTime: time || 0,
      updatedAt: Date.now(),
    };
    const serialized = JSON.stringify(session);
    saveMedia("last_used_subtitles.json", serialized);
    try {
      localStorage.setItem("subminer_last_used_subs_v1", serialized);
    } catch (e) {}
  };

  // Sync playback head position and subtitle session back to local storage and IndexedDB
  useEffect(() => {
    if (!videoName && subtitles.length === 0 && !subFileName) return;
    const timer = setTimeout(() => {
      let list: CachedVideo[] = cachedVideos.length > 0 ? [...cachedVideos] : [];
      const raw = localStorage.getItem("subminer_cached_videos");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            list = parsed;
          }
        } catch (e) {}
      }

      const idx = list.findIndex(
        item => (videoName && item.videoName === videoName) || (subFileName && item.subFileName === subFileName)
      );

      const entryToSave: CachedVideo = {
        id: idx >= 0 ? list[idx].id : `vid_${Date.now()}`,
        videoName: videoName || (idx >= 0 ? list[idx].videoName : ""),
        subFileName: subFileName || (idx >= 0 ? list[idx].subFileName : ""),
        subtitles: subtitles.length > 0 ? subtitles : (idx >= 0 ? list[idx].subtitles : []),
        lastTime: currentTime,
        addedAt: Date.now(),
      };

      if (idx >= 0) {
        list.splice(idx, 1);
      }
      list.unshift(entryToSave);

      if (list.length > 10) {
        list = list.slice(0, 10);
      }

      const serialized = JSON.stringify(list);
      saveMedia("cached_videos.json", serialized);
      try {
        localStorage.setItem("subminer_cached_videos", serialized);
      } catch (e) {}
      setCachedVideos(list);

      saveLastSubtitleSession(videoName, subFileName, subtitles, currentTime);
    }, 1000);
    return () => clearTimeout(timer);
  }, [currentTime, videoName, subFileName, subtitles]);

  const saveToCache = (
    vName: string,
    sName: string,
    subsList: SubtitleLine[],
    timeOverride?: number
  ) => {
    if (!vName && !sName) return;
    let list: CachedVideo[] = cachedVideos.length > 0 ? [...cachedVideos] : [];
    const raw = localStorage.getItem("subminer_cached_videos");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          list = parsed;
        }
      } catch (e) {}
    }

    const existingIdx = list.findIndex(
      item => (vName && item.videoName === vName) || (sName && item.subFileName === sName)
    );

    const prevTime = existingIdx >= 0 ? list[existingIdx].lastTime : 0;
    const timeToSave =
      timeOverride !== undefined && timeOverride >= 0
        ? timeOverride
        : currentTime > 0
        ? currentTime
        : prevTime;

    const newEntry: CachedVideo = {
      id: existingIdx >= 0 ? list[existingIdx].id : `vid_${Date.now()}`,
      videoName: vName || (existingIdx >= 0 ? list[existingIdx].videoName : ""),
      subFileName: sName,
      subtitles: subsList,
      lastTime: timeToSave,
      addedAt: Date.now(),
    };

    if (existingIdx >= 0) {
      // Move to front and update
      list.splice(existingIdx, 1);
    }
    list.unshift(newEntry);

    // Keep up to 10 entries in cache
    if (list.length > 10) {
      list = list.slice(0, 10);
    }

    const serialized = JSON.stringify(list);

    // Save to IndexedDB (supports large subtitle payload sizes)
    saveMedia("cached_videos.json", serialized);

    // Try saving to localStorage (wrap in try/catch to gracefully handle quota errors)
    try {
      localStorage.setItem("subminer_cached_videos", serialized);
    } catch (e) {
      console.warn("localStorage quota exceeded for cached_videos, relying on IndexedDB");
    }

    setCachedVideos(list);
    saveLastSubtitleSession(vName || (existingIdx >= 0 ? list[existingIdx].videoName : ""), sName, subsList, timeToSave);
  };

  const handleLoadCachedVideo = (cached: CachedVideo) => {
    setVideoName(cached.videoName);
    let activeSubs = subtitles;
    let activeSubName = subFileName;

    if (cached.subtitles && cached.subtitles.length > 0) {
      activeSubName = cached.subFileName || "";
      activeSubs = cached.subtitles.map((s) => ({
        ...s,
        text: cleanSubText(s.text),
      }));
      setSubFileName(activeSubName);
      setSubtitles(activeSubs);
    }

    setCurrentTime(cached.lastTime || 0);
    setVideoUrl(null); // Must let user upload video file
    setIsPlaying(false);
    setIsLocked(false);
    setLockedSub(null);
    saveToCache(cached.videoName, activeSubName, activeSubs, cached.lastTime || 0);
  };

  const handleClearCache = () => {
    localStorage.removeItem("subminer_cached_videos");
    localStorage.removeItem("subminer_last_used_subs_v1");
    deleteMedia("cached_videos.json");
    deleteMedia("last_used_subtitles.json");
    setCachedVideos([]);
    setVideoUrl(null);
    setVideoName("");
    setSubFileName("");
    setSubtitles([]);
    setActiveSub(null);
    setCurrentTime(0);
    setIsLocked(false);
    setLockedSub(null);
  };

  const handleEmptySubtitles = () => {
    setSubtitles([]);
    setSubFileName("");
    setActiveSub(null);
    setLockedSub(null);
    setIsLocked(false);

    deleteMedia("last_used_subtitles.json");
    localStorage.removeItem("subminer_last_used_subs_v1");

    if (videoName) {
      saveToCache(videoName, "", [], currentTime);
    } else {
      const raw = localStorage.getItem("subminer_cached_videos");
      if (raw) {
        try {
          let list: CachedVideo[] = JSON.parse(raw);
          if (list.length > 0) {
            list[0].subFileName = "";
            list[0].subtitles = [];
            if (currentTime > 0) {
              list[0].lastTime = currentTime;
            }
            localStorage.setItem("subminer_cached_videos", JSON.stringify(list));
            setCachedVideos(list);
          }
        } catch (e) {}
      }
    }
  };

  const handleExportLrc = () => {
    if (!subtitles || subtitles.length === 0) return;

    const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);

    const lrcLines = sorted.map((sub) => {
      const timestamp = formatLrcTimestamp(Math.max(0, sub.startTime + subDelay));
      const text = cleanSubText(sub.text);
      return `${timestamp}${text}`;
    });

    const lrcContent = lrcLines.join("\n");

    let exportFileName = "subtitles.lrc";
    const sourceName = videoName || (loadedVideoFileRef.current ? loadedVideoFileRef.current.name : "") || subFileName;
    if (sourceName && sourceName.trim()) {
      const baseName = sourceName.replace(/\.[^/.]+$/, "");
      exportFileName = `${baseName}.lrc`;
    }

    const blob = new Blob([lrcContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportSubtitles = () => {
    if (!subtitles || subtitles.length === 0) return;

    const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);

    const srtBlocks = sorted.map((sub, index) => {
      const start = Math.max(0, sub.startTime + subDelay);
      const end = Math.max(0, sub.endTime + subDelay);
      const startFormatted = formatSrtTimestamp(start);
      const endFormatted = formatSrtTimestamp(end);
      const text = cleanSubText(sub.text);
      return `${index + 1}\n${startFormatted} --> ${endFormatted}\n${text}`;
    });

    const srtContent = srtBlocks.join("\n\n");

    let exportFileName = "subtitles.srt";
    const sourceName = videoName || (loadedVideoFileRef.current ? loadedVideoFileRef.current.name : "") || subFileName;
    if (sourceName && sourceName.trim()) {
      const baseName = sourceName.replace(/\.[^/.]+$/, "");
      exportFileName = `${baseName}.srt`;
    }

    const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const videoLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleRemoveVideo = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
    }
    if (videoName) {
      const raw = localStorage.getItem("subminer_cached_videos");
      if (raw) {
        try {
          let list: CachedVideo[] = JSON.parse(raw);
          const idx = list.findIndex((item) => item.videoName === videoName);
          if (idx >= 0) {
            list[idx].lastTime = 0;
            list[idx].videoName = "";
            localStorage.setItem("subminer_cached_videos", JSON.stringify(list));
            setCachedVideos(list);
          }
        } catch (e) {}
      }
    }
    setVideoName("");
    setVideoUrl(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setPendingSeekTime(null);
  };

  const handleVideoPointerDown = (e: React.PointerEvent) => {
    if (isFullscreen || !videoUrl) return;
    if (videoLongPressTimerRef.current) {
      clearTimeout(videoLongPressTimerRef.current);
    }
    videoLongPressTimerRef.current = setTimeout(() => {
      handleRemoveVideo();
      videoLongPressTimerRef.current = null;
    }, 600);
  };

  const handleVideoPointerUpOrLeave = () => {
    if (videoLongPressTimerRef.current) {
      clearTimeout(videoLongPressTimerRef.current);
      videoLongPressTimerRef.current = null;
    }
  };

  // Automatically sync active subtitle based on video current time
  useEffect(() => {
    if (subtitles.length === 0) {
      setActiveSub(null);
      return;
    }
    if (isLocked && lockedSub) {
      setActiveSub(lockedSub);
      return;
    }
    const effectiveTime = currentTime - subDelay;
    const current = subtitles.find(
      (sub) => effectiveTime >= sub.startTime - 0.05 && effectiveTime <= sub.endTime + 0.05
    );
    if (current && (!activeSub || activeSub.id !== current.id)) {
      setActiveSub(current);
    } else if (!current && activeSub) {
      setActiveSub(null);
    }
  }, [currentTime, subtitles, isLocked, lockedSub, subDelay]);

  // Track previous showFullscreenLines state
  const prevShowFullscreenLinesRef = useRef<boolean>(false);

  // Automatically scroll active subtitle so it is displayed below the search bar
  useEffect(() => {
    if (activeSub && activeSubScrollRef.current && listContainerRef.current) {
      const container = listContainerRef.current;
      const element = activeSubScrollRef.current;
      container.scrollTo({
        top: element.offsetTop,
        behavior: "smooth",
      });
    }
  }, [activeSub]);

  // Automatically scroll active subtitle in fullscreen lines panel so it is ALREADY at current line when opened
  useEffect(() => {
    const wasOpen = prevShowFullscreenLinesRef.current;
    prevShowFullscreenLinesRef.current = showFullscreenLines;

    if (showFullscreenLines && activeSub) {
      const isJustOpened = !wasOpen;

      const scrollToActive = () => {
        if (fullscreenActiveSubScrollRef.current && fullscreenListContainerRef.current) {
          const container = fullscreenListContainerRef.current;
          const targetTop = fullscreenActiveSubScrollRef.current.offsetTop;
          if (isJustOpened) {
            container.scrollTop = targetTop;
          } else {
            container.scrollTo({
              top: targetTop,
              behavior: "smooth",
            });
          }
        }
      };

      scrollToActive();
      const raf = requestAnimationFrame(scrollToActive);
      const t1 = setTimeout(scrollToActive, 50);
      const t2 = setTimeout(scrollToActive, 150);
      const t3 = setTimeout(scrollToActive, 350);
      const t4 = setTimeout(scrollToActive, 500);

      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
      };
    }
  }, [showFullscreenLines, activeSub]);

  // Sync fullscreen state class and dispatch custom event for App.tsx
  useEffect(() => {
    if (isFullscreen) {
      document.body.classList.add("subminer-fullscreen-active");
    } else {
      document.body.classList.remove("subminer-fullscreen-active");
    }
    window.dispatchEvent(new Event("subminer-fullscreen-toggle"));

    return () => {
      document.body.classList.remove("subminer-fullscreen-active");
      window.dispatchEvent(new Event("subminer-fullscreen-toggle"));
    };
  }, [isFullscreen]);

  // Global hotkeys for playback & subtitle mining
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip hotkeys if user is focusing an input
      const activeEl = document.activeElement;
      if (activeEl) {
        const tagName = activeEl.tagName.toUpperCase();
        if (tagName === "INPUT" || tagName === "TEXTAREA" || activeEl.hasAttribute("contenteditable")) {
          return;
        }
      }

      if (showFullscreenCardEditor || showCardCreationList || showFullscreenLines || showStatsPanel || showTrackPanel || showSettingsPanel) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (showFullscreenLines) {
            setShowFullscreenLines(false);
          } else if (showFullscreenCardEditor) {
            handleCancelFullscreenCard();
          } else if (showStatsPanel) {
            setShowStatsPanel(false);
          } else if (showTrackPanel) {
            setShowTrackPanel(false);
          } else if (showSettingsPanel) {
            setShowSettingsPanel(false);
          } else {
            setShowCardCreationList(false);
          }
        }
        return;
      }

      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        skipSubtitle("prev");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        skipSubtitle("next");
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        replayCurrentSubtitle();
      } else if (e.key === "Escape" && isFullscreen) {
        e.preventDefault();
        setIsFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [subtitles, activeSub, currentTime, isFullscreen, showFullscreenCardEditor, showCardCreationList, showFullscreenLines]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(err => {
        if (err && err.name !== "AbortError") console.error(err);
      });
      setIsPlaying(true);
      closeLookup();
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && 
        !(document as any).webkitFullscreenElement && 
        !(document as any).mozFullScreenElement && 
        !(document as any).msFullscreenElement) {
      const el = containerRef.current;
      if (el) {
        const rfs = el.requestFullscreen ||
          (el as any).webkitRequestFullscreen ||
          (el as any).mozRequestFullScreen ||
          (el as any).msRequestFullscreen;
        if (rfs) {
          rfs.call(el)
            .then(() => setIsFullscreen(true))
            .catch((err: any) => {
              console.error(err);
              setIsFullscreen(true);
            });
        } else {
          setIsFullscreen(true);
        }
      } else {
        setIsFullscreen(true);
      }
    } else {
      const el = document.exitFullscreen ||
        (document as any).webkitExitFullscreen ||
        (document as any).mozCancelFullScreen ||
        (document as any).msExitFullscreen;
      if (el) {
        el.call(document)
          .then(() => setIsFullscreen(false))
          .catch(() => setIsFullscreen(false));
      } else {
        setIsFullscreen(false);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    if (isLocked && lockedSub) {
      if (time < lockedSub.startTime || time > lockedSub.endTime) {
        videoRef.current.currentTime = lockedSub.startTime;
        setCurrentTime(lockedSub.startTime);
      } else {
        setCurrentTime(time);
      }
    } else {
      setCurrentTime(time);
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
    if (pendingSeekTime !== null) {
      videoRef.current.currentTime = pendingSeekTime;
      setCurrentTime(pendingSeekTime);
      setPendingSeekTime(null);
      videoRef.current.play().catch(err => {
        if (err && err.name !== "AbortError") console.error(err);
      });
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const seekValue = parseFloat(e.target.value);
    if (isLocked && lockedSub) {
      const actualTime = lockedSub.startTime + seekValue;
      videoRef.current.currentTime = actualTime;
      setCurrentTime(actualTime);
    } else {
      videoRef.current.currentTime = seekValue;
      setCurrentTime(seekValue);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const vol = parseFloat(e.target.value);
    videoRef.current.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const muteState = !isMuted;
    videoRef.current.muted = muteState;
    setIsMuted(muteState);
  };

  const toggleLock = () => {
    if (!videoRef.current) return;
    
    closeLookup();
    
    if (isLocked) {
      setIsLocked(false);
      if (lockedSub) {
        videoRef.current.currentTime = lockedSub.startTime;
        setCurrentTime(lockedSub.startTime);
        videoRef.current.play().catch(err => {
          if (err && err.name !== "AbortError") console.error(err);
        });
        setIsPlaying(true);
      }
      setLockedSub(null);
    } else {
      if (activeSub) {
        setIsLocked(true);
        setLockedSub(activeSub);
        videoRef.current.currentTime = activeSub.startTime;
        setCurrentTime(activeSub.startTime);
        videoRef.current.play().catch(err => {
          if (err && err.name !== "AbortError") console.error(err);
        });
        setIsPlaying(true);
      }
    }
  };

  // Skip video to a specific subtitle starting timestamp
  const jumpToSubtitle = (sub: SubtitleLine) => {
    if (!videoRef.current) return;
    if (isLocked) {
      setLockedSub(sub);
    }
    const targetTime = sub.startTime + subDelay + 0.01;
    videoRef.current.currentTime = targetTime; // tiny offset to trigger state sync reliably
    setCurrentTime(targetTime);
  };

  // Replays the active subtitle line
  const replayCurrentSubtitle = () => {
    if (!videoRef.current || !activeSub) return;
    if (isLocked) {
      setLockedSub(activeSub);
    }
    const targetTime = activeSub.startTime + subDelay + 0.01;
    videoRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
    videoRef.current.play().catch(err => {
      if (err && err.name !== "AbortError") console.error(err);
    });
    setIsPlaying(true);
  };

  // Skip back or forward by subtitle line
  const skipSubtitle = (direction: "prev" | "next") => {
    if (subtitles.length === 0 || !videoRef.current) return;

    const effectiveTime = currentTime - subDelay;
    if (direction === "prev") {
      // Find the subtitle that starts before effective time
      const prevSubs = subtitles.filter((sub) => sub.startTime < effectiveTime - 0.5);
      if (prevSubs.length > 0) {
        const lastPrev = prevSubs[prevSubs.length - 1];
        jumpToSubtitle(lastPrev);
      } else {
        videoRef.current.currentTime = 0;
        setCurrentTime(0);
      }
    } else {
      // Find the first subtitle that starts after effective time
      const nextSub = subtitles.find((sub) => sub.startTime > effectiveTime + 0.1);
      if (nextSub) {
        jumpToSubtitle(nextSub);
      }
    }
  };

  // Drag state for video upload box
  const [videoDragActive, setVideoDragActive] = useState(false);

  // --- UNIFIED MEDIA & SUBTITLE FILE HANDLER ---
  const isVideoFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    return ["mp4", "mkv", "webm", "avi", "mov", "m4v", "flv", "ogv"].includes(ext) || file.type.startsWith("video/");
  };

  const isSubtitleFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    return ["srt", "vtt", "ass", "ssa"].includes(ext) || file.type.includes("text/");
  };

  const handleMediaFileUpload = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);

    const videoFiles = fileArray.filter(isVideoFile);
    const subFiles = fileArray.filter(isSubtitleFile);

    let videoFile = videoFiles[0] || null;
    let subFile = subFiles[0] || null;

    // Smart pairing: if multiple files are dropped, try pairing subtitle with matching video name
    if (videoFile && subFiles.length > 0) {
      const vBase = videoFile.name.replace(/\.[^/.]+$/, "").toLowerCase();
      const matched = subFiles.find((sf) => {
        const sBase = sf.name.replace(/\.[^/.]+$/, "").toLowerCase();
        return sBase === vBase || sBase.includes(vBase) || vBase.includes(sBase);
      });
      if (matched) subFile = matched;
    }

    let currentVideoName = videoName;
    let currentSubFileName = subFileName;
    let currentSubtitles = subtitles;
    let restoredTime = 0;

    if (videoFile) {
      setVideoError(null);
      loadedVideoFileRef.current = videoFile;
      currentVideoName = videoFile.name;
      setVideoName(videoFile.name);

      // Revoke previous blob URL to prevent memory leaks across episodes
      if (videoUrlRef.current && videoUrlRef.current.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(videoUrlRef.current);
        } catch (e) {}
      }

      const url = URL.createObjectURL(videoFile);
      videoUrlRef.current = url;
      setVideoUrl(url);
      setIsPlaying(false);
      setIsLocked(false);
      setLockedSub(null);

      // Attempt to restore progress and subtitle state if this video exists in cache
      const raw = localStorage.getItem("subminer_cached_videos");
      if (raw) {
        try {
          const list: CachedVideo[] = JSON.parse(raw);
          const found = list.find((item) => item.videoName === videoFile.name);
          if (found) {
            if (found.lastTime > 0) {
              restoredTime = found.lastTime;
            }
            if (!subFile) {
              if (found.subtitles && found.subtitles.length > 0) {
                currentSubFileName = found.subFileName ?? "";
                currentSubtitles = found.subtitles.map((s) => ({
                  ...s,
                  text: cleanSubText(s.text),
                }));
                setSubFileName(currentSubFileName);
                setSubtitles(currentSubtitles);
              }
            }
          }
        } catch (err) {}
      }

      if (restoredTime > 0) {
        setPendingSeekTime(restoredTime);
      } else {
        setCurrentTime(0);
        setPendingSeekTime(null);
      }
    }

    if (subFile) {
      currentSubFileName = subFile.name;
      setSubFileName(subFile.name);
      setIsLocked(false);
      setLockedSub(null);

      const reader = new FileReader();
      reader.onerror = (err) => {
        console.error("FileReader error reading subtitle file:", err);
      };
      reader.onload = (event) => {
        try {
          if (event.target?.result) {
            const rawText = event.target.result as string;
            const parsed = parseSubtitles(rawText);
            currentSubtitles = parsed;
            setSubtitles(parsed);
            saveToCache(currentVideoName, subFile.name, parsed, restoredTime);
          }
        } catch (err) {
          console.error("Error processing imported subtitles:", err);
        }
      };
      reader.readAsText(subFile);
    } else if (videoFile) {
      saveToCache(currentVideoName, currentSubFileName, currentSubtitles, restoredTime);
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleMediaFileUpload(e.target.files);
    e.target.value = "";
  };

  const handleSubtitleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleMediaFileUpload(e.target.files);
    e.target.value = "";
  };

  // --- DICTIONARY LOOKUP ENGINE ---
  const runDictionaryLookup = async (text: string, start: number, end: number) => {
    const substring = text.substring(start, end).trim();
    if (!substring) return;

    if (videoRef.current && isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    }

    const isDifferentSelection = start !== lookupStartIndex || end !== lookupEndIndex || text !== selectedSubText;

    if (showDictPanel && isDifferentSelection) {
      setShowDictPanel(false);
      const waitTime = isFullscreen ? 300 : 400;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    setIsSearchingDict(true);
    setShowDictPanel(true);
    setShowDictionariesList(false);
    setShowCardCreationList(false);
    try {
      const results = await MangaDB.lookupWord(substring);
      setLookupResults(results);
    } catch (err) {
      console.error("Yomitan lookup error:", err);
    } finally {
      setIsSearchingDict(false);
    }
  };

  // Click on a specific character inside a subtitle line
  const handleCharClick = async (sentence: string, index: number) => {
    if (
      showDictPanel &&
      selectedSubText === sentence &&
      index >= lookupStartIndex &&
      index < lookupEndIndex
    ) {
      closeLookup();
      return;
    }

    if (videoRef.current && isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    }

    setSelectedSubText(sentence);
    setLookupStartIndex(index);

    const isDifferentSelection = index !== lookupStartIndex || sentence !== selectedSubText;
    if (showDictPanel && isDifferentSelection) {
      setShowDictPanel(false);
      const waitTime = isFullscreen ? 300 : 400;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    setIsSearchingDict(true);
    setShowDictPanel(true);
    setShowDictionariesList(false);
    setShowCardCreationList(false);

    try {
      const lookforwardStr = sentence.substring(index, index + 12);
      const results = await MangaDB.lookupWord(lookforwardStr);

      let matchedLength = 1;
      if (results && results.terms && results.terms.length > 0) {
        const topPrefixLen = results.terms[0].matchedPrefixLength || 1;
        matchedLength = Math.max(1, Math.min(topPrefixLen, lookforwardStr.length));
      }

      const finalEndIdx = index + matchedLength;
      setLookupEndIndex(finalEndIdx);
      setLookupResults(results);
    } catch (err) {
      console.error("Yomitan lookup error:", err);
    } finally {
      setIsSearchingDict(false);
    }
  };

  // Manual adjustment buttons [ - ] [ + ] to adjust matched range
  const adjustLookupRange = (delta: "expand" | "shrink") => {
    if (!selectedSubText) return;

    let newEnd = lookupEndIndex;
    if (delta === "expand") {
      if (lookupEndIndex < selectedSubText.length) {
        newEnd = lookupEndIndex + 1;
      }
    } else {
      if (lookupEndIndex > lookupStartIndex + 1) {
        newEnd = lookupEndIndex - 1;
      }
    }

    setLookupEndIndex(newEnd);
    runDictionaryLookup(selectedSubText, lookupStartIndex, newEnd);
  };

  const closeLookup = () => {
    setShowDictPanel(false);
    setSelectedSubText("");
    setLookupStartIndex(0);
    setLookupEndIndex(0);
    setLookupResults(null);
  };

  const handleSubtitlePointerDown = (e: React.PointerEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    dragStartIdxRef.current = index;
    hasExceededClickRef.current = false;

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      hasExceededClickRef.current = true;
      setIsDragSelecting(true);
      setDragStartIdx(index);
      setDragEndIdx(index);

      if (videoRef.current && isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }, 200);
  };

  const handleSubtitlePointerMove = (e: React.PointerEvent) => {
    if (dragStartIdxRef.current === null) return;
    
    e.preventDefault();
    e.stopPropagation();

    const elem = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (elem && elem.hasAttribute("data-char-index")) {
      const subText = elem.getAttribute("data-sub-text");
      if (subText !== draggingSubTextRef.current) return;

      const idx = parseInt(elem.getAttribute("data-char-index") || "0", 10);
      
      if (idx !== dragStartIdxRef.current && !isDragSelecting) {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        hasExceededClickRef.current = true;
        setIsDragSelecting(true);
        setDragStartIdx(dragStartIdxRef.current);
        
        if (videoRef.current && isPlaying) {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      }
      
      if (isDragSelecting) {
        setDragEndIdx(idx);
      }
    }
  };

  const handleSubtitlePointerUp = (e: React.PointerEvent, subText: string) => {
    if (dragStartIdxRef.current === null) return;

    e.preventDefault();
    e.stopPropagation();

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore
    }

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    const startIdx = dragStartIdx;
    const endIdx = dragEndIdx;
    const isDrag = isDragSelecting;
    const dragStart = dragStartIdxRef.current;

    dragStartIdxRef.current = null;
    setIsDragSelecting(false);
    setDragStartIdx(null);
    setDragEndIdx(null);
    draggingSubTextRef.current = null;

    if (isDrag && dragStart !== null && endIdx !== null) {
      const finalStart = Math.min(dragStart, endIdx);
      const finalEnd = Math.max(dragStart, endIdx) + 1;

      setSelectedSubText(subText);
      setLookupStartIndex(finalStart);
      setLookupEndIndex(finalEnd);
      runDictionaryLookup(subText, finalStart, finalEnd);
    } else if (!hasExceededClickRef.current && dragStart !== null) {
      handleCharClick(subText, dragStart);
    }
  };

  const handleSubtitlePointerCancel = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore
    }

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    dragStartIdxRef.current = null;
    setIsDragSelecting(false);
    setDragStartIdx(null);
    setDragEndIdx(null);
    draggingSubTextRef.current = null;
  };

  // Subtitle search filter
  const filteredSubtitles = subtitles.filter((sub) =>
    sub.text.toLowerCase().includes(subSearchQuery.toLowerCase())
  );

  // Time format helper (HH:MM:SS)
  const formatTime = (timeInSecs: number) => {
    if (isNaN(timeInSecs)) return "00:00";
    const h = Math.floor(timeInSecs / 3600);
    const m = Math.floor((timeInSecs % 3600) / 60);
    const s = Math.floor(timeInSecs % 60);

    const pad = (num: number) => String(num).padStart(2, "0");

    if (h > 0) {
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  };

  // Precise time format helper (HH:MM:SS.mmm) for subtitle line list
  const formatPreciseTime = (timeInSecs: number) => {
    if (isNaN(timeInSecs) || timeInSecs < 0) return "00:00:00.000";
    const totalMs = Math.round(timeInSecs * 1000);
    const h = Math.floor(totalMs / 3600000);
    const m = Math.floor((totalMs % 3600000) / 60000);
    const s = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;

    const pad = (num: number, len: number = 2) => String(num).padStart(len, "0");

    return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
  };

  const renderDictionaryContent = () => {
    return (
      <div className="w-full">
        {isSearchingDict ? null : !lookupResults || (lookupResults.terms.length === 0 && lookupResults.accents.length === 0 && lookupResults.metas.length === 0) ? (
          <div className="text-center py-10 max-w-md mx-auto select-none">
            <p className="text-base text-zinc-500 font-mono font-bold">(╥﹏╥)</p>
          </div>
        ) : (
          <div className={isFullscreen ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "flex flex-col gap-4"}>
            {/* Terms rendering */}
            {lookupResults.terms.map((term: any) => {
              const matchingAccents = lookupResults.accents.filter(
                (acc: any) => acc.expression === term.expression && (!acc.reading || acc.reading === term.reading)
              );
              const matchingMetas = lookupResults.metas.filter(
                (m: any) => m.expression === term.expression && m.mode !== "tag"
              );
              const termReading = term.reading || term.expression;

              const accentList: { reading: string; accent: number }[] = [];
              matchingAccents.forEach((acc: any) => {
                const accs = Array.isArray(acc.accents) ? acc.accents : [acc.accents];
                accs.forEach((aObj) => {
                  accentList.push({
                    reading: acc.reading || termReading,
                    accent: getAccentNumber(aObj),
                  });
                });
              });

              const pitchMetas = matchingMetas.filter((m: any) => m.mode === "pitch");
              const otherMetas = matchingMetas.filter((m: any) => m.mode !== "pitch");

              const matchedPitchMetas = pitchMetas.map((meta: any) => {
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
                  onClick={() => playAudio(term.expression, term.reading || term.expression)}
                  className="bg-zinc-900/50 rounded-md p-3 flex flex-col justify-between hover:bg-zinc-900/80 transition-all duration-200 cursor-pointer border-none relative pr-12"
                  title="Click card to play pronunciation"
                >
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await handleAddCardFromTerm(term, uniqueAccents);
                    }}
                    className="absolute top-3 right-3 p-2 bg-zinc-900/50 hover:bg-zinc-700/30 border-none outline-none text-zinc-400 hover:text-white rounded-full transition-all flex items-center justify-center shrink-0 cursor-pointer h-9 w-9 z-10"
                    title="Add to cards"
                  >
                    {addedCardId === (term.id || term.expression) ? (
                      <Check className="w-4 h-4 text-white" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </button>
                  <div>
                    <div className="flex items-center justify-between pb-1 mb-2">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <TermRuby
                          expression={term.expression}
                          reading={term.reading}
                          className="font-jisho text-3xl sm:text-4xl font-bold text-white select-text pt-2"
                        />
                      </div>
                    </div>

                    {/* Tags / Badges */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {term.rules && (
                        <CollapsibleBadge label={term.rules} isFullscreenLookup={isFullscreen} />
                      )}
                      {term.termTags &&
                        term.termTags.split(" ").map((tag: string, index: number) => {
                          const cleanTag = tag.trim();
                          if (!cleanTag) return null;
                          const tagMeta = lookupResults.metas.find(
                            (m: any) => m.expression === cleanTag && m.mode === "tag"
                          );
                          const rawLabel = tagMeta ? getDisplayMetaValue(tagMeta.value) || cleanTag : cleanTag;
                          let displayLabel = rawLabel;
                          if (rawLabel.toLowerCase().includes("jlpt")) {
                            const match = rawLabel.match(/jlpt[-_]?n?([1-5])/i);
                            displayLabel = match ? `JLPT N${match[1]}` : rawLabel.toUpperCase().replace("JLPT-", "JLPT ").replace("JLPT_", "JLPT ");
                          }
                          return (
                            <CollapsibleBadge
                              key={index}
                              label={displayLabel}
                              isFullscreenLookup={isFullscreen}
                            />
                          );
                        })}
                      {otherMetas.map((meta: any) => {
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
                          <CollapsibleBadge
                            key={meta.id}
                            label={displayLabel}
                            isFullscreenLookup={isFullscreen}
                          />
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
            {lookupResults.accents.length > 0 && lookupResults.terms.length === 0 && (
              lookupResults.accents.map((acc: any) => {
                const accs = Array.isArray(acc.accents) ? acc.accents : [acc.accents];
                return (
                  <div
                    key={acc.id}
                    onClick={() => playAudio(acc.expression, acc.reading || acc.expression)}
                    className="bg-zinc-900/50 rounded-md p-3 hover:bg-zinc-900 transition-all duration-200 cursor-pointer border-none"
                    title="Click card to play pronunciation"
                  >
                    <div className="font-jisho pb-1 mb-2">
                      <TermRuby
                        expression={acc.expression}
                        reading={acc.reading}
                        className="font-jisho text-3xl sm:text-4xl font-bold text-white select-text pt-2"
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
          </div>
        )}
      </div>
    );
  };

  // Locked clip values helper
  const displayCurrentTime = isLocked && lockedSub
    ? Math.max(0, currentTime - lockedSub.startTime)
    : (currentTime && !isNaN(currentTime) ? currentTime : 0);

  const displayDuration = isLocked && lockedSub
    ? Math.max(0.1, lockedSub.endTime - lockedSub.startTime)
    : (duration && !isNaN(duration) ? duration : 0.1);

  const progressPercent = (displayDuration > 0 && !isNaN(displayCurrentTime) && !isNaN(displayDuration))
    ? Math.min(100, Math.max(0, (displayCurrentTime / displayDuration) * 100))
    : 0;

  const isAnyHeaderPanelOpen = !isFullscreen && (
    showSubtitlesList ||
    showDictionariesList ||
    showCardCreationList ||
    showStatsPanel ||
    showTrackPanel ||
    showSettingsPanel ||
    showDictPanel
  );

  return (
    <div className="min-h-screen bg-zinc-800 text-white flex flex-col font-sans select-none">
      {/* Top Header */}
      <header className="bg-zinc-800 flex flex-col z-10 shrink-0 select-none">
        <div className="px-4 md:px-6 py-2.5 sm:py-3.5 flex flex-wrap items-center justify-between gap-2 sm:gap-3 md:gap-4">
          <div className="flex items-center gap-3">
            {/* Left side is clean */}
          </div>

          {/* Bundle of Buttons (Right Side) */}
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 ml-auto max-w-full">
            <div className="flex flex-wrap bg-transparent font-mono text-xs sm:text-sm p-0 gap-1.5 sm:gap-2 items-center justify-end">
              <button
                onClick={toggleSubtitlesList}
                className={`px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer font-bold font-mono text-xs sm:text-sm ${
                  showSubtitlesList ? "text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                <span>SUBS</span>
              </button>
              <button
                onClick={toggleDictionariesList}
                className={`px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer font-bold font-mono text-xs sm:text-sm ${
                  showDictionariesList ? "text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                <span>DICTIONARIES</span>
              </button>
              <button
                onClick={toggleCardCreationList}
                className={`px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer font-bold font-mono text-xs sm:text-sm ${
                  showCardCreationList ? "text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                <span>DECK</span>
              </button>
              <button
                onClick={toggleStatsPanel}
                className={`px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer font-bold font-mono text-xs sm:text-sm ${
                  showStatsPanel ? "text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                <span>STATS</span>
              </button>
              <button
                onClick={toggleTrackPanel}
                className={`px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer font-bold font-mono text-xs sm:text-sm ${
                  showTrackPanel ? "text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                <span>TRACK</span>
              </button>

              <InstallAppButton variant="compact" />

              <button
                onClick={toggleSettingsPanel}
                className={`px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer font-bold font-mono text-xs sm:text-sm ${
                  showSettingsPanel ? "text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                <span>SETTINGS</span>
              </button>
              
              <input
                id="sub-upload-header"
                type="file"
                accept=".mp4,.mkv,.webm,.avi,.mov,.m4v,.flv,.ogv,.srt,.vtt,.ass,.ssa"
                multiple
                className="hidden"
                onChange={handleSubtitleUpload}
              />

              <input
                id="video-upload-header"
                type="file"
                accept=".mp4,.mkv,.webm,.avi,.mov,.m4v,.flv,.ogv,.srt,.vtt,.ass,.ssa"
                multiple
                className="hidden"
                onChange={handleVideoUpload}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main player layout */}
      <div className="flex-1 flex flex-col overflow-hidden relative bg-zinc-800">
        {/* Main layout container: splits into left mini player & right content panel on lg screens when a panel is open */}
        <div className={`flex-1 bg-zinc-800 overflow-y-auto p-4 gap-6 ${
          isAnyHeaderPanelOpen 
            ? "flex flex-col lg:flex-row lg:items-start lg:justify-between max-w-[1700px] w-full mx-auto" 
            : "flex flex-col justify-center"
        }`}>
          {/* Left Column: Mini Player Unit & Media Controls */}
          <div className={`flex flex-col gap-4 transition-all duration-300 ${
            isAnyHeaderPanelOpen 
              ? "w-full lg:w-1/2 lg:max-w-[850px] lg:sticky lg:top-0 shrink-0" 
              : "w-full max-w-4xl mx-auto"
          }`}>
            {/* Episode name above player box (outside full-screen) */}
            {!isFullscreen && getEpisodeDisplayName() && (
              <div className="text-center font-bold font-mono text-xs text-zinc-500 select-none truncate px-2 w-full -mb-2">
                <span>{getEpisodeDisplayName()}</span>
              </div>
            )}

            {/* The Video Wrapper */}
            <div
              ref={containerRef}
              onContextMenu={(e) => e.preventDefault()}
              style={{ WebkitTouchCallout: "none" }}
              className={`overflow-hidden group outline-none select-none ${
                isFullscreen 
                  ? "bg-black fixed inset-0 w-full h-full z-[99999] flex items-center justify-center shadow-none rounded-none m-0 p-0 border-none" 
                  : `bg-zinc-900/50 relative aspect-video w-full rounded-md shadow-none mx-auto transition-all ${videoUrl ? "z-40" : ""}`
              }`}
            >
            {videoUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  onContextMenu={(e) => e.preventDefault()}
                  style={{ WebkitTouchCallout: "none" }}
                  className="w-full h-full object-contain animate-fade-in cursor-pointer select-none"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onError={() => {
                    setVideoError("Unable to play video stream. Your browser may not support this file's audio or video codec (e.g. EAC3/DTS/HEVC).");
                  }}
                  onPointerDown={handleVideoPointerDown}
                  onPointerUp={handleVideoPointerUpOrLeave}
                  onPointerLeave={handleVideoPointerUpOrLeave}
                  onPointerCancel={handleVideoPointerUpOrLeave}
                  onClick={() => {
                    if (isFullscreen) {
                      if (showFullscreenCardEditor) {
                        return;
                      }
                      togglePlay();
                    }
                  }}
                />
                {videoError && (
                  <div className="absolute top-2 left-2 right-2 z-50 bg-red-950/90 border border-red-500/50 text-red-200 px-3 py-2 rounded text-xs flex items-center justify-between shadow-lg">
                    <span>{videoError}</span>
                    <button
                      onClick={() => setVideoError(null)}
                      className="ml-2 text-red-400 hover:text-white text-sm font-bold px-1"
                    >
                      ×
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div 
                className={`w-full h-full bg-zinc-900/50 hover:bg-zinc-900 transition-all duration-200 cursor-pointer select-none ${
                  videoDragActive ? "bg-zinc-900 border-2 border-dashed border-zinc-500" : ""
                }`}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => document.getElementById("video-upload-header")?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setVideoDragActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setVideoDragActive(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setVideoDragActive(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleMediaFileUpload(e.dataTransfer.files);
                  }
                }}
              />
            )}

              {/* Subtitle Overlay inside the video */}
              {subsEnabled && activeSub && (
                <div 
                  className={`absolute left-1/2 -translate-x-1/2 max-w-[85%] text-center font-jisho font-medium transition-all select-none touch-none flex flex-col gap-2 items-center ${
                    showFullscreenCardEditor || showFullscreenLines || showCardCreationList ? "z-45 pointer-events-none" : "z-20"
                  }`}
                  style={{
                    bottom: isFullscreen
                      ? (!isPlaying && !showFullscreenCardEditor && !showCardCreationList && !showFullscreenLines ? `${(10 * subHeightFactor) / (globalScale || 1)}rem` : `${(4 * subHeightFactor) / (globalScale || 1)}rem`)
                      : `${(2.5 * subHeightFactor) / (globalScale || 1)}rem`,
                    fontSize: `${(subScale * (isFullscreen ? 1.5 : 1.25)) / (globalScale || 1)}rem`,
                    lineHeight: "1.4"
                  }}
                >
                  {subtitles
                    .filter((s) => s.startTime === activeSub.startTime)
                    .map((sub, subIdx) => {
                      const cleanText = cleanSubText(sub.text);
                      return (
                        <div
                          key={sub.id || subIdx}
                          className={`w-full flex justify-center flex-wrap gap-x-0.5 leading-relaxed transition-all ${
                            subBlur > 0 ? "px-4 py-1.5 rounded-lg shadow-lg" : ""
                          }`}
                          style={
                            subBlur > 0
                              ? {
                                  backdropFilter: `blur(${subBlur}px)`,
                                  WebkitBackdropFilter: `blur(${subBlur}px)`,
                                  backgroundColor: `rgba(0, 0, 0, ${Math.min(0.85, 0.35 + subBlur * 0.02)})`,
                                }
                              : undefined
                          }
                        >
                          {cleanText.split("").map((char, index) => {
                            const isHighlighted = isDragSelecting && draggingSubTextRef.current === cleanText
                              ? (dragStartIdx !== null && dragEndIdx !== null &&
                                 index >= Math.min(dragStartIdx, dragEndIdx) &&
                                 index <= Math.max(dragStartIdx, dragEndIdx))
                              : (selectedSubText === cleanText &&
                                 index >= lookupStartIndex &&
                                 index < lookupEndIndex);

                            return (
                              <span
                                key={index}
                                data-char-index={index}
                                data-sub-text={cleanText}
                                onPointerDown={(e) => {
                                  if (showFullscreenCardEditor || showFullscreenLines || showCardCreationList) return;
                                  e.stopPropagation();
                                  draggingSubTextRef.current = cleanText;
                                  handleSubtitlePointerDown(e, index);
                                }}
                                onPointerMove={handleSubtitlePointerMove}
                                onPointerUp={(e) => handleSubtitlePointerUp(e, cleanText)}
                              onPointerCancel={handleSubtitlePointerCancel}
                              className={`transition-all duration-150 sub-outline-text font-medium select-none ${
                                showFullscreenCardEditor || showFullscreenLines || showCardCreationList
                                  ? "cursor-default text-white"
                                  : "cursor-pointer hover:text-red-300/80"
                              } ${
                                isHighlighted
                                  ? "sub-outline-text-highlighted text-red-300"
                                  : "text-white"
                              }`}
                              style={getSubStrokeStyle(subStroke)}
                              title="Click to lookup, long-press & drag to select more"
                            >
                              {char}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Floating Fullscreen Controls Overlay */}
              {isFullscreen && (
                <div 
                  className={`absolute bottom-0 left-0 right-0 bg-zinc-800 rounded-none p-4 pb-6 transition-all duration-300 z-20 border-none outline-none ${
                    showFullscreenCardEditor || showFullscreenLines
                      ? "opacity-0 translate-y-full pointer-events-none"
                      : !isPlaying 
                        ? "opacity-100 translate-y-0 pointer-events-auto" 
                        : "opacity-0 translate-y-full pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto"
                  }`}
                >
                  <div className="flex flex-col gap-3">
                    {/* Timeline slider */}
                    <div className={`flex items-center gap-3 transition-opacity ${!videoUrl ? "opacity-30 pointer-events-none" : ""}`}>
                      <span className="text-sm font-bold text-zinc-300 min-w-[55px] text-right select-none">
                        {formatTime(displayCurrentTime)}
                      </span>
                      <div className="flex-1 relative flex items-center group">
                        <input
                           type="range"
                          min={0}
                          max={displayDuration}
                          step={0.1}
                          value={displayCurrentTime}
                          onChange={handleSeek}
                          disabled={!videoUrl}
                          className="w-full h-1 bg-zinc-600 rounded-lg appearance-none cursor-pointer group-hover:bg-zinc-500 transition-all duration-200 no-thumb disabled:cursor-not-allowed"
                        />
                        {/* Progress bar fill visual overlay */}
                        <div 
                          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-zinc-400 rounded-l-lg pointer-events-none group-hover:bg-white transition-all"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-zinc-300 min-w-[55px] select-none">
                        {formatTime(displayDuration)}
                      </span>
                    </div>

                    {/* Actions panel */}
                    <div className="flex items-center justify-center flex-wrap gap-3 md:gap-4 px-1">
                      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5">
                        {/* Navigation inside fullscreen */}
                        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                          <button
                            onClick={() => skipSubtitle("prev")}
                            disabled={!videoUrl}
                            className="p-2.5 transition-all rounded-lg cursor-pointer text-zinc-300 hover:text-white hover:bg-zinc-700/40 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-zinc-300 disabled:hover:bg-transparent flex items-center justify-center"
                            title="Previous subtitle (←)"
                          >
                            <span className="material-symbols-rounded">skip_previous</span>
                          </button>
                          <button
                            onClick={() => skipSubtitle("next")}
                            disabled={!videoUrl}
                            className="p-2.5 transition-all rounded-lg cursor-pointer text-zinc-300 hover:text-white hover:bg-zinc-700/40 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-zinc-300 disabled:hover:bg-transparent flex items-center justify-center"
                            title="Next subtitle (→)"
                          >
                            <span className="material-symbols-rounded">skip_next</span>
                          </button>
                          <button
                            onClick={() => {
                              setShowFullscreenLines((prev) => !prev);
                              closeLookup();
                              if (showFullscreenCardEditor) {
                                setShowFullscreenCardEditor(false);
                              }
                            }}
                            className="p-2.5 transition-all rounded-lg cursor-pointer text-zinc-300 hover:text-white hover:bg-zinc-700/40 active:scale-95 flex items-center justify-center"
                            title="View subtitle lines list"
                          >
                            <span className="material-symbols-rounded">format_list_bulleted</span>
                          </button>
                          <button
                            onClick={replayCurrentSubtitle}
                            className="p-2.5 transition-all rounded-lg cursor-pointer text-zinc-300 hover:text-white hover:bg-zinc-700/40 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-zinc-300 disabled:hover:bg-transparent flex items-center justify-center"
                            title="Replay (R)"
                            disabled={!videoUrl || !activeSub}
                          >
                            <span className="material-symbols-rounded">replay</span>
                          </button>
                          <button
                            onClick={toggleLock}
                            className="p-2.5 transition-all rounded-lg cursor-pointer text-zinc-300 hover:text-white hover:bg-zinc-700/40 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-zinc-300 disabled:hover:bg-transparent flex items-center justify-center"
                            title={isLocked ? "Unlock subtitle segment" : "Lock subtitle segment"}
                            disabled={!videoUrl || (!isLocked && !activeSub)}
                          >
                            <span className="material-symbols-rounded">{isLocked ? "lock_open" : "lock"}</span>
                          </button>
                          <button
                            onClick={togglePlay}
                            disabled={!videoUrl}
                            className="p-2.5 transition-all rounded-lg cursor-pointer text-zinc-300 hover:text-white hover:bg-zinc-700/40 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-zinc-300 disabled:hover:bg-transparent flex items-center justify-center"
                            title={isPlaying ? "Pause" : "Play / Resume"}
                          >
                            <span className="material-symbols-rounded">{isPlaying ? "pause" : "play_arrow"}</span>
                          </button>
                          <button
                            onClick={toggleFullscreen}
                            className="p-2.5 transition-all rounded-lg cursor-pointer text-zinc-300 hover:text-white hover:bg-zinc-700/40 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-zinc-300 disabled:hover:bg-transparent flex items-center justify-center"
                            disabled={!videoUrl}
                            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                          >
                            <span className="material-symbols-rounded">{isFullscreen ? "fullscreen_exit" : "fullscreen"}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Fullscreen Dictionary Popup / Overlay */}
              <AnimatePresence>
                {isFullscreen && showDictPanel && (
                   <motion.div
                    initial={{ y: "-100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "-100%" }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="absolute top-0 left-0 right-0 max-h-[45vh] bg-zinc-800 rounded-none flex flex-col z-30 shadow-2xl border-none outline-none overflow-hidden"
                  >
                    <div className="flex-1 overflow-y-auto p-5 pt-6 pb-2">
                      {renderDictionaryContent()}
                    </div>
                    {/* Solid bottom bar to prevent results from bleeding through the bottom edge, providing a clean window frame look */}
                    <div className="h-5 bg-zinc-800 w-full shrink-0 z-10" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Fullscreen Left-Sliding Subtitle Lines Panel */}
              <AnimatePresence>
                {isFullscreen && showFullscreenLines && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/60 z-40 cursor-default"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                    />
                    <motion.div
                      initial={{ x: "-100%" }}
                      animate={{ x: 0 }}
                      exit={{ x: "-100%" }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      onAnimationComplete={() => {
                        if (fullscreenActiveSubScrollRef.current && fullscreenListContainerRef.current) {
                          fullscreenListContainerRef.current.scrollTop = fullscreenActiveSubScrollRef.current.offsetTop;
                        }
                      }}
                      className="absolute top-0 left-0 bottom-0 w-full max-w-md bg-zinc-800 border-none outline-none z-50 shadow-2xl flex flex-col p-6 overflow-hidden"
                    >
                      <div className="flex items-center justify-between pb-4 mb-3 border-none outline-none shrink-0 gap-2">
                        <span className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-400">
                          Lines of Subtitles {filteredSubtitles.length}
                        </span>
                        <button
                          onClick={() => setShowFullscreenLines(false)}
                          className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
                        >
                          CLOSE
                        </button>
                      </div>

                      {/* Search bar inside lines panel */}
                      <div className="flex items-center gap-2 mb-3 shrink-0">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            placeholder="Search"
                            value={subSearchQuery}
                            onChange={(e) => setSubSearchQuery(e.target.value)}
                            className="w-full border-none bg-zinc-900/50 px-5 py-2.5 text-xs text-white focus:outline-none placeholder-zinc-400 font-mono rounded-full"
                          />
                        </div>
                        {subtitles.length > 0 && (
                          <>
                            {renderDelayControl()}
                            <button
                              onClick={handleExportLrc}
                              className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none shrink-0"
                              title="Export subtitles as .lrc file"
                            >
                              .LRC
                            </button>
                            <button
                              onClick={handleExportSubtitles}
                              className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none shrink-0"
                              title="Export subtitles with episode name and timestamp alterations"
                            >
                              EXPORT
                            </button>
                          </>
                        )}
                      </div>

                      {/* Scrollable list of lines */}
                      <div 
                        ref={fullscreenListContainerRef}
                        className="relative flex-1 space-y-1.5 pr-1 min-h-0 overflow-y-auto"
                      >
                        {subtitles.length === 0 ? null : filteredSubtitles.length === 0 ? (
                          <div className="text-center py-12 text-zinc-500 font-mono text-xs uppercase select-none">
                            No matches found
                          </div>
                        ) : (
                          filteredSubtitles.map((sub) => {
                            const isCurrentlyActive = activeSub && (sub.id === activeSub.id || sub.startTime === activeSub.startTime);

                            return (
                              <div
                                key={sub.id}
                                ref={isCurrentlyActive ? fullscreenActiveSubScrollRef : null}
                                onClick={() => jumpToSubtitle(sub)}
                                className={`w-full text-left p-3 rounded-md transition-all flex items-center justify-between gap-3 cursor-pointer ${
                                  isCurrentlyActive
                                    ? "bg-zinc-900 text-white shadow-none"
                                    : "bg-zinc-900/50 hover:bg-zinc-900 text-zinc-300"
                                }`}
                              >
                                <div className="flex-1 flex flex-col gap-1 min-w-0">
                                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-zinc-400 select-none w-full">
                                    <span>
                                      {formatPreciseTime(sub.startTime + subDelay)} - {formatPreciseTime(sub.endTime + subDelay)}
                                    </span>
                                  </div>
                                  <p className="text-sm font-jisho font-medium leading-relaxed select-text break-words">
                                    {sub.text}
                                  </p>
                                </div>
                                <div className="shrink-0 flex items-center gap-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopySubText(sub.id, sub.text);
                                    }}
                                    className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs"
                                    title="Copy text of this subtitle line"
                                  >
                                    {copiedSubId === sub.id ? "COPIED" : "COPY"}
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      alignSubtitleWithCurrentTime(sub);
                                    }}
                                    className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs"
                                    title="Align subtitle with current playback time (Jidoujisho style)"
                                  >
                                    SET
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              {/* Fullscreen Right-Sliding Card Creation Panel */}
              <AnimatePresence>
                {isFullscreen && showFullscreenCardEditor && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/60 z-40 cursor-default"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                    />
                    <motion.div
                      initial={{ x: "100%" }}
                      animate={{ x: 0 }}
                      exit={{ x: "100%" }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      className="absolute top-0 right-0 bottom-0 w-full max-w-md bg-zinc-800 border-none outline-none z-50 shadow-2xl flex flex-col p-6 overflow-hidden"
                    >
                      <div className="flex items-center justify-start gap-2 pb-4 mb-3 border-none outline-none shrink-0">
                        <button
                          onClick={handleCancelFullscreenCard}
                          className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
                        >
                          CANCEL
                        </button>
                        <button
                          onClick={handleSaveFullscreenCard}
                          className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
                        >
                          SAVE
                        </button>
                      </div>

                      {/* Media Preview (only if media exists, no box or outlines or placeholders) */}
                      {(() => {
                        const picSrc = resolveMediaSrc(fullscreenCardFields["Picture"]);
                        const wordAudioSrc = resolveMediaSrc(fullscreenCardFields["Word Audio"]);
                        const sentenceAudioSrc = resolveMediaSrc(fullscreenCardFields["Sentence Audio"]);

                        if (!picSrc && !wordAudioSrc && !sentenceAudioSrc) return null;

                        return (
                          <div className="flex flex-col gap-2 mb-3 shrink-0">
                            {picSrc && (
                              <div className="relative w-full overflow-hidden rounded-lg flex items-center justify-center">
                                <img src={picSrc} alt="Captured frame preview" className="max-h-48 w-full object-contain rounded-lg" />
                              </div>
                            )}
                            {wordAudioSrc && (
                              <AudioPreviewPlayer src={wordAudioSrc} label="Word Audio" />
                            )}
                            {sentenceAudioSrc && (
                              <AudioPreviewPlayer src={sentenceAudioSrc} />
                            )}
                          </div>
                        );
                      })()}

                    {/* Fields */}
                    <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                      {DEFAULT_CARD_TEMPLATE.fields.map((fieldName) => {
                        const fieldValue = fullscreenCardFields[fieldName] || "";
                        const showPictureBtn = fieldName === "Picture" && !fieldValue;
                        const showSentenceAudioBtns = fieldName === "Sentence Audio" && !fieldValue;

                        return (
                          <div key={fieldName} className="flex flex-col gap-1">
                            <label className="text-[11px] font-mono font-bold text-zinc-400">
                              {fieldName}
                            </label>
                            <div className="relative w-full">
                              <textarea
                                ref={(el) => {
                                  if (el) {
                                    el.style.height = "auto";
                                    el.style.height = `${Math.max(30, el.scrollHeight)}px`;
                                  }
                                }}
                                value={fieldValue}
                                onChange={(e) => {
                                  setFullscreenCardFields((prev) => ({
                                    ...prev,
                                    [fieldName]: e.target.value,
                                  }));
                                  e.target.style.height = "auto";
                                  e.target.style.height = `${Math.max(30, e.target.scrollHeight)}px`;
                                }}
                                onPaste={(e) => handleFieldPaste(e, fieldName)}
                                rows={1}
                                className={`w-full bg-zinc-900/50 rounded-md px-3 py-1.5 text-xs text-zinc-200 font-sans border-none outline-none focus:outline-none focus:ring-0 transition-colors resize-none overflow-hidden ${
                                  showPictureBtn ? "pr-24" : showSentenceAudioBtns ? "pr-36" : ""
                                }`}
                              />
                              {showPictureBtn && (
                                <button
                                  type="button"
                                  onClick={handleCapturePicture}
                                  className="absolute right-1.5 top-1 px-2.5 py-1 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/50 font-bold font-mono text-[10px] border-none outline-none z-10"
                                >
                                  <span>CAPTURE</span>
                                </button>
                              )}
                              {showSentenceAudioBtns && (
                                <div className="absolute right-1.5 top-1 flex items-center gap-1 z-10">
                                  <button
                                    type="button"
                                    onClick={isManualRecording ? handleStopManualRecord : handleStartManualRecord}
                                    disabled={isRecordingAudio}
                                    className="px-2.5 py-1 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/50 font-bold font-mono text-[10px] border-none outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    <span>{isManualRecording ? "STOP" : "RECORD"}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleRecordSentenceAudio}
                                    disabled={isManualRecording || isRecordingAudio}
                                    className="px-2.5 py-1 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/50 font-bold font-mono text-[10px] border-none outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    <span>AUTO</span>
                                  </button>
                                </div>
                              )}
                              {fieldName === "Sentence Audio" && isRecordingAudio && !isManualRecording && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800/80 rounded-b-md overflow-hidden pointer-events-none">
                                  <div
                                    className="h-full bg-white transition-[width] duration-75 ease-linear"
                                    style={{ width: `${recordingProgress}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                </>
                )}
              </AnimatePresence>
            </div>
            <div className="w-full max-w-4xl mx-auto bg-zinc-800 rounded-xl p-5 select-none transition-all duration-300 border-none outline-none">
              <div className="flex flex-col gap-4">
                {/* Timeline slider row */}
                <div className={`flex items-center gap-4 w-full transition-opacity ${!videoUrl ? "opacity-30 pointer-events-none" : ""}`}>
                  <span className="text-sm font-bold text-zinc-300 min-w-[55px] text-right select-none">
                    {formatTime(displayCurrentTime)}
                  </span>
                  <div className="flex-1 relative flex items-center group">
                    <input
                      type="range"
                      min={0}
                      max={displayDuration}
                      step={0.1}
                      value={displayCurrentTime}
                      onChange={handleSeek}
                      disabled={!videoUrl}
                      className="w-full h-1 bg-zinc-600 rounded-lg appearance-none cursor-pointer group-hover:bg-zinc-500 transition-all duration-200 no-thumb disabled:cursor-not-allowed"
                    />
                    {/* Progress bar fill visual overlay */}
                    <div 
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-zinc-400 rounded-l-lg pointer-events-none group-hover:bg-white transition-all episode-progress-bar-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-zinc-300 min-w-[55px] select-none">
                    {formatTime(displayDuration)}
                  </span>
                </div>

                {/* Bottom action row: Left, center, and right controls */}
                <div className="flex items-center justify-center flex-wrap gap-3 md:gap-4 px-1">
                  <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5">
                    {/* Subtitle Navigation Row */}
                    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                      <button
                        onClick={() => skipSubtitle("prev")}
                        disabled={!videoUrl}
                        className="p-2.5 transition-all rounded-lg cursor-pointer text-zinc-300 hover:text-white hover:bg-zinc-700/40 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-zinc-300 disabled:hover:bg-transparent flex items-center justify-center"
                        title="Previous subtitle (←)"
                      >
                        <span className="material-symbols-rounded">skip_previous</span>
                      </button>
                      <button
                        onClick={() => skipSubtitle("next")}
                        disabled={!videoUrl}
                        className="p-2.5 transition-all rounded-lg cursor-pointer text-zinc-300 hover:text-white hover:bg-zinc-700/40 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-zinc-300 disabled:hover:bg-transparent flex items-center justify-center"
                        title="Next subtitle (→)"
                      >
                        <span className="material-symbols-rounded">skip_next</span>
                      </button>
                      <button
                        onClick={replayCurrentSubtitle}
                        className="p-2.5 transition-all rounded-lg cursor-pointer text-zinc-300 hover:text-white hover:bg-zinc-700/40 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-zinc-300 disabled:hover:bg-transparent flex items-center justify-center"
                        title="Replay (R)"
                        disabled={!videoUrl || !activeSub}
                      >
                        <span className="material-symbols-rounded">replay</span>
                      </button>
                      <button
                        onClick={toggleLock}
                        className="p-2.5 transition-all rounded-lg cursor-pointer text-zinc-300 hover:text-white hover:bg-zinc-700/40 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-zinc-300 disabled:hover:bg-transparent flex items-center justify-center"
                        title={isLocked ? "Unlock subtitle segment" : "Lock subtitle segment"}
                        disabled={!videoUrl || (!isLocked && !activeSub)}
                      >
                        <span className="material-symbols-rounded">{isLocked ? "lock_open" : "lock"}</span>
                      </button>
                      <button
                        onClick={togglePlay}
                        disabled={!videoUrl}
                        className="p-2.5 transition-all rounded-lg cursor-pointer text-zinc-300 hover:text-white hover:bg-zinc-700/40 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-zinc-300 disabled:hover:bg-transparent flex items-center justify-center"
                        title={isPlaying ? "Pause" : "Play / Resume"}
                      >
                        <span className="material-symbols-rounded">{isPlaying ? "pause" : "play_arrow"}</span>
                      </button>
                      <button
                        onClick={toggleFullscreen}
                        className="p-2.5 transition-all rounded-lg cursor-pointer text-zinc-300 hover:text-white hover:bg-zinc-700/40 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-zinc-300 disabled:hover:bg-transparent flex items-center justify-center"
                        disabled={!videoUrl}
                        title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                      >
                        <span className="material-symbols-rounded">{isFullscreen ? "fullscreen_exit" : "fullscreen"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div> {/* End Left Column */}

          {/* Right Column: Active Content Panel (Header opened content) */}
          {isAnyHeaderPanelOpen && (
            <div className="w-full lg:w-1/2 flex-1 flex flex-col gap-4 min-w-0">
              {/* Standard dictionary view (below the media controls in player screen) */}
              <AnimatePresence>
                {!isFullscreen && showDictPanel && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="w-full bg-zinc-800 px-2 pb-4 pt-0 overflow-hidden border-none outline-none shadow-none"
                  >
                    {renderDictionaryContent()}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Dictionaries list collapsible panel */}
              <AnimatePresence>
                {!isFullscreen && showDictionariesList && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="w-full bg-zinc-800 px-2 pb-4 pt-0 overflow-hidden border-none outline-none shadow-none"
                  >
                    <div className="bg-zinc-800 rounded-xl p-5 shadow-none">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-400">
                          Dictionaries {dictionaries.length}
                        </span>
                        <button
                          onClick={() => document.getElementById("dict-upload-player")?.click()}
                          className="p-2 bg-zinc-900/50 hover:bg-zinc-700/30 border border-zinc-700/30 text-zinc-400 hover:text-white rounded-full transition-all flex items-center justify-center shrink-0 cursor-pointer h-9 w-9"
                          title="Import Dictionary"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      
                      {dictImportError && (
                        <p className="text-xs text-red-400 mb-3 font-mono">{dictImportError}</p>
                      )}

                      <input
                        id="dict-upload-player"
                        type="file"
                        accept=".zip"
                        className="hidden"
                        onChange={onDictFileChange}
                        disabled={isImportingDict}
                      />

                      {(dictionaries.length > 0 || isImportingDict) && (
                        <div className="space-y-1.5 max-h-[350px] overflow-y-auto pr-1">
                          {dictionaries.map((dict) => {
                            const isConfirming = confirmingDeleteId === dict.id;
                            const isDeleting = deletingDictId === dict.id;
                            const isHidden = !!dict.hidden;

                            return (
                              <div
                                key={dict.id}
                                className={`w-full text-left p-3 rounded-md bg-zinc-900/50 hover:bg-zinc-900 text-zinc-300 transition-all flex items-center justify-between gap-3 border-none outline-none relative overflow-hidden ${
                                  isHidden ? "opacity-60" : ""
                                }`}
                              >
                                <p className={`text-sm font-sans font-semibold leading-relaxed ${isHidden ? "line-through text-zinc-400" : ""}`}>
                                  {dict.title}
                                </p>
                                
                                {!isDeleting && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    {!deletingDictId && !isImportingDict && (
                                      <>
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            await MangaDB.toggleDictionaryHidden(dict.id);
                                            await loadDictionaries();
                                          }}
                                          className="p-1.5 text-center transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 flex items-center justify-center outline-none border-none"
                                          title={isHidden ? "Show dictionary" : "Hide dictionary"}
                                        >
                                          <span className="material-symbols-rounded !text-[18px] !w-[18px] !h-[18px] !leading-[18px]">
                                            {isHidden ? "visibility_off" : "visibility"}
                                          </span>
                                        </button>

                                        {!isConfirming ? (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setConfirmingDeleteId(dict.id);
                                            }}
                                            className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs"
                                          >
                                            <span>DELETE</span>
                                          </button>
                                        ) : (
                                          <>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteDictionary(dict.id);
                                              }}
                                              className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs"
                                            >
                                              <span>YES</span>
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setConfirmingDeleteId(null);
                                              }}
                                              className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs"
                                            >
                                              <span>NO</span>
                                            </button>
                                          </>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}

                                {isDeleting && (
                                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800/80">
                                    <div
                                      className="h-full bg-white transition-all duration-100"
                                      style={{ width: `${deleteProgress}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {isImportingDict && (
                            <div className="w-full text-left p-3 rounded-md bg-zinc-900/50 text-zinc-300 flex items-center justify-between gap-3 border-none outline-none relative overflow-hidden">
                              <p className="text-sm font-sans font-semibold leading-relaxed">
                                {importingDictName || "Importing dictionary..."}
                              </p>
                              <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800/80">
                                <div
                                  className="h-full bg-white transition-all duration-100"
                                  style={{ width: `${dictImportProgress ? dictImportProgress.percent : 0}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Card Creation collapsible panel */}
              <AnimatePresence>
                {!isFullscreen && showCardCreationList && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="w-full bg-zinc-800 px-2 pb-4 pt-0 overflow-hidden border-none outline-none shadow-none"
                  >
                    <CardCreationPanel
                      initialWord={selectedSubText}
                      initialSentence={activeSub?.text}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Watch Stats collapsible panel */}
              <AnimatePresence>
                {!isFullscreen && showStatsPanel && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="w-full bg-zinc-800 px-2 pb-4 pt-0 overflow-hidden border-none outline-none shadow-none"
                  >
                    <StatsPanel
                      watchStats={watchStats}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Anime Tracker collapsible panel */}
              <AnimatePresence>
                {!isFullscreen && showTrackPanel && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="w-full bg-zinc-800 px-2 pb-4 pt-0 overflow-hidden border-none outline-none shadow-none"
                  >
                    <AnimeTrackerPanel />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Settings collapsible panel */}
              <AnimatePresence>
                {!isFullscreen && showSettingsPanel && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="w-full bg-zinc-800 px-2 pb-4 pt-0 overflow-hidden border-none outline-none shadow-none"
                  >
                    <SettingsPanel />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Subtitles collapsible panel */}
              <AnimatePresence>
                {!isFullscreen && showSubtitlesList && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="w-full bg-zinc-800 px-2 pb-4 pt-0 overflow-hidden border-none outline-none shadow-none"
                  >
                    <div className="w-full bg-zinc-800 flex flex-col overflow-hidden">
                      {/* Header section with static subtitles label */}
                      <div className="py-4 flex items-center justify-between select-none shrink-0 bg-zinc-800">
                        <span className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-400">
                          Lines of Subtitles {filteredSubtitles.length}
                        </span>
                      </div>

                      {/* Sidebar Contents */}
                      <div className="flex-1 overflow-y-auto bg-zinc-800 pt-0">
                        <div className="flex flex-col h-full overflow-hidden">
                          {/* Search bar inside subtitles */}
                          <div className="flex items-center gap-2 mb-3 shrink-0 select-text">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                placeholder="Search"
                                value={subSearchQuery}
                                onChange={(e) => setSubSearchQuery(e.target.value)}
                                className="w-full border-none bg-zinc-900/50 px-5 py-2.5 text-xs text-white focus:outline-none placeholder-zinc-400 font-mono rounded-full"
                              />
                            </div>
                            {subtitles.length > 0 && (
                              <>
                                {renderDelayControl()}
                                <button
                                  onClick={handleExportLrc}
                                  className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none shrink-0"
                                  title="Export subtitles as .lrc file"
                                >
                                  .LRC
                                </button>
                                <button
                                  onClick={handleExportSubtitles}
                                  className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none shrink-0"
                                  title="Export subtitles with episode name and timestamp alterations"
                                >
                                  EXPORT
                                </button>
                                <button
                                  onClick={handleEmptySubtitles}
                                  className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none shrink-0"
                                >
                                  EMPTY
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => document.getElementById("sub-upload-header")?.click()}
                              className="p-2 bg-zinc-900/50 hover:bg-zinc-700/30 border-none text-zinc-400 hover:text-white rounded-full transition-all flex items-center justify-center shrink-0 cursor-pointer h-9 w-9"
                              title="Import Subtitles"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Scrollable subtitle lines list */}
                          <div 
                            ref={listContainerRef}
                            className="relative flex-1 space-y-1.5 pr-1 max-h-[450px] overflow-y-auto"
                          >
                            {subtitles.length === 0 ? null : filteredSubtitles.length === 0 ? (
                              <div className="text-center py-12 text-zinc-500 font-mono text-xs uppercase select-none">
                                No matches found
                              </div>
                            ) : (
                              filteredSubtitles.map((sub) => {
                                const isCurrentlyActive = activeSub && (sub.id === activeSub.id || sub.startTime === activeSub.startTime);

                                return (
                                  <div
                                    key={sub.id}
                                    ref={isCurrentlyActive ? activeSubScrollRef : null}
                                    onClick={() => jumpToSubtitle(sub)}
                                    className={`w-full text-left p-3 rounded-md transition-all flex items-center justify-between gap-3 cursor-pointer ${
                                      isCurrentlyActive
                                        ? "bg-zinc-900 text-white shadow-none"
                                        : "bg-zinc-900/50 hover:bg-zinc-900 text-zinc-300"
                                    }`}
                                  >
                                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                                      <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-zinc-400 select-none w-full">
                                        <span>
                                          {formatPreciseTime(sub.startTime + subDelay)} - {formatPreciseTime(sub.endTime + subDelay)}
                                        </span>
                                      </div>
                                      <p className="text-sm font-jisho font-medium leading-relaxed select-text break-words">
                                        {sub.text}
                                      </p>
                                    </div>
                                    <div className="shrink-0 flex items-center gap-1">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCopySubText(sub.id, sub.text);
                                        }}
                                        className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs"
                                        title="Copy text of this subtitle line"
                                      >
                                        {copiedSubId === sub.id ? "COPIED" : "COPY"}
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          alignSubtitleWithCurrentTime(sub);
                                        }}
                                        className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs"
                                        title="Align subtitle with current playback time (Jidoujisho style)"
                                      >
                                        SET
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
