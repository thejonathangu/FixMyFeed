import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import AttentionChart from '../components/AttentionChart';
import { useCountUp } from '../hooks/useCountUp';
import {
  fetchWatchtimeData,
  fetchEvolvingDopamineStats,
  type WatchtimePoint,
  type Snapshot,
} from '../services/dataService';

const GREEN = '#4e7754';
const ROSE = '#a86063';

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.09, delayChildren: 0.06 },
  },
};

const staggerEase = [0.22, 1, 0.36, 1] as const;

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: staggerEase },
  },
};

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
          className="w-10 h-10 border rounded-full border-stone-300"
          style={{ borderTopColor: GREEN }}
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
    <motion.div
      className="h-full overflow-y-auto"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      <div className="max-w-6xl mx-auto px-6 sm:px-10 py-8 sm:py-10 space-y-9">
        <motion.div variants={staggerItem}>
          <h2 className="font-body text-xl font-medium tracking-tight text-text-primary mb-1">
            Attention analytics
          </h2>
          <p className="text-sm text-text-muted">
            Track how your watchtime shifts from toxic to positive over 30 days.
          </p>
        </motion.div>

        <motion.div
          variants={staggerItem}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5"
        >
          <MetricCard
            label="Quality Score"
            accent="green"
            countValue={latest.quality_score}
            suffix="%"
            deltaText={`${qualityDelta >= 0 ? '+' : ''}${qualityDelta}%`}
            trend={{
              direction: qualityDelta >= 0 ? 'up' : 'down',
              good: qualityDelta >= 0,
            }}
          />
          <MetricCard
            label="Positive Watchtime"
            accent="green"
            countValue={latest.positive_min}
            suffix="m"
            deltaText={`${positiveDelta >= 0 ? '+' : ''}${positiveDelta}m`}
            trend={{
              direction: positiveDelta >= 0 ? 'up' : 'down',
              good: positiveDelta >= 0,
            }}
          />
          <MetricCard
            label="Toxic Reduced"
            accent="rose"
            countValue={latest.toxic_min}
            suffix="m"
            deltaText={`${toxicDelta >= 0 ? '-' : '+'}${Math.abs(toxicDelta)}m`}
            trend={{
              direction: toxicDelta >= 0 ? 'down' : 'up',
              good: toxicDelta >= 0,
            }}
            deltaHint=" over 30d"
          />
          <MetricCard
            label="Total daily"
            accent="synapse"
            countValue={latest.total_min}
            suffix="m"
            deltaText=""
            trend={null}
          />
        </motion.div>

        <motion.div
          variants={staggerItem}
          className="rounded-2xl border overflow-hidden glass-frosted"
          style={{ borderColor: 'rgba(44, 38, 31, 0.11)' }}
        >
          <div className="px-6 pt-5 pb-1">
            <h3 className="font-body text-xs tracking-wide text-text-muted uppercase">
              Watchtime distribution
            </h3>
          </div>
          <AttentionChart data={watchtime} />
        </motion.div>

        <motion.div variants={staggerItem} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <motion.div
            className="rounded-2xl border p-5 sm:p-6 glass-frosted"
            style={{ borderColor: 'rgba(78, 119, 84, 0.28)' }}
          >
            <h3 className="font-body text-xs tracking-wide text-value uppercase mb-4 font-medium">
              Value concepts — growing
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
            className="rounded-2xl border p-5 sm:p-6 glass-frosted"
            style={{ borderColor: 'rgba(168, 96, 99, 0.3)' }}
          >
            <h3 className="font-body text-xs tracking-wide text-toxic uppercase mb-4 font-medium">
              Toxic patterns — declining
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
        </motion.div>
      </div>
    </motion.div>
  );
}

function MetricCard({
  label,
  accent,
  countValue,
  suffix,
  deltaText,
  deltaHint = ' over 30d',
  trend,
}: {
  label: string;
  accent: 'green' | 'rose' | 'synapse';
  countValue: number;
  suffix: string;
  deltaText: string;
  deltaHint?: string;
  trend: { direction: 'up' | 'down'; good: boolean } | null;
}) {
  const n = useCountUp(countValue, 950);
  const accentColor =
    accent === 'green' ? GREEN : accent === 'rose' ? ROSE : '#6b6560';
  const accentSoft =
    accent === 'green'
      ? 'rgba(78, 119, 84, 0.16)'
      : accent === 'rose'
        ? 'rgba(168, 96, 99, 0.14)'
        : 'rgba(107, 101, 96, 0.1)';

  return (
    <motion.div
      className="rounded-2xl border p-4 sm:p-5 relative overflow-hidden group"
      style={{
        borderColor: 'rgba(44, 38, 31, 0.1)',
        borderLeftWidth: 4,
        borderLeftColor: accentColor,
        background: `linear-gradient(145deg, ${accentSoft} 0%, rgba(253, 250, 246, 0.75) 42%, rgba(255, 255, 255, 0.35) 100%)`,
        boxShadow: '0 2px 8px rgba(44, 38, 31, 0.05)',
      }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
    >
      <p className="font-body text-[10px] tracking-wide text-text-dim uppercase mb-2 relative z-[1]">
        {label}
      </p>
      <p className="font-body text-2xl sm:text-[1.65rem] text-text-primary tabular-nums font-semibold relative z-[1]">
        {n}
        {suffix}
      </p>
      {deltaText && trend && (
        <p
          className="font-body text-xs mt-2 tabular-nums flex items-center gap-1 relative z-[1]"
          style={{ color: trend.good ? GREEN : ROSE }}
        >
          <span aria-hidden className="text-[11px] font-semibold">
            {trend.direction === 'up' ? '↑' : '↓'}
          </span>
          <span>
            {deltaText}
            {deltaHint}
          </span>
        </p>
      )}
      {deltaText && !trend && (
        <p className="font-body text-xs mt-2 text-text-muted tabular-nums relative z-[1]">
          Session total
        </p>
      )}
    </motion.div>
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
  const barColor = color === 'value' ? GREEN : ROSE;
  const deltaPositive = color === 'value' ? delta > 0 : delta < 0;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-text-muted w-32 truncate shrink-0">
        {name}
      </span>
      <div className="flex-1 h-1 rounded-full bg-stone-400/30 overflow-hidden relative">
        <div
          className="absolute inset-y-0 left-0 rounded-full opacity-20"
          style={{ width: `${before}%`, background: barColor }}
        />
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: barColor }}
          initial={{ width: `${before}%` }}
          animate={{ width: `${after}%` }}
          transition={{ duration: 1, delay: 0.4, ease: 'easeOut' }}
        />
      </div>
      <span
        className="font-body text-[10px] tabular-nums w-10 text-right shrink-0 font-medium"
        style={{ color: deltaPositive ? GREEN : ROSE }}
      >
        {delta > 0 ? '+' : ''}
        {delta}%
      </span>
    </div>
  );
}
