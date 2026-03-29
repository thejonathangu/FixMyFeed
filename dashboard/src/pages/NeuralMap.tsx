import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import NodeGraph from '../components/NodeGraph';
import { useCountUp } from '../hooks/useCountUp';
import {
  fetchEvolvingDopamineStats,
  interpolateSnapshots,
  type Snapshot,
} from '../services/dataService';

const ROSE = '#a86063';
const GREEN = '#4e7754';

export default function NeuralMap() {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [progress, setProgress] = useState(0);
  const [userId, setUserId] = useState<string>('');
  const [isRealData, setIsRealData] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('fixmyfeed_user_id') || '';
    setUserId(stored);
    
    fetchEvolvingDopamineStats(stored).then((data) => {
      setSnapshots(data.snapshots);
      setIsRealData(stored !== '' && data.user_id !== 'demo');
    });
  }, []);

  const handleUserIdSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem('userId') as HTMLInputElement;
    if (input.value.trim()) {
      localStorage.setItem('fixmyfeed_user_id', input.value.trim());
      window.location.reload();
    }
  };

  const interpolated = useMemo(() => {
    if (!snapshots) return null;
    return interpolateSnapshots(snapshots, progress);
  }, [snapshots, progress]);

  const snapLabels = useMemo(
    () => snapshots?.map((s) => s.timestamp) ?? [],
    [snapshots],
  );

  const activeSnapIdx = useMemo(() => {
    if (snapLabels.length <= 1) return 0;
    return Math.round(progress * (snapLabels.length - 1));
  }, [progress, snapLabels.length]);

  const handleProgressChange = useCallback((p: number) => setProgress(p), []);

  if (!interpolated) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            className="w-10 h-10 mx-auto mb-3 border rounded-full border-stone-300"
            style={{ borderTopColor: GREEN }}
          />
          <p className="font-body text-xs tracking-widest text-text-dim uppercase">
            Loading map
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* User ID prompt banner when no user or demo data */}
      {!isRealData && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-6 sm:mx-10 mt-3 px-5 py-4 rounded-xl border"
          style={{
            background: 'linear-gradient(90deg, rgba(181, 132, 61, 0.12), rgba(253, 250, 246, 0.9))',
            borderColor: 'rgba(181, 132, 61, 0.25)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-body text-sm text-text-primary">
                {userId ? 'Showing demo data - no events found' : 'Enter your User ID to see real analytics'}
              </span>
            </div>
            <form onSubmit={handleUserIdSubmit} className="flex gap-2">
              <input
                name="userId"
                type="text"
                defaultValue={userId}
                placeholder="User ID from extension"
                className="px-3 py-2 rounded-lg border font-body text-sm w-52"
                style={{
                  borderColor: 'rgba(44, 38, 31, 0.15)',
                  background: 'white',
                }}
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg font-body text-sm font-medium"
                style={{
                  background: '#b5843d',
                  color: 'white',
                }}
              >
                Load
              </button>
            </form>
          </div>
        </motion.div>
      )}

      {/* Real data indicator */}
      {isRealData && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute top-2 right-2 z-30 px-2 py-1 rounded-full"
          style={{ background: 'rgba(78, 119, 84, 0.15)' }}
        >
          <span className="font-body text-[10px] uppercase tracking-wide" style={{ color: GREEN }}>
            Live Data
          </span>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="shrink-0"
      >
        <div className="flex flex-wrap items-center gap-4 sm:gap-5 px-6 sm:px-8 py-2.5 sm:py-3">
          <StatPillBadge
            label="Intercepted"
            value={interpolated.stats.toxic_intercepted}
            accent="rose"
          />
          <StatPillBadge
            label="Reinforced"
            value={interpolated.stats.value_reinforced}
            accent="green"
          />
        </div>
      </motion.div>

      <div className="flex-1 min-h-0 px-4 sm:px-6 md:px-8 pb-2">
        <div className="relative h-full min-h-0 overflow-hidden rounded-[1.25rem] border border-stone-400/20">
          <div
            className="absolute inset-0 z-1 pointer-events-none"
            style={{
              boxShadow:
                'inset 0 0 100px rgba(0, 0, 0, 0.42), inset 0 0 40px rgba(0, 0, 0, 0.28)',
            }}
            aria-hidden
          />
          <NodeGraph nodes={interpolated.nodes} />

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.55, ease: 'easeOut' }}
            className="absolute bottom-4 left-5 sm:left-7 rounded-2xl px-4 py-3 space-y-2.5 z-20 glass-frosted max-w-[220px]"
            style={{
              background: 'rgba(120, 120, 120, 0.22)',
              borderColor: 'rgba(255, 255, 255, 0.18)',
            }}
          >
            <p className="font-body text-[10px] tracking-widest text-white/80 uppercase">
              Node types
            </p>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-value shrink-0" />
              <span className="text-[11px] text-white">High-Value (LIKE)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: '#b5843d' }} />
              <span className="text-[11px] text-white">Neutral (WAIT)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-toxic shrink-0" />
              <span className="text-[11px] text-white">Toxic (SKIP)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-2.5 h-2.5 shrink-0">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/90 -translate-x-1/2" />
                <div className="absolute top-1/2 left-0 right-0 h-px bg-white/90 -translate-y-1/2" />
              </div>
              <span className="text-[11px] text-white">Focus</span>
            </div>
          </motion.div>
          <div className="absolute left-1/2 top-1/2 z-20 pointer-events-none -translate-x-1/2 -translate-y-1/2 opacity-80">
            <div className="relative w-5 h-5">
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/70 -translate-x-1/2" />
              <div className="absolute top-1/2 left-0 right-0 h-px bg-white/70 -translate-y-1/2" />
              <div className="absolute left-1/2 top-1/2 w-1 h-1 rounded-full bg-white/80 -translate-x-1/2 -translate-y-1/2" />
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-6 sm:px-8 py-4 sm:py-5">
        <TimelineScrubberInline
          progress={progress}
          onChange={handleProgressChange}
          label={interpolated.label}
          snapLabels={snapLabels}
          activeSnapIdx={activeSnapIdx}
        />
      </div>
    </div>
  );
}

