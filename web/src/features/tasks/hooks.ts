import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import {
  createTask,
  deleteTask,
  getRoster,
  getTask,
  listTasks,
  reassignTask,
  updateProgress,
  updateTask,
} from './api';
import type { CreateTaskInput, ListTasksParams, Progress, UpdateTaskInput } from './types';

/** List query. `placeholderData: prev` keeps the current page on screen while filters/pages change. */
export function useTasks(params: ListTasksParams) {
  return useQuery({
    queryKey: queryKeys.tasks.list(params),
    queryFn: () => listTasks(params),
    placeholderData: (prev) => prev,
  });
}

/** Keystone detail query — a foreign/out-of-scope id resolves to a 404 ApiError. */
export function useTask(id: string) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(id),
    queryFn: () => getTask(id),
  });
}

/** Roster for assignee dropdowns; disabled for admins (teamId null). Changes rarely → cache it. */
export function useRoster(teamId: string | null) {
  return useQuery({
    queryKey: queryKeys.roster(teamId ?? ''),
    queryFn: () => getRoster(teamId as string),
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Invalidate every task list + detail after a write, so the UI resyncs with the server. */
function useInvalidateTasks() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
}

export function useCreateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input),
    onSuccess: invalidate,
  });
}

export function useUpdateTask(id: string) {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (input: UpdateTaskInput) => updateTask(id, input),
    onSuccess: invalidate,
  });
}

export function useUpdateProgress(id: string) {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (progress: Progress) => updateProgress(id, progress),
    onSuccess: invalidate,
  });
}

export function useReassignTask(id: string) {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (assigneeId: string) => reassignTask(id, assigneeId),
    onSuccess: invalidate,
  });
}

export function useDeleteTask(id: string) {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: () => deleteTask(id),
    onSuccess: invalidate,
  });
}
