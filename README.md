# Scuff: settle a minor car scrape fairly, before you drive away

Scuff is an entry for the **PayPal AI Hackathon 2026**. It is built with **Braintree** (a PayPal service: authorize, partial settlement, void, vaulted re-authorization), an alternative **PayPal Orders and Payments API** integration, and a vision model with structured outputs: **Gemini** (free tier) or **Claude**.

## The problem

After a minor scrape with no injuries, many drivers skip insurance and agree to "sort it out between us". In one survey, 42% of Ontario drivers said they would consider a cash settlement after a collision. These handshake deals usually fail in one of two ways:

- **The payer disappears.** The usual advice is to never hand over cash at the scene, because there is no proof and no guarantee.
- **The bill grows.** A few days later the other driver sends a repair quote that includes things that were never damaged.

Neither driver trusts the other, so one of them usually ends up feeling cheated.

## What Scuff does

1. **At the scene.** One driver starts a case and shows a QR code; the other scans it, with no app to install.
   - Both drivers answer an injury question. If anyone is hurt, the settlement is stopped.
   - Both add photos and a short statement.
   - The AI (**Gemini** or **Claude**) reads every photo and both statements. It produces a structured damage report: damaged zones, severity, the photo IDs that show each zone, and a repair-cost range. It also gives a neutral summary of what happened and lists any points where the two statements disagree.
2. **Agree and hold.** Both drivers sign one plain-language agreement with a **cap**.
   - The paying driver places an **authorization hold** for the cap through Braintree (card, PayPal or Venmo). The money is reserved, so nobody can vanish, but nothing is charged yet.
3. **Pay what the evidence supports.** After the repair, the receiver uploads the invoice.
   - The AI checks every invoice line against the scene photos and marks it *matches the scene*, *not documented* or *unclear*.
   - Our own code (not the model) adds up the matching lines and limits the total to the cap.
   - **The AI advises, people decide.** The paying driver can choose to pay any line the AI rejected or wasn't sure about.
   - When the receiver accepts, **only that amount is charged** from the hold (a partial settlement). The rest of the hold is released.

Both drivers end up with the same printable record: photos, the AI report, the signed agreement with its SHA-256 fingerprint, the invoice check, and the PayPal IDs.

## How PayPal is used

Scuff's whole design rests on **authorize now, charge only the verified amount later**. Two interchangeable providers implement it (`src/lib/payments.ts` picks one):

### Braintree (default)

Braintree's sandbox accepts sign-ups from any country, including places where a PayPal account cannot be opened (the author builds from Bangladesh). Judges can test it with sandbox test cards.

| Step | Braintree call |
|---|---|
| Show the card / PayPal form | `clientToken.generate` and the Drop-in UI |
| Place the hold | `transaction.sale` with `submitForSettlement: false`, which creates an authorization only. The payment method is vaulted (`storeInVaultOnSuccess`) |
| Charge the verified amount | `transaction.submitForSettlement(id, verifiedAmount)`, a **partial settlement**. The remainder of the authorization is released |
| Nothing verified | `transaction.void(id)` |
| Repair takes longer than the hold | New authorization on the vaulted payment method, then the old one is voided |

### PayPal Orders v2 (alternative, used when only PayPal REST keys are set)

| Step | PayPal API |
|---|---|
| Place the hold | `POST /v2/checkout/orders` with `intent: AUTHORIZE` and `payee.email_address` set to the receiver |
| Payer approves | PayPal JS SDK buttons (`intent=authorize`) |
| Reserve the funds | `POST /v2/checkout/orders/{id}/authorize` |
| Pay the verified amount | `POST /v2/payments/authorizations/{id}/capture` with a partial amount and `final_capture: true` |
| Nothing verified | `POST /v2/payments/authorizations/{id}/void` |
| Extend the hold | `POST /v2/payments/authorizations/{id}/reauthorize` |

All money-moving PayPal calls send a `PayPal-Request-Id`, so a retry never charges twice.

### Path to production

Holding money for two strangers is a regulated activity: PayPal's Acceptable Use Policy treats escrow-like services as payment facilitation that needs approval. In production, Scuff would run on **PayPal's multiparty platform**:
- receiving drivers are onboarded as payees;
- the verified amount settles straight to them;
- Scuff never holds the funds.

