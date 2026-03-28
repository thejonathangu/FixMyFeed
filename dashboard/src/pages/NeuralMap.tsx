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
            className="w-10 h-10 mx-auto mb-3 border border-value/30 rounded-full"
            style={{ borderTopColor: '#00ffd5' }}
          />
          <p className="font-display text-[10px] tracking-[0.3em] text-text-dim uppercase">
            Mapping Neural Topology
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
        className="shrink-0 border-b border-white/[0.03]"
      >
        <div className="max-w-7xl mx-auto flex items-center gap-6 px-8 py-3">
          <StatPill label="Intercepted" value={interpolated.stats.toxic_intercepted} color="#ff2e2e" />
          <StatPill label="Reinforced" value={interpolated.stats.value_reinforced} color="#00ffd5" />
          <div className="ml-auto flex items-center gap-2">
            <span className="font-display text-[10px] tracking-[0.15em] text-text-dim uppercase">
              Rewiring
            </span>
            <div className="w-16 h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #1a6bff, #00ffd5)' }}
                animate={{ width: `${interpolated.stats.rewiring_pct}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
            <span className="font-display text-xs text-value tabular-nums w-7 text-right">
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
            background: 'rgba(5, 5, 8, 0.85)',
            borderColor: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <p className="font-display text-[8px] tracking-[0.2em] text-text-dim uppercase">
            Node Types
          </p>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-value shadow-[0_0_6px_#00ffd540]" />
            <span className="text-[10px] text-text-muted">High-Value</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-toxic shadow-[0_0_6px_#ff2e2e30]" />
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
      <div className="shrink-0 border-t border-white/[0.03]">
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
      <span className="font-display text-xs text-text-primary tabular-nums">{value}</span>
      <span className="font-display text-[9px] text-text-dim tracking-wider uppercase">{label}</span>
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
        <span className="font-display text-[10px] tracking-[0.15em] text-text-dim uppercase">
          Timeline
        </span>
        <span className="font-display text-xs tracking-widest text-text-muted uppercase">
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
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[2px] bg-white/[0.06] rounded-full" />
        <div
          className="absolute top-1/2 -translate-y-1/2 left-0 h-[2px] rounded-full"
          style={{
            width: `${progress * 100}%`,
            background: 'linear-gradient(90deg, #1a6bff, #00ffd5)',
            boxShadow: '0 0 10px #00ffd530',
          }}
        />
        {snapLabels.map((_, i) => (
          <div
            key={i}
            className="absolute top-1/2 w-1.5 h-1.5 rounded-full bg-white/15"
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
              background: 'linear-gradient(135deg, #1a6bff, #00ffd5)',
              boxShadow: '0 0 14px #00ffd560',
            }}
          />
        </div>
      </div>

      <div className="flex justify-between mt-1">
        {snapLabels.map((lbl, i) => (
          <button
            key={i}
            onClick={() => onChange(i / (snapLabels.length - 1))}
            className="font-display text-[9px] tracking-wider text-text-dim hover:text-value transition-colors"
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}