function StatPillBadge({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'rose' | 'green';
}) {
  const n = useCountUp(value, 650);
  const isRose = accent === 'rose';
  const dot = isRose ? ROSE : GREEN;
  const border = isRose ? 'rgba(168, 96, 99, 0.38)' : 'rgba(78, 119, 84, 0.38)';
  const bg = isRose
    ? 'linear-gradient(135deg, rgba(168, 96, 99, 0.2) 0%, rgba(253, 250, 246, 0.65) 55%, rgba(255, 255, 255, 0.35) 100%)'
    : 'linear-gradient(135deg, rgba(78, 119, 84, 0.18) 0%, rgba(253, 250, 246, 0.65) 55%, rgba(255, 255, 255, 0.35) 100%)';

  return (
    <div
      className="inline-flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-full border shadow-sm"
      style={{
        background: bg,
        borderColor: border,
        boxShadow: '0 1px 3px rgba(44, 38, 31, 0.06)',
      }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />
      <span className="font-body text-lg sm:text-xl text-text-primary tabular-nums font-semibold leading-none">
        {n}
      </span>
      <span
        className="font-body text-[10px] text-text-dim tracking-wide uppercase leading-tight"
      >
        {label}
      </span>
    </div>
  );
}

function TimelineScrubberInline({
  progress,
  onChange,
  label,
  snapLabels,
  activeSnapIdx,
}: {
  progress: number;
  onChange: (p: number) => void;
  label: string;
  snapLabels: string[];
  activeSnapIdx: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handlePointer = useCallback(
    (e: React.PointerEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onChange(x);
    },
    [onChange],
  );

  const n = Math.max(1, snapLabels.length - 1);

  return (
    <div className="max-w-4xl mx-auto w-full">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <span className="font-body text-[10px] tracking-widest text-text-dim uppercase block mb-1">
            Timeline
          </span>
          <span className="font-body text-[11px] text-text-muted tabular-nums">
            Drag to scrub · click markers
          </span>
        </div>
        <span className="font-body text-xs tracking-wide text-text-primary font-medium text-right">
          {label}
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative h-10 cursor-pointer select-none touch-none"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          handlePointer(e);
        }}
        onPointerMove={(e) => {
          if (dragging.current) handlePointer(e);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        <div className="flex justify-between px-0 mb-1">
          <span className="font-body text-[10px] uppercase tracking-wider text-text-dim">
            Start
          </span>
          <span className="font-body text-[10px] uppercase tracking-wider text-text-dim">
            End
          </span>
        </div>

        <div
          className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-2 rounded-full overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(120, 113, 102, 0.22), rgba(180, 170, 155, 0.14))',
            boxShadow: 'inset 0 1px 2px rgba(44, 38, 31, 0.12)',
          }}
        >
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${progress * 100}%`,
              background: 'linear-gradient(90deg, rgba(107, 101, 96, 0.9), rgba(78, 119, 84, 0.96))',
              boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.06)',
            }}
            initial={false}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.15 }}
          />
        </div>

        {snapLabels.map((_, i) => {
          const isActive = i === activeSnapIdx;
          return (
            <div
              key={i}
              className="absolute top-1/2 z-1"
              style={{
                left: `${(i / n) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <motion.button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(i / n);
                }}
                className="rounded-full border border-stone-500/25 bg-[rgba(253,250,246,0.92)] shadow-sm block"
                style={{
                  width: isActive ? 12 : 9,
                  height: isActive ? 12 : 9,
                }}
                animate={
                  isActive
                    ? { scale: [1, 1.12, 1], boxShadow: ['0 0 0 0 rgba(78,119,84,0.4)', '0 0 0 6px rgba(78,119,84,0.14)', '0 0 0 0 rgba(78,119,84,0.4)'] }
                    : {}
                }
                transition={
                  isActive
                    ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
                    : {}
                }
                aria-label={`Jump to ${snapLabels[i] ?? i}`}
              />
            </div>
          );
        })}

        <div className="absolute top-1/2 z-2" style={{ left: `${progress * 100}%` }}>
          <div
            className="w-[18px] h-[18px] rounded-full -translate-x-1/2 -translate-y-1/2 border-2 border-[rgba(253,250,246,0.95)] shadow-md"
            style={{
              background: 'linear-gradient(145deg, #6b6560, #4e7754)',
            }}
          />
        </div>
      </div>

      <div className="flex justify-between gap-1 mt-2 overflow-x-auto pb-1">
        {snapLabels.map((lbl, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i / n)}
            className={`font-body text-[10px] tracking-wide transition-colors shrink-0 px-0.5 ${
              i === activeSnapIdx ? 'text-text-primary font-semibold' : 'text-text-dim hover:text-text-primary'
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}
