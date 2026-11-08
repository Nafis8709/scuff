// A compact description of the payment hold.

import type { PaymentState } from "@/lib/types";
import { formatMoney } from "@/lib/money";

const PROVIDER = { braintree: "Braintree (PayPal)", paypal: "PayPal", mock: "Simulated" };

export default function HoldSummary({ payment, currency }: { payment: PaymentState; currency: string }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-asphalt-soft">Held</dt>
      <dd className="font-semibold">{formatMoney(payment.authorizedAmount, currency)}</dd>
      <dt className="text-asphalt-soft">On</dt>
      <dd>{payment.description}</dd>
      <dt className="text-asphalt-soft">Hold valid until</dt>
      <dd>{new Date(payment.expiresAt).toLocaleDateString()}</dd>
      <dt className="text-asphalt-soft">Processed by</dt>
      <dd>{PROVIDER[payment.provider]}</dd>
      <dt className="text-asphalt-soft">Authorization</dt>
      <dd className="break-all">{payment.authorizationId}</dd>
      {payment.captureId && (
        <>
          <dt className="text-asphalt-soft">Charge</dt>
          <dd className="break-all">{payment.captureId}</dd>
        </>
      )}
    </dl>
  );
}
