'use client';
/** The simulated payment gateway's hosted page. A real gateway would show its own card form here. */
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { ErrorNote, Loading } from '@/components/ui';
import { paymentMethodLabel, rupees } from '@/features/format';
import { sandboxApi } from '@/lib/api/endpoints';

export default function SandboxPay() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const router = useRouter();
  const { data, isLoading, error } = useQuery({ queryKey: ['sandbox', paymentId], queryFn: () => sandboxApi.payment(paymentId) });
  const complete = useMutation({
    mutationFn: (outcome: 'succeeded' | 'failed' | 'no_answer') => sandboxApi.completePayment(paymentId, outcome),
    onSuccess: () => router.push(`/orders/${data?.orderId}`),
  });

  return (
    <div className="auth" style={{ minHeight: '100vh' }}>
      <div className="card sandbox">
        <span className="chip warn" style={{ alignSelf: 'flex-start' }}>
          Sandbox payment gateway
        </span>
        {isLoading ? (
          <Loading />
        ) : error || !data ? (
          <ErrorNote error={error} />
        ) : (
          <>
            <div>
              <h1 style={{ fontSize: 24 }}>Pay {rupees(data.amount)}</h1>
              <p className="muted">
                Order #{data.orderId} · {paymentMethodLabel[data.method as 'card' | 'wallet'] ?? data.method}
              </p>
            </div>
            {data.status !== 'pending' ? (
              <div className="note">This payment is already {data.status}.</div>
            ) : (
              <>
                <p className="small muted">
                  No real money moves. Pick what the gateway should report; it sends a signed webhook to the
                  marketplace, just like a real one.
                </p>
                <ErrorNote error={complete.error} />
                <button className="btn gold block" disabled={complete.isPending} onClick={() => complete.mutate('succeeded')}>
                  Approve payment
                </button>
                <button className="btn danger block" disabled={complete.isPending} onClick={() => complete.mutate('failed')}>
                  Decline payment
                </button>
                <button className="btn ghost block" disabled={complete.isPending} onClick={() => complete.mutate('no_answer')}>
                  Never answer (hold expires in 15 min)
                </button>
              </>
            )}
            <button className="linkbtn" onClick={() => router.push(`/orders/${data.orderId}`)}>
              Back to the order
            </button>
          </>
        )}
      </div>
    </div>
  );
}
