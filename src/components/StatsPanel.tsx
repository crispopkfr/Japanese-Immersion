import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

export interface WatchStatsData {
  // key: "YYYY-MM-DD" -> seconds watched
  [dateStr: string]: number;
}

interface StatsPanelProps {
  watchStats: WatchStatsData;
  onResetStats?: () => void;
  onAddManualMinutes?: (mins: number) => void;
}

export function getTodayDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatSecondsToHoursAndMinutes(seconds: number): {
  hoursNumStr: string;
  detailedStr: string;
  totalHoursNum: number;
} {
  const safeSeconds = Math.max(0, isNaN(seconds) ? 0 : seconds);
  const totalHoursNum = safeSeconds / 3600;
  const hours = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = Math.floor(safeSeconds % 60);

  let detailedStr = "";
  if (hours > 0) {
    detailedStr = `${hours}h ${mins}m`;
  } else if (mins > 0) {
    detailedStr = `${mins}m ${secs}s`;
  } else {
    detailedStr = `${secs}s`;
  }

  const hoursNumStr = totalHoursNum > 0 && totalHoursNum < 0.1
    ? totalHoursNum.toFixed(2)
    : totalHoursNum.toFixed(1);

  return { hoursNumStr, detailedStr, totalHoursNum };
}

export function computeWatchStatsBreakdown(watchStats: WatchStatsData) {
  const now = new Date();
  const todayKey = getTodayDateString(now);

  // Today
  const todaySec = watchStats[todayKey] || 0;

  // Week to date (Monday of current week at 00:00:00)
  const monday = new Date(now);
  const dayOfWeek = monday.getDay(); // 0 is Sun, 1 is Mon...
  const diffToMon = monday.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  monday.setDate(diffToMon);
  monday.setHours(0, 0, 0, 0);

  // Month to date (1st of month at 00:00:00)
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  // Year to date (1st of year at 00:00:00)
  const firstOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);

  // End of today (23:59:59.999)
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  let weekSec = 0;
  let monthSec = 0;
  let yearSec = 0;
  let allTimeSec = 0;

  Object.entries(watchStats || {}).forEach(([dateStr, sec]) => {
    if (dateStr.includes("_H")) return;
    const val = typeof sec === "number" && !isNaN(sec) ? sec : 0;
    allTimeSec += val;

    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return;
    const entryDate = new Date(y, m - 1, d, 0, 0, 0, 0);

    if (entryDate >= monday && entryDate <= endOfToday) {
      weekSec += val;
    }
    if (entryDate >= firstOfMonth && entryDate <= endOfToday) {
      monthSec += val;
    }
    if (entryDate >= firstOfYear && entryDate <= endOfToday) {
      yearSec += val;
    }
  });

  return {
    today: formatSecondsToHoursAndMinutes(todaySec),
    weekToDate: formatSecondsToHoursAndMinutes(weekSec),
    monthToDate: formatSecondsToHoursAndMinutes(monthSec),
    yearToDate: formatSecondsToHoursAndMinutes(yearSec),
    allTime: formatSecondsToHoursAndMinutes(allTimeSec),
    rawSeconds: {
      today: todaySec,
      weekToDate: weekSec,
      monthToDate: monthSec,
      yearToDate: yearSec,
      allTime: allTimeSec,
    },
  };
};

