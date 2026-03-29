import { useMemo, useRef, useState, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import type { WatchtimePoint } from '../services/dataService';

// ---------------------------------------------------------------------------
// Self-sizing SVG area + line chart for watchtime analytics
// ---------------------------------------------------------------------------
export default function AttentionChart({ data }: { data: WatchtimePoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 800, height: 350 });
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          setDims({ width, height: 350 });
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { width, height } = dims;
  const pad = { top: 30, right: 30, bottom: 50, left: 55 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const { maxVal, positivePoints, toxicPoints, qualityPoints, xScale, yScale } =
    useMemo(() => {
      if (chartW <= 0 || chartH <= 0)
        return {
          maxVal: 1,
          positivePoints: [],
          toxicPoints: [],
          qualityPoints: [],
          xScale: () => 0,
          yScale: () => 0,
        };

      const maxVal = Math.max(...data.map((d) => d.total_min)) * 1.15;
      const xScale = (i: number) =>
        pad.left + (i / (data.length - 1)) * chartW;
      const yScale = (v: number) =>
        pad.top + chartH - (v / maxVal) * chartH;

      const positivePoints = data.map((d, i) => ({
        x: xScale(i),
        y: yScale(d.positive_min),
      }));
      const toxicPoints = data.map((d, i) => ({
        x: xScale(i),
        y: yScale(d.toxic_min),
      }));
      const qualityPoints = data.map((d, i) => ({
        x: xScale(i),
        y: yScale((d.quality_score / 100) * maxVal),
      }));

      return {
        maxVal,
        positivePoints,
        toxicPoints,
        qualityPoints,
        xScale,
        yScale,
      };
    }, [data, chartW, chartH, pad.left, pad.top]);

  // Smooth curve (cardinal spline)
  const toSmooth = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return '';
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  };

  const toSmoothArea = (pts: { x: number; y: number }[]) => {
    const baseline = pad.top + chartH;
    return `${toSmooth(pts)} L${pts[pts.length - 1].x},${baseline} L${pts[0].x},${baseline} Z`;
  };

  // Y-axis grid
  const gridLines = useMemo(() => {
    const count = 5;
    return Array.from({ length: count + 1 }, (_, i) => {
      const val = (maxVal / count) * i;
      return { y: yScale(val), label: `${Math.round(val)}m` };
    });
  }, [maxVal, yScale]);

  const hovered = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: 350 }}>
      <div ref={ref}>
        {chartW > 0 && (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="block"
          >
            <defs>
              <linearGradient id="positiveGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00ffd5" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#00ffd5" stopOpacity="0.01" />
              </linearGradient>
              <linearGradient id="toxicGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff2e2e" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#ff2e2e" stopOpacity="0.01" />
              </linearGradient>
              <linearGradient id="qualityGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1a6bff" />
                <stop offset="100%" stopColor="#00ffd5" />
              </linearGradient>
            </defs>

            {/* Grid */}
            {gridLines.map((g, i) => (
              <g key={i}>
                <line
                  x1={pad.left}
                  y1={g.y}
                  x2={pad.left + chartW}
                  y2={g.y}
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth={0.5}
                />
                <text
                  x={pad.left - 10}
                  y={g.y + 3}
                  textAnchor="end"
                  fill="#3a3a50"
                  fontSize={10}
                  fontFamily='"Departure Mono", monospace'
                >
                  {g.label}
                </text>
              </g>
            ))}

            {/* X-axis labels */}
            {data.map((d, i) => (
              <text
                key={i}
                x={xScale(i)}
                y={pad.top + chartH + 25}
                textAnchor="middle"
                fill="#3a3a50"
                fontSize={10}
                fontFamily='"Departure Mono", monospace'
              >
                {d.label}
              </text>
            ))}

            {/* Areas */}
            {inView && positivePoints.length > 0 && (
              <>
                <motion.path
                  d={toSmoothArea(toxicPoints)}
                  fill="url(#toxicGrad)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 1, delay: 0.3 }}
                />
                <motion.path
                  d={toSmoothArea(positivePoints)}
                  fill="url(#positiveGrad)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 1, delay: 0.5 }}
                />
              </>
            )}

            {/* Lines */}
            {inView && positivePoints.length > 0 && (
              <>
                <motion.path
                  d={toSmooth(toxicPoints)}
                  fill="none"
                  stroke="#ff2e2e"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.6 }}
                  transition={{ duration: 1.5, delay: 0.3 }}
                />
                <motion.path
                  d={toSmooth(positivePoints)}
                  fill="none"
                  stroke="#00ffd5"
                  strokeWidth={2}
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.5, delay: 0.5 }}
                />
                <motion.path
                  d={toSmooth(qualityPoints)}
                  fill="none"
                  stroke="url(#qualityGrad)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.7 }}
                  transition={{ duration: 1.5, delay: 0.7 }}
                />
              </>
            )}

            {/* Data points */}
            {inView &&
              positivePoints.map((pt, i) => (
                <g key={i}>
                  <motion.circle
                    cx={pt.x}
                    cy={pt.y}
                    r={hoveredIdx === i ? 5 : 3}
                    fill="#00ffd5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 + i * 0.05 }}
                  />
                  <motion.circle
                    cx={toxicPoints[i].x}
                    cy={toxicPoints[i].y}
                    r={hoveredIdx === i ? 4 : 2.5}
                    fill="#ff2e2e"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.7 }}
                    transition={{ delay: 0.3 + i * 0.05 }}
                  />
                </g>
              ))}

            {/* Hover zones */}
            {data.map((_, i) => {
              const x = xScale(i);
              const zoneW = chartW / Math.max(1, data.length - 1);
              return (
                <rect
                  key={`zone-${i}`}
                  x={x - zoneW / 2}
                  y={pad.top}
                  width={zoneW}
                  height={chartH}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{ cursor: 'crosshair' }}
                />
              );
            })}

            {/* Hover line */}
            {hoveredIdx !== null && (
              <line
                x1={xScale(hoveredIdx)}
                y1={pad.top}
                x2={xScale(hoveredIdx)}
                y2={pad.top + chartH}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}
          </svg>
        )}
      </div>

      {/* Hover tooltip */}
      {hovered && hoveredIdx !== null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute z-30 pointer-events-none"
          style={{
            left:
              xScale(hoveredIdx) +
              (hoveredIdx > data.length / 2 ? -180 : 16),
            top: pad.top + 10,
          }}
        >
          <div
            className="rounded-lg border px-4 py-3 min-w-[160px]"
            style={{
              background: 'rgba(10, 10, 18, 0.95)',
              borderColor: 'rgba(255, 255, 255, 0.06)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <p className="font-display text-[10px] tracking-[0.15em] text-text-dim uppercase mb-2">
              {hovered.label} — Day {hovered.day}
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-value" />
                  <span className="text-xs text-text-muted">Positive</span>
                </div>
                <span className="font-display text-xs text-text-primary tabular-nums">
                  {hovered.positive_min}m
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-toxic" />
                  <span className="text-xs text-text-muted">Toxic</span>
                </div>
                <span className="font-display text-xs text-text-primary tabular-nums">
                  {hovered.toxic_min}m
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 pt-1 border-t border-white/[0.04]">
                <span className="text-xs text-text-muted">Quality</span>
                <span className="font-display text-xs text-value tabular-nums">
                  {hovered.quality_score}%
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Legend */}
      <div className="absolute top-2 right-4 flex items-center gap-5">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-[2px] rounded bg-value" />
          <span className="font-display text-[10px] text-text-dim tracking-wider">
            Positive
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-[2px] rounded bg-toxic opacity-60" />
          <span className="font-display text-[10px] text-text-dim tracking-wider">
            Toxic
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-[2px] rounded border-b border-dashed border-synapse" />
          <span className="font-display text-[10px] text-text-dim tracking-wider">
            Quality Score
          </span>
        </div>
      </div>
    </div>
  );
}
