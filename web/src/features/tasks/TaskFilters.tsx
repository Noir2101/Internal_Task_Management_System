import { Box, MenuItem, TextField } from '@mui/material';
import { PROGRESS_VALUES } from './types';
import type { OverdueFilter, Progress, RosterMember } from './types';
import { PROGRESS_LABELS } from '../../lib/labels';

/**
 * Filter UI state. `'all'` is the unfiltered sentinel for the select filters (maps to omitting the
 * param). It is non-empty on purpose, so MUI's label shrinks naturally and never needs displayEmpty.
 * `overdue` is its own tri-state.
 */
export interface TaskFiltersValue {
  progress: Progress | 'all';
  overdue: OverdueFilter;
  assigneeId: string;
  q: string;
}

/**
 * The list filter bar. `progress` and `overdue` are TWO SEPARATE controls (docs/09 §3.5, two-axis):
 * one select for `?progress=`, one tri-state for `?overdue=`; the backend combines them AND. Progress
 * options render friendly labels (the value stays the enum). `hideAssignee` supports the my-tasks seam.
 */
export function TaskFilters({
  value,
  roster,
  hideAssignee = false,
  onChange,
}: {
  value: TaskFiltersValue;
  roster: RosterMember[];
  hideAssignee?: boolean;
  onChange: (patch: Partial<TaskFiltersValue>) => void;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <TextField
        select
        label="Tiến độ"
        size="small"
        sx={{ minWidth: 160 }}
        value={value.progress}
        onChange={(e) => onChange({ progress: e.target.value as Progress | 'all' })}
      >
        <MenuItem value="all">Tất cả</MenuItem>
        {PROGRESS_VALUES.map((p) => (
          <MenuItem key={p} value={p}>
            {PROGRESS_LABELS[p]}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        select
        label="Trạng thái"
        size="small"
        sx={{ minWidth: 160 }}
        value={value.overdue}
        onChange={(e) => onChange({ overdue: e.target.value as OverdueFilter })}
      >
        <MenuItem value="all">Tất cả</MenuItem>
        <MenuItem value="overdue">Chỉ quá hạn</MenuItem>
        <MenuItem value="ontime">Chưa quá hạn</MenuItem>
      </TextField>

      {!hideAssignee && (
        <TextField
          select
          label="Người được giao"
          size="small"
          sx={{ minWidth: 200 }}
          value={value.assigneeId}
          onChange={(e) => onChange({ assigneeId: e.target.value })}
        >
          <MenuItem value="all">Tất cả</MenuItem>
          {roster.map((m) => (
            <MenuItem key={m.id} value={m.id}>
              {m.name}
            </MenuItem>
          ))}
        </TextField>
      )}

      <TextField
        label="Tìm kiếm"
        size="small"
        placeholder="Tiêu đề hoặc mô tả"
        sx={{ minWidth: 220, flexGrow: 1 }}
        value={value.q}
        onChange={(e) => onChange({ q: e.target.value })}
      />
    </Box>
  );
}
