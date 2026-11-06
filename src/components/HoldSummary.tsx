// A compact description of the PayPal hold.

import type { PaymentState } from "@/lib/types";
import { formatMoney } from "@/lib/money";

export default function HoldSummary({ payment, currency }: { payment: PaymentState; currency: string }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-asphalt-soft">Held</dt>
      <dd className="font-semibold">{formatMoney(payment.authorizedAmount, currency)}</dd>
      <dt className="text-asphalt-soft">Hold expires</dt>
      <dd>{new Date(payment.expiresAt).toLocaleDateString()}</dd>
      <dt className="text-asphalt-soft">PayPal authorization</dt>
      <dd className="break-all">{payment.authorizationId}</dd>
      {payment.captureId && (
        <>
          <dt className="text-asphalt-soft">PayPal capture</dt>
          <dd className="break-all">{payment.captureId}</dd>
        </>
      )}
    </dl>
  );
}
