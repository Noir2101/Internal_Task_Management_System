import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { StatsResponse } from './types';
import { CHART_INK, OVERDUE_COLOR, PROGRESS_COLOR, PROGRESS_ORDER } from './colors';
import { PROGRESS_LABELS } from '../../lib/labels';

/**
 * byAssignee stacked bar + companion table (docs/09 §2.3). The stack has EXACTLY the 3 progress
 * segments; per-assignee OVERDUE is kept OFF the color axis and shown only in the table column
 * (docs/09 §3.5). byAssignee is an outer-join, so idle members appear with an empty bar / all-zero row.
 * A 2px surface stroke separates stacked segments (dataviz gap rule). One axis.
 */
export function ByAssigneeChart({ stats }: { stats: StatsResponse }) {
  const rows = stats.byAssignee.map((a) => ({
    name: a.assignee.name,
    TODO: a.byProgress.TODO,
    IN_PROGRESS: a.byProgress.IN_PROGRESS,
    DONE: a.byProgress.DONE,
    overdue: a.overdue,
    total: a.byProgress.TODO + a.byProgress.IN_PROGRESS + a.byProgress.DONE,
  }));
  const height = Math.max(160, rows.length * 44 + 48);

  return (
    <>
      <Typography variant="h6" gutterBottom>
        Theo người được giao
      </Typography>
      {rows.length === 0 ? (
        <Typography color="text.secondary">Chưa có thành viên nào.</Typography>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={height}>
            <BarChart
              layout="vertical"
              data={rows}
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            >
              <CartesianGrid horizontal={false} stroke={CHART_INK.grid} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: CHART_INK.muted, fontSize: 12 }}
                axisLine={{ stroke: CHART_INK.axis }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fill: CHART_INK.secondary, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Legend />
              {PROGRESS_ORDER.map((k, i) => (
                <Bar
                  key={k}
                  dataKey={k}
                  name={PROGRESS_LABELS[k]}
                  stackId="progress"
                  fill={PROGRESS_COLOR[k]}
                  stroke={CHART_INK.surface}
                  strokeWidth={1}
                  isAnimationActive={false}
                  radius={i === PROGRESS_ORDER.length - 1 ? [0, 4, 4, 0] : undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>

          <TableContainer sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Người được giao</TableCell>
                  {PROGRESS_ORDER.map((k) => (
                    <TableCell key={k} align="right">
                      {PROGRESS_LABELS[k]}
                    </TableCell>
                  ))}
                  <TableCell align="right">Tổng</TableCell>
                  <TableCell align="right">Quá hạn</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell align="right">{r.TODO}</TableCell>
                    <TableCell align="right">{r.IN_PROGRESS}</TableCell>
                    <TableCell align="right">{r.DONE}</TableCell>
                    <TableCell align="right">{r.total}</TableCell>
                    <TableCell align="right">
                      {r.overdue > 0 ? (
                        <Box component="span" sx={{ color: OVERDUE_COLOR, fontWeight: 600 }}>
                          {r.overdue}
                        </Box>
                      ) : (
                        0
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </>
  );
}
