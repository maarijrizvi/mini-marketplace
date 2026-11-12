'use client';
/** Admin console: sellers, users, categories, orders, payments, jobs and the audit log. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Schemas } from '@/lib/api/client';
import { adminApi } from '@/lib/api/endpoints';

type S = Schemas;

export function useAdminUsers(q?: string, sellerStatus?: S['SellerStatus']) {
  return useQuery({ queryKey: ['admin-users', q, sellerStatus], queryFn: () => adminApi.users({ q, sellerStatus }) });
}

export function useAdminUser(id: string | null) {
  return useQuery({ queryKey: ['admin-user', id], queryFn: () => adminApi.user(id!), enabled: !!id });
}

export function useReviewSeller() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: 'approve' | 'reject' | 'suspend' | 'reinstate'; reason?: string }) =>
      adminApi.reviewSeller(id, action, reason),
    onSuccess: (u) => {
      qc.setQueryData(['admin-user', u.id], u);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
}

/** Which review actions make sense for a seller in this state. */
export function reviewActions(status: S['SellerStatus'] | undefined) {
  switch (status) {
    case 'pending':
      return ['approve', 'reject'] as const;
    case 'approved':
      return ['suspend'] as const;
    case 'suspended':
      return ['reinstate'] as const;
    default:
      return [] as const;
  }
}

function payoutKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `po-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function usePayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount, note, key = payoutKey() }: { id: string; amount: number; note?: string; key?: string }) =>
      adminApi.payout(id, { amount, note }, key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-audit'] }),
  });
}

export function useCategoryMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['categories'] });
  return {
    create: useMutation({ mutationFn: adminApi.createCategory, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: S['CategoryUpdate'] }) => adminApi.updateCategory(id, body),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: adminApi.deleteCategory, onSuccess: refresh }),
  };
}

export function useAdminOrders(filters: { status?: S['OrderStatus']; paymentMethod?: 'cod' | 'online'; q?: string }) {
  return useQuery({ queryKey: ['admin-orders', filters], queryFn: () => adminApi.orders(filters) });
}

export function useAdminOrder(id: string | null) {
  return useQuery({ queryKey: ['admin-order', id], queryFn: () => adminApi.order(id!), enabled: !!id });
}

export function useAdminCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminApi.cancelOrder(id, reason),
    onSuccess: (o) => {
      qc.setQueryData(['admin-order', o.id], o);
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
    },
  });
}

export function useAdminPayments(filters: { status?: S['PaymentStatus']; kind?: S['PaymentKind'] }) {
  return useQuery({ queryKey: ['admin-payments', filters], queryFn: () => adminApi.payments(filters) });
}

export function useAudit(filters: { entityType?: string; entityId?: string; actorType?: S['ActorType']; actorId?: string }) {
  return useQuery({ queryKey: ['admin-audit', filters], queryFn: () => adminApi.audit(filters) });
}

export function useJobs(state?: 'queued' | 'running' | 'failed') {
  return useQuery({ queryKey: ['admin-jobs', state], queryFn: () => adminApi.jobs({ state }), refetchInterval: 5000 });
}

export function useJobCounts() {
  return useQuery({ queryKey: ['admin-job-counts'], queryFn: adminApi.jobCounts, refetchInterval: 5000 });
}

export function useJobActions() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-jobs'] });
    qc.invalidateQueries({ queryKey: ['admin-job-counts'] });
  };
  return {
    retry: useMutation({ mutationFn: adminApi.retryJob, onSuccess: refresh }),
    remove: useMutation({ mutationFn: adminApi.removeJob, onSuccess: refresh }),
  };
}
