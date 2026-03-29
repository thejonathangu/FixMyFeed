import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import AttentionChart from '../components/AttentionChart';
import {
  fetchWatchtimeData,
  fetchEvolvingDopamineStats,
  type WatchtimePoint,
  type Snapshot,
} from '../services/dataService';

export default function Analytics() {
  const [watchtime, setWatchtime] = useState<WatchtimePoint[] | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);

  useEffect(() => {
    fetchWatchtimeData().then(setWatchtime);
    fetchEvolvingDopamineStats().then((d) => setSnapshots(d.snapshots));
  }, []);

  if (!watchtime || !snapshots) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border border-value/30 rounded-full"
          style={{ borderTopColor: '#00ffd5' }}
        />
      </div>
    );
  }

  const latest = watchtime[watchtime.length - 1];
  const first = watchtime[0];
  const qualityDelta = latest.quality_score - first.quality_score;
  const positiveDelta = latest.positive_min - first.positive_min;
  const toxicDelta = first.toxic_min - latest.toxic_min;

  const earlyNodes = snapshots[0].nodes;
  const lateNodes = snapshots[snapshots.length - 1].nodes;

  const valueEvolution = lateNodes
    .filter((n) => n.category === 'value')
    .map((late) => {
      const early = earlyNodes.find((e) => e.id === late.id)!;
      return {
        name: late.theme_name,
        before: Math.round(early.weight * 100),
        after: Math.round(late.weight * 100),
        delta: Math.round((late.weight - early.weight) * 100),
      };
    })
    .sort((a, b) => b.delta - a.delta);

  const toxicEvolution = lateNodes
    .filter((n) => n.category === 'toxic')
    .map((late) => {
      const early = earlyNodes.find((e) => e.id === late.id)!;
      return {
        name: late.theme_name,
        before: Math.round(early.weight * 100),
        after: Math.round(late.weight * 100),
        delta: Math.round((late.weight - early.weight) * 100),
      };
    })
    .sort((a, b) => a.delta - b.delta);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="font-display text-xl tracking-[0.1em] text-text-primary uppercase mb-1">
            Attention Analytics
          </h2>
          <p className="text-sm text-text-muted">
            Track how your watchtime shifts from toxic to positive over 30 days.
          </p>
        </motion.div>

        {/* Stat cards */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <MetricCard
            label="Quality Score"
            value={`${latest.quality_score}%`}
            delta={`+${qualityDelta}%`}
            positive
          />
          <MetricCard
            label="Positive Watchtime"
            value={`${latest.positive_min}m`}
            delta={`+${positiveDelta}m`}
            positive
          />
          <MetricCard
            label="Toxic Reduced"
            value={`${latest.toxic_min}m`}
            delta={`-${toxicDelta}m`}
            positive
          />
          <MetricCard
            label="Total Daily"
            value={`${latest.total_min}m`}
            delta=""
            positive={false}
          />
        </motion.div>

        {/* Main chart — self-sizing via ResizeObserver */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="rounded-xl border overflow-hidden"
          style={{
            background:
              'linear-gradient(135deg, rgba(12, 12, 20, 0.6), rgba(10, 10, 18, 0.4))',
            borderColor: 'rgba(255, 255, 255, 0.04)',
          }}
        >
          <div className="px-5 pt-5 pb-2">
            <h3 className="font-display text-xs tracking-[0.15em] text-text-muted uppercase">
              Watchtime Distribution
            </h3>
          </div>
          <AttentionChart data={watchtime} />
        </motion.div>

        {/* Concept evolution tables */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="rounded-xl border p-5"
            style={{
              background:
                'linear-gradient(135deg, rgba(12, 12, 20, 0.6), rgba(10, 10, 18, 0.4))',
              borderColor: 'rgba(0, 255, 213, 0.06)',
            }}
          >
            <h3 className="font-display text-xs tracking-[0.15em] text-value uppercase mb-4">
              Value Concepts — Growing
            </h3>
            <div className="space-y-2.5">
              {valueEvolution.map((item) => (
                <ConceptRow
                  key={item.name}
                  name={item.name}
                  before={item.before}
                  after={item.after}
                  delta={item.delta}
                  color="value"
                />
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="rounded-xl border p-5"
            style={{
              background:
                'linear-gradient(135deg, rgba(12, 12, 20, 0.6), rgba(10, 10, 18, 0.4))',
              borderColor: 'rgba(255, 46, 46, 0.06)',
            }}
          >
            <h3 className="font-display text-xs tracking-[0.15em] text-toxic uppercase mb-4">
              Toxic Patterns — Declining
            </h3>
            <div className="space-y-2.5">
              {toxicEvolution.map((item) => (
                <ConceptRow
                  key={item.name}
                  name={item.name}
                  before={item.before}
                  after={item.after}
                  delta={item.delta}
                  color="toxic"
                />
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  delta,
  positive,
}: {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        background:
          'linear-gradient(135deg, rgba(12, 12, 20, 0.6), rgba(10, 10, 18, 0.4))',
        borderColor: 'rgba(255, 255, 255, 0.04)',
      }}
    >
      <p className="font-display text-[9px] tracking-[0.15em] text-text-dim uppercase mb-2">
        {label}
      </p>
      <p className="font-display text-2xl text-text-primary tabular-nums">
        {value}
      </p>
      {delta && (
        <p
          className="font-display text-xs mt-1 tabular-nums"
          style={{ color: positive ? '#00ffd5' : '#ff2e2e' }}
        >
          {delta} over 30d
        </p>
      )}
    </div>
  );
}

function ConceptRow({
  name,
  before,
  after,
  delta,
  color,
}: {
  name: string;
  before: number;
  after: number;
  delta: number;
  color: 'value' | 'toxic';
}) {
  const barColor = color === 'value' ? '#00ffd5' : '#ff2e2e';
  const isGrowth = delta > 0;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-text-muted w-32 truncate shrink-0">
        {name}
      </span>
      <div className="flex-1 h-1 rounded-full bg-white/[0.04] overflow-hidden relative">
        <div
          className="absolute inset-y-0 left-0 rounded-full opacity-20"
          style={{ width: `${before}%`, background: barColor }}
        />
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: barColor }}
          initial={{ width: `${before}%` }}
          animate={{ width: `${after}%` }}
          transition={{ duration: 1, delay: 0.5, ease: 'easeOut' }}
        />
      </div>
      <span
        className="font-display text-[10px] tabular-nums w-10 text-right shrink-0"
        style={{ color: isGrowth ? '#00ffd5' : '#ff2e2e' }}
      >
        {delta > 0 ? '+' : ''}
        {delta}%
      </span>
    </div>
  );
}
