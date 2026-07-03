import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import {
  createUser,
  deactivateUser,
  listUsers,
  reactivateUser,
  updateUser,
} from './api';
import type { CreateUserInput, ListUsersParams, UpdateUserInput } from './types';

/** List query. `placeholderData: prev` keeps the current page on screen while filters/pages change. */
export function useUsers(params: ListUsersParams) {
  return useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: () => listUsers(params),
    placeholderData: (prev) => prev,
  });
}

/** Invalidate every user list after a write, so the UI resyncs with the server. */
function useInvalidateUsers() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.users.all });
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (input: CreateUserInput) => createUser(input),
    onSuccess: invalidate,
  });
}

export function useUpdateUser(id: string) {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (input: UpdateUserInput) => updateUser(id, input),
    onSuccess: invalidate,
  });
}

export function useDeactivateUser(id: string) {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: () => deactivateUser(id),
    onSuccess: invalidate,
  });
}

export function useReactivateUser(id: string) {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: () => reactivateUser(id),
    onSuccess: invalidate,
  });
}
