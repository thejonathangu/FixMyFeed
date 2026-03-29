import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  fetchInsights,
  fetchStats,
  type InsightsResponse,
  type StatsResponse,
} from '../services/insightsService';
import { useCountUp } from '../hooks/useCountUp';

const GREEN = '#4e7754';
const ROSE = '#a86063';
const AMBER = '#b5843d';
const SYNAPSE = '#6b6560';

const DOPAMINE_COLORS: Record<string, string> = {
  healthy: GREEN,
  improving: '#5a9b5e',
  mixed: AMBER,
  concerning: ROSE,
  unknown: SYNAPSE,
};

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  },
};

interface InsightsProps {
  userId: string;
  interests?: string[];
}

export default function Insights({ userId, interests = [] }: InsightsProps) {
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [insightsData, statsData] = await Promise.all([
        fetchInsights(userId, interests),
        fetchStats(userId),
      ]);
      
      if (insightsData.error) {
        setError(insightsData.error);
      } else {
        setInsights(insightsData);
      }
      
      if (!statsData.error) {
        setStats(statsData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load insights');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, interests]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-2 rounded-full"
          style={{ borderColor: 'rgba(78, 119, 84, 0.2)', borderTopColor: GREEN }}
        />
        <p className="font-body text-sm text-text-muted">
          AI is analyzing your neural patterns...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(168, 96, 99, 0.1)' }}
        >
          <span className="text-2xl">!</span>
        </div>
        <p className="font-body text-sm text-text-muted text-center max-w-md">
          {error}
        </p>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 rounded-full font-body text-xs font-medium transition-colors"
          style={{
            background: 'rgba(78, 119, 84, 0.1)',
            color: GREEN,
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
        <p className="font-body text-sm text-text-muted text-center">
          No insights available yet. Start using the extension to generate data!
        </p>
      </div>
    );
  }

  return (
    <motion.div
      className="h-full overflow-y-auto"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      <div className="w-full px-6 sm:px-10 py-8 sm:py-10 space-y-8">
        {/* Header with refresh */}
        <motion.div variants={staggerItem} className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-body text-xl font-medium tracking-tight text-text-primary mb-1">
              AI Insights
            </h2>
            <p className="text-sm text-text-muted">
              Powered by Claude Opus 4.5 via Lava API
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="shrink-0 px-4 py-2 rounded-full font-body text-xs font-medium transition-all"
            style={{
              background: refreshing ? 'rgba(107, 101, 96, 0.1)' : 'rgba(78, 119, 84, 0.1)',
              color: refreshing ? SYNAPSE : GREEN,
            }}
          >
            {refreshing ? 'Generating...' : 'Refresh Insights'}
          </button>
        </motion.div>

        {/* Main Score Card */}
        <motion.div variants={staggerItem}>
          <NeuralScoreCard
            score={insights.neural_rewiring_score}
            pattern={insights.dopamine_pattern}
            streakDays={insights.streak_days}
          />
        </motion.div>

        {/* Summary & Motivation */}
        <motion.div variants={staggerItem} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div
            className="rounded-2xl border p-6 glass-frosted"
            style={{ borderColor: 'rgba(44, 38, 31, 0.1)' }}
          >
            <h3 className="font-body text-xs tracking-wide text-text-muted uppercase mb-3">
              Your Progress Summary
            </h3>
            <p className="font-body text-sm text-text-primary leading-relaxed">
              {insights.summary}
            </p>
          </div>

          <div
            className="rounded-2xl border p-6 glass-frosted"
            style={{
              borderColor: 'rgba(78, 119, 84, 0.2)',
              background: 'linear-gradient(145deg, rgba(78, 119, 84, 0.06) 0%, rgba(253, 250, 246, 0.8) 100%)',
            }}
          >
            <h3 className="font-body text-xs tracking-wide uppercase mb-3" style={{ color: GREEN }}>
              Daily Motivation
            </h3>
            <p className="font-body text-sm text-text-primary leading-relaxed italic">
              "{insights.motivational_message}"
            </p>
          </div>
        </motion.div>

        {/* Stats Row */}
        {stats && (
          <motion.div variants={staggerItem} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Reels"
              value={stats.total_events}
              color="synapse"
            />
            <StatCard
              label="Skip Rate"
              value={stats.skip_rate}
              suffix="%"
              color="rose"
            />
            <StatCard
              label="Engagement"
              value={stats.engagement_rate}
              suffix="%"
              color="green"
            />
            <StatCard
              label="Quality Ratio"
              value={stats.quality_ratio}
              suffix="%"
              color="green"
            />
          </motion.div>
        )}

        {/* Themes */}
        <motion.div variants={staggerItem} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <ThemeList
            title="Value Themes - Growing"
            themes={insights.top_value_themes}
            color="value"
          />
          <ThemeList
            title="Avoided Themes - Declining"
            themes={insights.top_avoided_themes}
            color="toxic"
          />
        </motion.div>

        {/* Insights Cards */}
        <motion.div variants={staggerItem}>
          <h3 className="font-body text-xs tracking-wide text-text-muted uppercase mb-4">
            AI Analysis
          </h3>
          <div className="space-y-3">
            {insights.insights.map((insight, i) => (
              <InsightCard key={i} type={insight.type} message={insight.message} />
            ))}
            {insights.insights.length === 0 && (
              <p className="font-body text-sm text-text-muted">
                Keep scrolling to generate more insights!
              </p>
            )}
          </div>
        </motion.div>

        {/* Top Categories */}
        {stats && stats.top_categories.length > 0 && (
          <motion.div variants={staggerItem}>
            <h3 className="font-body text-xs tracking-wide text-text-muted uppercase mb-4">
              Content Categories
            </h3>
            <div className="flex flex-wrap gap-2">
              {stats.top_categories.slice(0, 12).map(([category, count]) => (
                <span
                  key={category}
                  className="px-3 py-1.5 rounded-full font-body text-xs"
                  style={{
                    background: 'rgba(44, 38, 31, 0.06)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {category} <span className="text-text-muted">({count})</span>
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function NeuralScoreCard({
  score,
  pattern,
  streakDays,
}: {
  score: number;
  pattern: string;
  streakDays: number;
}) {
  const animatedScore = useCountUp(score, 1200);
  const patternColor = DOPAMINE_COLORS[pattern] || SYNAPSE;

  return (
    <div
      className="relative rounded-2xl border p-6 sm:p-8 overflow-hidden"
      style={{
        borderColor: 'rgba(78, 119, 84, 0.25)',
        background: 'linear-gradient(165deg, rgba(78, 119, 84, 0.12) 0%, rgba(253, 250, 246, 0.9) 60%)',
      }}
    >
      {/* Background decoration */}
      <div
        className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-20 blur-3xl"
        style={{ background: GREEN, transform: 'translate(30%, -30%)' }}
      />

      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          {/* Score Circle */}
          <div className="relative">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="rgba(44, 38, 31, 0.08)"
                strokeWidth="8"
              />
              <motion.circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={GREEN}
                strokeWidth="8"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: score / 100 }}
                transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] as const }}
                style={{
                  strokeDasharray: '264',
                  strokeDashoffset: '0',
                }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-body text-2xl font-semibold text-text-primary tabular-nums">
                {animatedScore}
              </span>
            </div>
          </div>

          <div>
            <h3 className="font-body text-lg font-medium text-text-primary mb-1">
              Neural Rewiring Score
            </h3>
            <p className="font-body text-sm text-text-muted">
              Your brain is adapting to healthier content patterns
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          {/* Pattern Badge */}
          <div className="text-center">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-1"
              style={{ background: `${patternColor}20` }}
            >
              <span className="text-lg">
                {pattern === 'healthy' ? '✨' : pattern === 'improving' ? '📈' : pattern === 'mixed' ? '⚖️' : '⚠️'}
              </span>
            </div>
            <p
              className="font-body text-xs font-medium capitalize"
              style={{ color: patternColor }}
            >
              {pattern}
            </p>
          </div>

          {/* Streak */}
          <div className="text-center">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-1"
              style={{ background: 'rgba(181, 132, 61, 0.12)' }}
            >
              <span className="text-lg">🔥</span>
            </div>
            <p className="font-body text-xs font-medium" style={{ color: AMBER }}>
              {streakDays} days
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix = '',
  color,
}: {
  label: string;
  value: number;
  suffix?: string;
  color: 'green' | 'rose' | 'synapse';
}) {
  const n = useCountUp(Math.round(value), 800);
  const accentColor = color === 'green' ? GREEN : color === 'rose' ? ROSE : SYNAPSE;

  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: 'rgba(44, 38, 31, 0.08)',
        borderLeftWidth: 3,
        borderLeftColor: accentColor,
        background: 'rgba(253, 250, 246, 0.6)',
      }}
    >
      <p className="font-body text-[10px] tracking-wide text-text-dim uppercase mb-1">
        {label}
      </p>
      <p className="font-body text-xl font-semibold text-text-primary tabular-nums">
        {n}
        {suffix}
      </p>
    </div>
  );
}

function ThemeList({
  title,
  themes,
  color,
}: {
  title: string;
  themes: string[];
  color: 'value' | 'toxic';
}) {
  const accentColor = color === 'value' ? GREEN : ROSE;

  return (
    <div
      className="rounded-2xl border p-5 glass-frosted"
      style={{ borderColor: `${accentColor}30` }}
    >
      <h3
        className="font-body text-xs tracking-wide uppercase mb-4 font-medium"
        style={{ color: accentColor }}
      >
        {title}
      </h3>
      {themes.length > 0 ? (
        <div className="space-y-2">
          {themes.map((theme, i) => (
            <motion.div
              key={theme}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3"
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: accentColor }}
              />
              <span className="font-body text-sm text-text-primary capitalize">
                {theme}
              </span>
            </motion.div>
          ))}
        </div>
      ) : (
        <p className="font-body text-sm text-text-muted">
          {color === 'value' ? 'Keep engaging with quality content!' : 'Great job avoiding toxic content!'}
        </p>
      )}
    </div>
  );
}

function InsightCard({ type, message }: { type: string; message: string }) {
  const config = {
    win: { icon: '🏆', color: GREEN, bg: 'rgba(78, 119, 84, 0.08)', label: 'Win' },
    challenge: { icon: '🎯', color: AMBER, bg: 'rgba(181, 132, 61, 0.08)', label: 'Challenge' },
    recommendation: { icon: '💡', color: '#5a7ab8', bg: 'rgba(90, 122, 184, 0.08)', label: 'Recommendation' },
  }[type] || { icon: '💭', color: SYNAPSE, bg: 'rgba(107, 101, 96, 0.08)', label: 'Insight' };

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className="flex items-start gap-4 rounded-xl p-4"
      style={{ background: config.bg }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${config.color}15` }}
      >
        <span className="text-lg">{config.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="font-body text-[10px] tracking-wide uppercase mb-1 font-medium"
          style={{ color: config.color }}
        >
          {config.label}
        </p>
        <p className="font-body text-sm text-text-primary leading-relaxed">
          {message}
        </p>
      </div>
    </motion.div>
  );
}
