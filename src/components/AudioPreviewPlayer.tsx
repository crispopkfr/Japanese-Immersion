import React, { useState, useRef, useEffect } from "react";

interface AudioPreviewPlayerProps {
  src: string;
  label?: string;
}

export const AudioPreviewPlayer: React.FC<AudioPreviewPlayerProps> = ({ src, label }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [src]);

  const updateMetadata = () => {
    if (audioRef.current) {
      const d = audioRef.current.duration;
      if (d && !isNaN(d) && isFinite(d) && d > 0) {
        setDuration(d);
      }
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((err) => {
        if (err && err.name !== "AbortError") console.error(err);
      });
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const seekVal = parseFloat(e.target.value);
    audioRef.current.currentTime = seekVal;
    setCurrentTime(seekVal);
  };

  const formatTime = (timeInSecs: number) => {
    if (isNaN(timeInSecs) || timeInSecs < 0 || !isFinite(timeInSecs)) return "00:00";
    const m = Math.floor(timeInSecs / 60);
    const s = Math.floor(timeInSecs % 60);
    const pad = (num: number) => String(num).padStart(2, "0");
    return `${pad(m)}:${pad(s)}`;
  };

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div className="w-full flex flex-col gap-1">
      {label && (
        <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
          {label}
        </div>
      )}
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
            updateMetadata();
          }
        }}
        onLoadedMetadata={updateMetadata}
        onLoadedData={updateMetadata}
        onDurationChange={updateMetadata}
        onCanPlayThrough={updateMetadata}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
      />
      <div className="flex items-center gap-3 py-1">
        <button
          type="button"
          onClick={togglePlay}
          className="px-2 py-1 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-300 hover:text-white hover:bg-zinc-700/50 font-bold font-mono text-xs shrink-0 select-none border-none outline-none"
        >
          <span>{isPlaying ? "PAUSE" : "PLAY"}</span>
        </button>

        <div className="flex-1 relative flex items-center group">
          <input
            type="range"
            min={0}
            max={duration && duration > 0 ? duration : 100}
            step={0.01}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 bg-zinc-600 rounded-lg appearance-none cursor-pointer group-hover:bg-zinc-500 transition-all duration-200 no-thumb"
          />
          {/* Progress bar fill visual overlay */}
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-zinc-400 rounded-l-lg pointer-events-none group-hover:bg-white transition-all episode-progress-bar-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <span className="text-xs font-bold text-zinc-400 min-w-[36px] text-right select-none">
          {formatTime(currentTime)}
        </span>
      </div>
    </div>
  );
};