export const StatsPanel: React.FC<StatsPanelProps> = ({
  watchStats,
}) => {
  const breakdown = computeWatchStatsBreakdown(watchStats);
  const [isTodayExpanded, setIsTodayExpanded] = useState(true);
  const [isWeekExpanded, setIsWeekExpanded] = useState(false);
  const [isMonthExpanded, setIsMonthExpanded] = useState(false);
  const [isYearExpanded, setIsYearExpanded] = useState(false);

  const [hoveredYearDay, setHoveredYearDay] = useState<{
    dateStr: string;
    dateFormatted: string;
    timeFormatted: string;
    sec: number;
  } | null>(null);
  const [clickedYearDay, setClickedYearDay] = useState<{
    dateStr: string;
    dateFormatted: string;
    timeFormatted: string;
    sec: number;
  } | null>(null);

  // Japanese single kanji for days: Sun=日, Mon=月, Tue=火, Wed=水, Thu=木, Fri=金, Sat=土
  const jaDays = ["日", "月", "火", "水", "木", "金", "土"];

  // Compute last 7 days history for bar chart
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = getTodayDateString(d);
    const dayLabel = jaDays[d.getDay()];
    const sec = watchStats[dateStr] || 0;
    const timeFormatted = formatSecondsToHoursAndMinutes(sec).detailedStr;
    const monthNum = d.getMonth() + 1;
    const dayNum = d.getDate();
    const dateFormatted = `${monthNum}/${dayNum}`;
    return { index: i, dateStr, dayLabel, sec, timeFormatted, dateFormatted };
  });

  const maxSecIn7Days = Math.max(1, ...last7Days.map((item) => item.sec));

  const [hoveredWeekIndex, setHoveredWeekIndex] = useState<number | null>(null);
  const [clickedWeekIndex, setClickedWeekIndex] = useState<number | null>(null);
  const weekTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleWeekBarClick = (index: number) => {
    if (weekTimerRef.current) {
      clearTimeout(weekTimerRef.current);
    }
    setClickedWeekIndex(index);
    weekTimerRef.current = setTimeout(() => {
      setClickedWeekIndex(null);
      setHoveredWeekIndex(null);
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (weekTimerRef.current) {
        clearTimeout(weekTimerRef.current);
      }
    };
  }, []);

  const activeWeekHoverDay =
    hoveredWeekIndex !== null ? last7Days[hoveredWeekIndex] : null;
  const activeWeekDisplayDay =
    clickedWeekIndex !== null
      ? last7Days[clickedWeekIndex]
      : activeWeekHoverDay;

  // Compute 24 hours of Today for line graph
  const todayKey = getTodayDateString();
  const todaySec = watchStats[todayKey] || 0;
  const now = new Date();

  const todayHours = Array.from({ length: 24 }).map((_, h) => {
    const hourFormatted = `${String(h).padStart(2, "0")}:00`;
    const hourKey = `${todayKey}_H${String(h).padStart(2, "0")}`;
    const sec = watchStats[hourKey] || 0;
    const detailedStr = formatSecondsToHoursAndMinutes(sec).detailedStr;
    return { index: h, hourFormatted, sec, detailedStr };
  });

  const sumHourlySec = todayHours.reduce((acc, curr) => acc + curr.sec, 0);

  if (todaySec > sumHourlySec) {
    const currentH = now.getHours();
    const diff = todaySec - sumHourlySec;
    todayHours[currentH].sec += diff;
    todayHours[currentH].detailedStr = formatSecondsToHoursAndMinutes(
      todayHours[currentH].sec
    ).detailedStr;
  }

  const maxTodayHourSec = Math.max(1, ...todayHours.map((item) => item.sec));

  // Compute last 30 days history for line graph
  const last30Days = Array.from({ length: 30 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const dateStr = getTodayDateString(d);
    const sec = watchStats[dateStr] || 0;
    const detailedStr = formatSecondsToHoursAndMinutes(sec).detailedStr;
    const monthNum = d.getMonth() + 1;
    const dayNum = d.getDate();
    const dateFormatted = `${monthNum}/${dayNum}`;
    return { index: i, d, dateStr, sec, detailedStr, dateFormatted };
  });

  const max30DaySec = Math.max(1, ...last30Days.map((item) => item.sec));

  // Generate SVG coordinates for line graphs
  const svgWidth = 600;
  const svgHeight = 150;
  const paddingLeft = 12;
  const paddingRight = 12;
  const paddingTop = 20;
  const paddingBottom = 28;
  const graphWidth = svgWidth - paddingLeft - paddingRight;
  const graphHeight = svgHeight - paddingTop - paddingBottom;
  const baseY = svgHeight - paddingBottom;

  // Today points
  const todayPoints = todayHours.map((item, i) => {
    const x = paddingLeft + (i / 23) * graphWidth;
    const ratio = Math.min(1, item.sec / maxTodayHourSec);
    const y = baseY - ratio * graphHeight;
    return { ...item, x, y };
  });

  const todayLinePath = todayPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const todayAreaPath = `${todayLinePath} L ${todayPoints[
    todayPoints.length - 1
  ].x.toFixed(1)} ${baseY} L ${todayPoints[0].x.toFixed(1)} ${baseY} Z`;

  const [hoveredTodayPointIndex, setHoveredTodayPointIndex] = useState<
    number | null
  >(null);
  const activeTodayHoverPoint =
    hoveredTodayPointIndex !== null ? todayPoints[hoveredTodayPointIndex] : null;

  // Month points
  const points = last30Days.map((item, i) => {
    const x = paddingLeft + (i / 29) * graphWidth;
    const ratio = Math.min(1, item.sec / max30DaySec);
    const y = baseY - ratio * graphHeight;
    return { ...item, x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(
    1
  )} ${baseY} L ${points[0].x.toFixed(1)} ${baseY} Z`;

  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(
    null
  );
  const activeHoverPoint =
    hoveredPointIndex !== null ? points[hoveredPointIndex] : null;

  // Calculate 365 days / 53 weeks for Year heat map
  const yearStartDate = new Date();
  yearStartDate.setDate(yearStartDate.getDate() - 364);
  // Adjust to preceding Sunday so first column starts on Sunday
  while (yearStartDate.getDay() !== 0) {
    yearStartDate.setDate(yearStartDate.getDate() - 1);
  }

  const yearDays: Array<{
    dateStr: string;
    dateFormatted: string;
    timeFormatted: string;
    sec: number;
    dayOfWeek: number;
    isFuture: boolean;
  }> = [];

  const currDate = new Date(yearStartDate);
  const todayDateStr = getTodayDateString();

  while (currDate <= now || yearDays.length % 7 !== 0) {
    const dateStr = getTodayDateString(currDate);
    const sec = watchStats[dateStr] || 0;
    const timeFormatted = formatSecondsToHoursAndMinutes(sec).detailedStr;
    const monthNum = currDate.getMonth() + 1;
    const dayNum = currDate.getDate();
    const dateFormatted = `${monthNum}/${dayNum}/${currDate.getFullYear()}`;
    const isFuture = dateStr > todayDateStr;

    yearDays.push({
      dateStr,
      dateFormatted,
      timeFormatted,
      sec,
      dayOfWeek: currDate.getDay(),
      isFuture,
    });

    currDate.setDate(currDate.getDate() + 1);
    if (yearDays.length >= 364 && currDate.getDay() === 0 && dateStr >= todayDateStr) {
      break;
    }
  }

  const yearWeeks: typeof yearDays[] = [];
  for (let i = 0; i < yearDays.length; i += 7) {
    yearWeeks.push(yearDays.slice(i, i + 7));
  }

  const maxYearSec = Math.max(1, ...yearDays.map((item) => item.sec));
  const activeYearDay = hoveredYearDay || clickedYearDay;

  const statItems = [
    {
      id: "today",
      label: "Today",
      value: breakdown.today.detailedStr,
      expandable: true,
      isExpanded: isTodayExpanded,
      onToggle: () => setIsTodayExpanded((prev) => !prev),
    },
    {
      id: "week",
      label: "Week to Date",
      value: breakdown.weekToDate.detailedStr,
      expandable: true,
      isExpanded: isWeekExpanded,
      onToggle: () => setIsWeekExpanded((prev) => !prev),
    },
    {
      id: "month",
      label: "Month to Date",
      value: breakdown.monthToDate.detailedStr,
      expandable: true,
      isExpanded: isMonthExpanded,
      onToggle: () => setIsMonthExpanded((prev) => !prev),
    },
    {
      id: "year",
      label: "Year to Date",
      value: breakdown.yearToDate.detailedStr,
      expandable: true,
      isExpanded: isYearExpanded,
      onToggle: () => setIsYearExpanded((prev) => !prev),
    },
    {
      id: "all",
      label: "All Time",
      value: breakdown.allTime.detailedStr,
      expandable: false,
      isExpanded: false,
      onToggle: () => {},
    },
  ];

  return (
    <div className="bg-zinc-800 rounded-xl p-5 shadow-none text-white font-mono select-none">
      {/* Main Stats List */}
      <div className="flex flex-col gap-2">
        {statItems.map((item) => {
          if (item.expandable) {
            return (
              <div
                key={item.id}
                className="bg-zinc-900/70 rounded-xl flex flex-col overflow-hidden transition-colors"
              >
                <div
                  onClick={item.onToggle}
                  className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-zinc-800/50 transition-colors group select-none"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-400 group-hover:text-white transition-colors tracking-wider uppercase">
                      {item.label}
                    </span>
                  </div>
                  <span className="text-lg sm:text-xl font-black text-zinc-400 group-hover:text-white transition-colors tracking-tight">
                    {item.value}
                  </span>
                </div>

                {/* Expanded Content for Today Hourly Line Graph */}
                {item.id === "today" && (
                  <AnimatePresence>
                    {item.isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden bg-transparent p-4 pt-1"
                      >
                        <div className="flex items-center justify-end mb-2 h-4">
                          <span className="text-xs font-bold text-zinc-400 tracking-wider uppercase">
                            {activeTodayHoverPoint && (
                              <span>
                                {activeTodayHoverPoint.hourFormatted}:{" "}
                                {activeTodayHoverPoint.detailedStr}
                              </span>
                            )}
                          </span>
                        </div>

                        {/* SVG Line Graph */}
                        <div className="relative w-full pt-1">
                          <svg
                            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                            className="w-full h-auto overflow-visible select-none"
                          >
                            <defs>
                              <linearGradient
                                id="todayZincGrad"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="0%"
                                  stopColor="#a1a1aa"
                                  stopOpacity="0.35"
                                />
                                <stop
                                  offset="100%"
                                  stopColor="#a1a1aa"
                                  stopOpacity="0.0"
                                />
                              </linearGradient>
                            </defs>

                            {/* Gradient Fill under line */}
                            <path d={todayAreaPath} fill="url(#todayZincGrad)" />

                            {/* Main Line */}
                            <path
                              d={todayLinePath}
                              fill="none"
                              stroke="#a1a1aa"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />

                            {/* Points and Hover Areas */}
                            {todayPoints.map((p) => {
                              const isHovered =
                                hoveredTodayPointIndex === p.index;
                              const hasWatchTime = p.sec > 0;

                              return (
                                <g key={p.hourFormatted}>
                                  {/* Point Circle */}
                                  {(hasWatchTime || isHovered) && (
                                    <circle
                                      cx={p.x}
                                      cy={p.y}
                                      r={isHovered ? 5 : 3}
                                      className="transition-all duration-150"
                                      fill={
                                        isHovered ? "#ffffff" : "#a1a1aa"
                                      }
                                      stroke="#a1a1aa"
                                      strokeWidth={isHovered ? 2 : 1}
                                    />
                                  )}

                                  {/* Invisible hit target for hover */}
                                  <rect
                                    x={p.x - graphWidth / 46}
                                    y={0}
                                    width={graphWidth / 23}
                                    height={svgHeight}
                                    fill="transparent"
                                    className="cursor-pointer"
                                    onMouseEnter={() =>
                                      setHoveredTodayPointIndex(p.index)
                                    }
                                    onMouseLeave={() =>
                                      setHoveredTodayPointIndex(null)
                                    }
                                  />
                                </g>
                              );
                            })}
                          </svg>

                          {/* X-Axis Time Labels */}
                          <div className="flex justify-between items-center text-xs font-bold text-zinc-400 tracking-wider uppercase mt-2 px-1">
                            <span>00:00</span>
                            <span>12:00</span>
                            <span>23:00</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}

                {/* Expanded Content for Week Activity */}
                {item.id === "week" && (
                  <AnimatePresence>
                    {item.isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden bg-transparent p-4 pt-1"
                      >
                        <div className="flex items-center justify-end mb-2 h-4">
                          <span className="text-xs font-bold text-zinc-400 tracking-wider uppercase">
                            {activeWeekDisplayDay && (
                              <span>
                                {activeWeekDisplayDay.dateFormatted}:{" "}
                                {activeWeekDisplayDay.timeFormatted}
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="flex items-end justify-between gap-2 h-24 pt-2 px-1">
                          {last7Days.map((day) => {
                            const hasTime = day.sec > 0;
                            const ratio = maxSecIn7Days > 0 ? day.sec / maxSecIn7Days : 0;
                            const heightPct = hasTime
                              ? Math.min(100, Math.max(12, Math.round(12 + ratio * 88)))
                              : 6;
                            const isClicked = clickedWeekIndex === day.index;

                            return (
                              <div
                                key={day.dateStr}
                                onClick={() => handleWeekBarClick(day.index)}
                                onMouseEnter={() => setHoveredWeekIndex(day.index)}
                                onMouseLeave={() => setHoveredWeekIndex(null)}
                                className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group cursor-pointer"
                              >
                                <div className="w-full max-w-[28px] h-full flex items-end justify-center">
                                  <div style={{ height: `${heightPct}%` }} className="w-full flex items-end justify-center h-full max-h-full">
                                    <motion.div
                                      style={{ originY: 1, originX: 0.5 }}
                                      animate={
                                        isClicked
                                          ? { scaleY: [1, 0.15, 1] }
                                          : { scaleY: 1 }
                                      }
                                      transition={
                                        isClicked
                                          ? { duration: 0.4, ease: "easeInOut" }
                                          : { duration: 0.2 }
                                      }
                                      className={`w-full h-full rounded-t-sm transition-colors duration-200 weekly-graph-pillar ${
                                        isClicked
                                          ? "bg-white"
                                          : hasTime
                                          ? "bg-zinc-500 group-hover:bg-zinc-400"
                                          : "bg-zinc-800 group-hover:bg-zinc-700"
                                      }`}
                                    />
                                  </div>
                                </div>
                                <div className="h-4 flex items-center justify-center">
                                  <span
                                    className={`text-xs font-mono transition-colors ${
                                      isClicked
                                        ? "text-white font-bold"
                                        : hasTime
                                        ? "text-zinc-400 group-hover:text-white"
                                        : "text-zinc-500 group-hover:text-zinc-300"
                                    }`}
                                  >
                                    {day.dayLabel}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}

                {/* Expanded Content for Monthly Activity Line Graph */}
                {item.id === "month" && (
                  <AnimatePresence>
                    {item.isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden bg-transparent p-4 pt-1"
                      >
                        <div className="flex items-center justify-end mb-2 h-4">
                          <span className="text-xs font-bold text-zinc-400 tracking-wider uppercase">
                            {activeHoverPoint && (
                              <span>
                                {activeHoverPoint.dateFormatted}:{" "}
                                {activeHoverPoint.detailedStr}
                              </span>
                            )}
                          </span>
                        </div>

                        {/* SVG Line Graph */}
                        <div className="relative w-full pt-1">
                          <svg
                            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                            className="w-full h-auto overflow-visible select-none"
                          >
                            <defs>
                              <linearGradient
                                id="monthZincGrad"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="0%"
                                  stopColor="#a1a1aa"
                                  stopOpacity="0.35"
                                />
                                <stop
                                  offset="100%"
                                  stopColor="#a1a1aa"
                                  stopOpacity="0.0"
                                />
                              </linearGradient>
                            </defs>

                            {/* Gradient Fill under line */}
                            <path d={areaPath} fill="url(#monthZincGrad)" />

                            {/* Main Line */}
                            <path
                              d={linePath}
                              fill="none"
                              stroke="#a1a1aa"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />

                            {/* Points and Hover Areas */}
                            {points.map((p) => {
                              const isHovered =
                                hoveredPointIndex === p.index;
                              const hasWatchTime = p.sec > 0;

                              return (
                                <g key={p.dateStr}>
                                  {/* Point Circle */}
                                  {(hasWatchTime || isHovered) && (
                                    <circle
                                      cx={p.x}
                                      cy={p.y}
                                      r={isHovered ? 5 : 3}
                                      className="transition-all duration-150"
                                      fill={
                                        isHovered ? "#ffffff" : "#a1a1aa"
                                      }
                                      stroke="#a1a1aa"
                                      strokeWidth={isHovered ? 2 : 1}
                                    />
                                  )}

                                  {/* Invisible hit target for hover */}
                                  <rect
                                    x={p.x - graphWidth / 58}
                                    y={0}
                                    width={graphWidth / 29}
                                    height={svgHeight}
                                    fill="transparent"
                                    className="cursor-pointer"
                                    onMouseEnter={() =>
                                      setHoveredPointIndex(p.index)
                                    }
                                    onMouseLeave={() =>
                                      setHoveredPointIndex(null)
                                    }
                                  />
                                </g>
                              );
                            })}
                          </svg>

                          {/* X-Axis Date Labels */}
                          <div className="flex justify-between items-center text-xs font-bold text-zinc-400 tracking-wider uppercase mt-2 px-1">
                            <span>{points[0]?.dateFormatted}</span>
                            <span>{points[14]?.dateFormatted}</span>
                            <span>{points[29]?.dateFormatted}</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}

                {/* Expanded Content for Year Activity Calendar Heatmap */}
                {item.id === "year" && (
                  <AnimatePresence>
                    {item.isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden bg-transparent p-4 pt-1"
                      >
                        <div className="flex items-center justify-end mb-2 h-4">
                          <span className="text-xs font-bold text-zinc-400 tracking-wider uppercase">
                            {activeYearDay && (
                              <span>
                                {activeYearDay.dateFormatted}:{" "}
                                {activeYearDay.timeFormatted}
                              </span>
                            )}
                          </span>
                        </div>

                        {/* 53 Columns x 7 Rows Heatmap Grid with Fixed-Size Uniform Cells */}
                        <div className="w-full overflow-x-auto flex justify-center py-1 scrollbar-none">
                          <div className="inline-flex gap-[2px] min-w-max mx-auto">
                            {yearWeeks.map((week, weekIdx) => (
                              <div
                                key={weekIdx}
                                className="flex flex-col gap-[2px]"
                              >
                                {week.map((day) => {
                                  const isSelected =
                                    clickedYearDay?.dateStr === day.dateStr;
                                  const isHovered =
                                    hoveredYearDay?.dateStr === day.dateStr;
                                  const hasTime = day.sec > 0;

                                  let bgColor = "bg-zinc-800";

                                  if (day.isFuture) {
                                    bgColor = "bg-zinc-800/20";
                                  } else if (hasTime) {
                                    bgColor = "bg-zinc-400";
                                  }

                                  return (
                                    <div
                                      key={day.dateStr}
                                      onClick={() => {
                                        if (day.isFuture) return;
                                        if (clickedYearDay?.dateStr === day.dateStr) {
                                          setClickedYearDay(null);
                                          setHoveredYearDay(null);
                                        } else {
                                          setClickedYearDay(day);
                                        }
                                      }}
                                      onMouseEnter={() =>
                                        !day.isFuture && setHoveredYearDay(day)
                                      }
                                      onMouseLeave={() => setHoveredYearDay(null)}
                                      style={{ width: "10px", height: "10px" }}
                                      className={`w-[10px] h-[10px] shrink-0 rounded-none transition-transform duration-150 ${bgColor} ${
                                        isSelected || isHovered
                                          ? "scale-125 z-10"
                                          : ""
                                      } ${
                                        day.isFuture
                                          ? "cursor-default"
                                          : "cursor-pointer"
                                      }`}
                                    />
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            );
          }

          return (
            <div
              key={item.id}
              className="bg-zinc-900/70 rounded-xl px-4 py-3 flex items-center justify-between"
            >
              <span className="text-xs font-bold text-zinc-400 tracking-wider uppercase">
                {item.label}
              </span>
              <span className="text-lg sm:text-xl font-black text-zinc-400 hover:text-white transition-colors tracking-tight">
                {item.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

