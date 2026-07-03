import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import {
  createTeam,
  deleteTeam,
  getTeam,
  listTeams,
  setLeader,
  updateTeam,
} from './api';
import type { CreateTeamInput, UpdateTeamInput } from './types';

/** List query — a bare array (no pagination); the key has no params. */
export function useTeams() {
  return useQuery({
    queryKey: queryKeys.teams.list,
    queryFn: listTeams,
  });
}

/** Single team (detail header). */
export function useTeam(id: string) {
  return useQuery({
    queryKey: queryKeys.teams.detail(id),
    queryFn: () => getTeam(id),
  });
}

function useInvalidateTeams() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.teams.all });
}

export function useCreateTeam() {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: (input: CreateTeamInput) => createTeam(input),
    onSuccess: invalidate,
  });
}

export function useUpdateTeam(id: string) {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: (input: UpdateTeamInput) => updateTeam(id, input),
    onSuccess: invalidate,
  });
}

/** Leader swap mutates User.role, so refresh BOTH teams (detail) and users (member list) caches. */
export function useSetLeader(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => setLeader(id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.teams.all });
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useDeleteTeam(id: string) {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: () => deleteTeam(id),
    onSuccess: invalidate,
  });
}
