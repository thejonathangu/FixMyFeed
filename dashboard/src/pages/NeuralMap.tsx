import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import NodeGraph from '../components/NodeGraph';
import MindfulnessOverlay from '../components/MindfulnessOverlay';
import {
  fetchEvolvingDopamineStats,
  interpolateSnapshots,
  type Snapshot,
} from '../services/dataService';

export default function NeuralMap() {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    fetchEvolvingDopamineStats().then((data) => setSnapshots(data.snapshots));
  }, []);

  const interpolated = useMemo(() => {
    if (!snapshots) return null;
    return interpolateSnapshots(snapshots, progress);
  }, [snapshots, progress]);

  const snapLabels = useMemo(
    () => snapshots?.map((s) => s.timestamp) ?? [],
    [snapshots],
  );

  const handleProgressChange = useCallback((p: number) => setProgress(p), []);

  if (!interpolated) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            className="w-10 h-10 mx-auto mb-3 border rounded-full border-stone-300"
            style={{ borderTopColor: '#5a6d5a' }}
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
      {/* Stats bar — centered */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="shrink-0 border-b border-stone-400/25"
      >
        <div className="max-w-7xl mx-auto flex items-center gap-6 px-8 py-3">
          <StatPill label="Intercepted" value={interpolated.stats.toxic_intercepted} color="#9e6b6b" />
          <StatPill label="Reinforced" value={interpolated.stats.value_reinforced} color="#5a6d5a" />
          <div className="ml-auto flex items-center gap-2">
            <span className="font-body text-[10px] tracking-wide text-text-dim uppercase">
              Rewiring
            </span>
            <div className="w-16 h-1 rounded-full overflow-hidden bg-stone-300/50">
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #6b6560, #5a6d5a)' }}
                animate={{ width: `${interpolated.stats.rewiring_pct}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
            <span className="font-body text-xs text-value tabular-nums w-7 text-right font-medium">
              {interpolated.stats.rewiring_pct}%
            </span>
          </div>
        </div>
      </motion.div>

      {/* Graph area */}
      <div className="flex-1 relative min-h-0">
        <NodeGraph nodes={interpolated.nodes} />

        {/* Legend */}
        <div
          className="absolute bottom-4 left-6 rounded-lg border px-3 py-2.5 space-y-2 z-20"
          style={{
            background: 'rgba(253, 250, 246, 0.88)',
            borderColor: 'rgba(44, 38, 31, 0.12)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <p className="font-body text-[10px] tracking-widest text-text-dim uppercase">
            Node types
          </p>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-value" />
            <span className="text-[10px] text-text-muted">High-Value</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-toxic" />
            <span className="text-[10px] text-text-muted">Toxic</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-toxic-dead" />
            <span className="text-[10px] text-text-muted">Neutralized</span>
          </div>
        </div>

        <MindfulnessOverlay
          toxicIntercepted={interpolated.stats.toxic_intercepted}
          rewiringPct={interpolated.stats.rewiring_pct}
        />
      </div>

      {/* Timeline scrubber — centered */}
      <div className="shrink-0 border-t border-stone-400/25">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <TimelineScrubberInline
            progress={progress}
            onChange={handleProgressChange}
            label={interpolated.label}
            snapLabels={snapLabels}
          />
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span className="font-body text-sm text-text-primary tabular-nums font-medium">{value}</span>
      <span className="font-body text-[10px] text-text-dim tracking-wide uppercase">{label}</span>
    </div>
  );
}

function TimelineScrubberInline({
  progress,
  onChange,
  label,
  snapLabels,
}: {
  progress: number;
  onChange: (p: number) => void;
  label: string;
  snapLabels: string[];
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

  return (
    <div className="max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="font-body text-[10px] tracking-wide text-text-dim uppercase">
          Timeline
        </span>
        <span className="font-body text-xs tracking-wide text-text-muted uppercase">
          {label}
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative h-8 cursor-pointer select-none"
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
      >
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[2px] bg-stone-400/40 rounded-full" />
        <div
          className="absolute top-1/2 -translate-y-1/2 left-0 h-[2px] rounded-full"
          style={{
            width: `${progress * 100}%`,
            background: 'linear-gradient(90deg, #6b6560, #5a6d5a)',
          }}
        />
        {snapLabels.map((_, i) => (
          <div
            key={i}
            className="absolute top-1/2 w-1.5 h-1.5 rounded-full bg-stone-500/35"
            style={{
              left: `${(i / (snapLabels.length - 1)) * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
          />
        ))}
        <div className="absolute top-1/2" style={{ left: `${progress * 100}%` }}>
          <div
            className="w-4 h-4 rounded-full -translate-x-1/2 -translate-y-1/2"
            style={{
              background: 'linear-gradient(135deg, #6b6560, #5a6d5a)',
            }}
          />
        </div>
      </div>

      <div className="flex justify-between mt-1">
        {snapLabels.map((lbl, i) => (
          <button
            key={i}
            onClick={() => onChange(i / (snapLabels.length - 1))}
            className="font-body text-[10px] tracking-wide text-text-dim hover:text-text-primary transition-colors"
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}
