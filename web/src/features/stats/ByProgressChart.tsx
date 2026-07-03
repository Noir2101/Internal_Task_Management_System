import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Typography } from '@mui/material';
import type { StatsResponse } from './types';
import { CHART_INK, PROGRESS_COLOR, PROGRESS_ORDER } from './colors';

/**
 * byProgress bar chart (docs/09 §2.3). EXACTLY 3 bars (TODO/IN_PROGRESS/DONE) — overdue is never a
 * bar here (docs/09 §3.5). Each bar carries its progress hue (consistent with the stacked chart) and
 * a direct value label; the axis names each bar, so identity is not color-alone. One measure, one axis.
 */
export function ByProgressChart({ stats }: { stats: StatsResponse }) {
  const data = PROGRESS_ORDER.map((k) => ({ name: k, value: stats.byProgress[k] }));

  return (
    <>
      <Typography variant="h6" gutterBottom>
        Tiến độ — số lượng
      </Typography>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 20, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
          <XAxis
            dataKey="name"
            tick={{ fill: CHART_INK.secondary, fontSize: 12 }}
            axisLine={{ stroke: CHART_INK.axis }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            width={32}
            tick={{ fill: CHART_INK.muted, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: 'rgba(11,11,11,0.04)' }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={80} isAnimationActive={false}>
            <LabelList dataKey="value" position="top" fill={CHART_INK.primary} fontSize={12} />
            {data.map((d) => (
              <Cell key={d.name} fill={PROGRESS_COLOR[d.name]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
