import React, { useState } from "react";
import { parseFurigana } from "../utils";

interface FuriganaSegmentProps {
  kanji: string;
  kana: string;
  key?: string;
}

function FuriganaSegment({ kanji, kana }: FuriganaSegmentProps) {
  const [show, setShow] = useState(false);

  return (
    <span className="relative inline-block mx-0.5">
      <span
        onClick={(e) => {
          e.stopPropagation();
          setShow(!show);
        }}
        className="underline decoration-dotted decoration-zinc-400 decoration-2 underline-offset-4 cursor-pointer hover:text-zinc-300 text-white font-serif font-bold transition-all select-none"
        title="Click to view guide kana"
      >
        {kanji}
      </span>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-black text-white text-[11px] px-2 py-0.5 font-mono rounded whitespace-nowrap shadow-xl z-50 animate-fade-in border border-zinc-800">
          {kana}
        </span>
      )}
    </span>
  );
}

interface InteractiveFuriganaProps {
  text: string;
}

export function InteractiveFurigana({ text }: InteractiveFuriganaProps) {
  if (!text) return null;
  const segments = parseFurigana(text);

  return (
    <span className="leading-relaxed whitespace-pre-wrap">
      {segments.map((seg) => {
        if (seg.type === "furigana" && seg.kana) {
          return <FuriganaSegment key={seg.id} kanji={seg.text} kana={seg.kana} />;
        }
        return <span key={seg.id}>{seg.text}</span>;
      })}
    </span>
  );
}
