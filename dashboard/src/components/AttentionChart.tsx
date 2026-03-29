import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WatchtimePoint } from '../services/dataService';

const POS = '#4e7754';
const TOX = '#a86063';
const SYN = '#6b6560';

type Row = {
  label: string;
  day: number;
  positive: number;
  toxic: number;
  qualityLine: number;
  qualityScore: number;
};

export default function AttentionChart({ data }: { data: WatchtimePoint[] }) {
  const { chartData, maxY } = useMemo(() => {
    const maxY = Math.max(...data.map((d) => d.total_min), 1) * 1.14;
    const chartData: Row[] = data.map((d) => ({
      label: d.label,
      day: d.day,
      positive: d.positive_min,
      toxic: d.toxic_min,
      qualityLine: (d.quality_score / 100) * maxY,
      qualityScore: d.quality_score,
    }));
    return { chartData, maxY };
  }, [data]);

  return (
    <div className="relative w-full pl-1 pr-2" style={{ height: 340 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 8, right: 8, left: -18, bottom: 4 }}
        >
          <defs>
            <linearGradient id="chartFillPositive" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={POS} stopOpacity={0.26} />
              <stop offset="100%" stopColor={POS} stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="chartFillToxic" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TOX} stopOpacity={0.18} />
              <stop offset="100%" stopColor={TOX} stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="chartLineQuality" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={SYN} />
              <stop offset="100%" stopColor={POS} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="4 4"
            stroke="rgba(44,38,31,0.08)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fill: '#8a8274', fontSize: 10, fontFamily: 'DM Sans, sans-serif' }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(44,38,31,0.1)' }}
          />
          <YAxis
            domain={[0, maxY]}
            tick={{ fill: '#8a8274', fontSize: 10, fontFamily: 'DM Sans, sans-serif' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${Math.round(v)}m`}
          />

          <Tooltip
            cursor={{ stroke: 'rgba(44,38,31,0.12)', strokeDasharray: '4 4' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as Row;
              return (
                <div
                  className="rounded-xl border px-4 py-3 min-w-[168px] shadow-lg"
                  style={{
                    background: 'rgba(253, 250, 246, 0.94)',
                    borderColor: 'rgba(44, 38, 31, 0.12)',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <p className="font-body text-[10px] tracking-wide text-text-dim uppercase mb-2">
                    {row.label} — Day {row.day}
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-value" />
                        <span className="text-xs text-text-muted">Positive</span>
                      </div>
                      <span className="font-body text-xs text-text-primary tabular-nums">
                        {row.positive}m
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-toxic" />
                        <span className="text-xs text-text-muted">Toxic</span>
                      </div>
                      <span className="font-body text-xs text-text-primary tabular-nums">
                        {row.toxic}m
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 pt-1 border-t border-stone-400/25">
                      <span className="text-xs text-text-muted">Quality</span>
                      <span className="font-body text-xs text-value tabular-nums">
                        {row.qualityScore}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            }}
          />

          <Area
            type="monotone"
            dataKey="toxic"
            stroke={TOX}
            strokeWidth={1.6}
            fill="url(#chartFillToxic)"
            fillOpacity={1}
            dot={false}
            activeDot={{ r: 4, fill: TOX }}
            isAnimationActive
            animationDuration={1300}
            animationEasing="ease-out"
          />
          <Area
            type="monotone"
            dataKey="positive"
            stroke={POS}
            strokeWidth={2.2}
            fill="url(#chartFillPositive)"
            fillOpacity={1}
            dot={false}
            activeDot={{ r: 5, fill: POS }}
            isAnimationActive
            animationDuration={1300}
            animationBegin={120}
            animationEasing="ease-out"
          />
          <Line
            type="monotone"
            dataKey="qualityLine"
            stroke="url(#chartLineQuality)"
            strokeWidth={1.5}
            strokeDasharray="5 5"
            dot={false}
            isAnimationActive
            animationDuration={1400}
            animationBegin={220}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="absolute top-1 right-2 flex items-center gap-4 pointer-events-none">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-[2px] rounded bg-value" />
          <span className="font-body text-[10px] text-text-dim tracking-wider">
            Positive
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-[2px] rounded bg-toxic opacity-80" />
          <span className="font-body text-[10px] text-text-dim tracking-wider">
            Toxic
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-[2px] rounded border-b border-dashed border-synapse" />
          <span className="font-body text-[10px] text-text-dim tracking-wider">
            Quality
          </span>
        </div>
      </div>
    </div>
  );
}
