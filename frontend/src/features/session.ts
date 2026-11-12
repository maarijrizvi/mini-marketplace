'use client';
/** Who is signed in, and signing in and out. A 401 from /me means "signed out", not an error. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type Schemas } from '@/lib/api/client';
import { authApi, meApi } from '@/lib/api/endpoints';

export type User = Schemas['UserOut'];

async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => orNull(meApi.get()).then((r) => r?.user ?? null), staleTime: 60_000 });
}

export function useAdminMe() {
  return useQuery({
    queryKey: ['admin-me'],
    queryFn: () => orNull(authApi.adminMe()).then((r) => r?.admin ?? null),
    staleTime: 60_000,
  });
}

export function isApprovedSeller(user: User | null | undefined): boolean {
  return user?.seller?.status === 'approved';
}

/** Approved or suspended: a suspended shop still sends the orders it already took. */
export function canUseSellerHub(user: User | null | undefined): boolean {
  return user?.seller?.status === 'approved' || user?.seller?.status === 'suspended';
}

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.signIn,
    onSuccess: (r) => {
      qc.clear();
      qc.setQueryData(['me'], r.user);
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.signOut,
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  });
}

export function useSignUp() {
  return useMutation({ mutationFn: authApi.signUp });
}

export function useVerifyEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.verifyEmail,
    onSuccess: (r) => qc.setQueryData(['me'], r.user),
  });
}

export function useAdminSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.adminSignIn,
    onSuccess: (r) => qc.setQueryData(['admin-me'], r.admin),
  });
}

export function useAdminSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.adminSignOut,
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(['admin-me'], null);
    },
  });
}