In this prototype, Braintree sandbox funds settle to Scuff's sandbox merchant account.

## How AI is used

Both calls are in `src/lib/ai.ts`, and either model can serve them:
- **Gemini** (`GEMINI_API_KEY`, free tier): `responseMimeType: application/json` with `responseJsonSchema`.
- **Claude** (`ANTHROPIC_API_KEY`): structured outputs via `output_config.format`.

In both cases every response is valid JSON that matches our schema.

- **Damage assessment.** Input is up to 12 labelled photos plus both statements. Output is damage zones with photo citations, a cost range, a neutral summary, statement conflicts, safety flags (airbags deployed, leaks, unsafe to drive, which means "use your insurer"), and suggestions for missing photos.
- **Invoice check.** Input is the invoice image, the scene photos and the damage report. Output is a verdict and a reason for every line.

The AI never writes the legal terms of the agreement, and never decides how much is paid. The agreement is a fixed template (`src/lib/agreement.ts`), and the amount is deterministic math over the AI's line verdicts (`totalSupported` in `ai.ts`).

## Run it locally

Requirements: Node 20 or newer.

```bash
git clone https://github.com/Nafis8709/scuff.git
cd scuff
npm install
cp .env.example .env.local   # add your keys (see below)
npm run dev                  # http://localhost:3000
```

**Without keys** the app runs in *practice mode*: AI results are sample data and payments are simulated. The whole flow can still be clicked through.

**With keys:**

- AI: `GEMINI_API_KEY` from Google AI Studio (free tier), or `ANTHROPIC_API_KEY` from the Claude Console.
- Braintree: `BRAINTREE_MERCHANT_ID`, `BRAINTREE_PUBLIC_KEY` and `BRAINTREE_PRIVATE_KEY`, from a free sandbox account at braintreepayments.com/sandbox (Settings → API). Pay with the test card `4111 1111 1111 1111`, any future expiry date and any CVV.
- Or PayPal REST instead: `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` from a sandbox app at developer.paypal.com.

### Try both drivers on one screen

Open **`/demo`**. It creates a fresh case and shows both drivers' phones side by side: Alex is paying, Sam is being paid.
- Use any photo of a scratch or dent.
- For the invoice, use `public/samples/sample-invoice.png`. It is a clearly labelled sample from a fictional shop, and it includes a headlamp and brake pads that were not part of the scrape, so you can watch them get caught.

### Deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Nafis8709/scuff)

`render.yaml` describes a Node web service. Render asks for the secret environment variables (Braintree keys and `ANTHROPIC_API_KEY`) during deploy. Leave the PayPal ones empty when using Braintree.

## Project layout

```
src/lib/cases.ts      all business rules: who may do what, in which status
src/lib/ai.ts         AI calls (damage report, invoice check) via Gemini or Claude, plus practice-mode samples
src/lib/payments.ts   picks the provider: Braintree, PayPal REST, or simulated
src/lib/braintree.ts  Braintree: client token, authorize (vaulted), partial settle, void
src/lib/paypal.ts     PayPal REST: create order, authorize, capture, void, reauthorize
src/lib/agreement.ts  agreement template, SHA-256 fingerprint, legal notice per country
src/lib/db.ts         SQLite storage (one JSON document per case, photos in their own table)
src/app/api/...       thin route handlers
src/components/...    the case room and one component per step
```

Case statuses: `waiting → documenting → assessing → agreement → funding → repairing → reviewing → settled`, plus `stopped` (an injury was reported) and `closed`.

## Safety and limits

- Scuff is for small, property-only scrapes. Any reported injury stops the settlement, and the AI's safety flags recommend using insurers instead.
- Scuff does not tell anyone to hide an accident. Each case shows a notice for its country (for example, UK drivers must still tell their insurer).
- The repair estimate is advisory. The binding numbers are the cap that both drivers sign and the verified invoice lines.
- Only damage that was photographed at the scene can be paid for. Both drivers know this before they sign.

## License

MIT. See [LICENSE](LICENSE).
