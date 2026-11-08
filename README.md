# Scuff: settle a minor car scrape fairly, before you drive away

Scuff is an entry for the **PayPal AI Hackathon 2026**. It is built with **Braintree** (a PayPal service: authorize, partial settlement, void, vaulted re-authorization), an alternative **PayPal Orders and Payments API** integration, and a vision model with structured outputs: **Gemini** (free tier) or **Claude**.

| | |
|---|---|
| **Live app** | https://scuff-ajvb.onrender.com |
| **Two-driver demo** (both phones on one screen) | https://scuff-ajvb.onrender.com/demo |
| **Sample repair invoice** (fictional shop) | [sample-invoice.png](https://scuff-ajvb.onrender.com/samples/sample-invoice.png) |
| **Braintree sandbox test card** | `4111 1111 1111 1111`, any future expiry date, any CVV |

The live app runs on Render's free plan. The first visit after a quiet period can take about 50 seconds while the server wakes up.

## Try it in 2 minutes (for judges)

1. Open the **[two-driver demo](https://scuff-ajvb.onrender.com/demo)**. It creates a fresh case with Alex (paying) on the left and Sam (being paid) on the right.
2. On **each** phone:
   - answer *Nobody is hurt*;
   - add a plate and a car, plus a PayPal email for Sam (any address works in the sandbox);
   - add two photos of any scratch or dent and a one-line statement;
   - press *I'm done documenting*.
3. Read the AI damage report. Both drivers sign by typing their name.
4. On Alex's phone, enter the **test card** and press *Hold*. Nothing is charged yet.
5. On Sam's phone, upload the **[sample invoice](https://scuff-ajvb.onrender.com/samples/sample-invoice.png)**. Watch the headlamp and brake pads get rejected, and the tax get recalculated.
6. Optional: on Alex's phone, approve a rejected line.
7. On Sam's phone, press *Accept*. Only the verified amount is charged from the hold, and the rest is released. Open the receipt.

## Verified with live services

These checks ran on the deployed app (Gemini free tier and Braintree sandbox) on Nov 9, 2026:

| Step | Result |
|---|---|
| Damage report from real collision photos | 14 s. It cited photo IDs per zone and spotted that the photos did not match the cars described. Because the crash photos showed possible structural damage, it recommended insurers instead |
| Braintree hold | Authorization `$3,500` on a sandbox Visa, valid for 7 days |
| Invoice check of the sample invoice | 11 s. Bumper, labour, paint and supplies supported; headlamp and brake pads rejected |
| Charge | `$532.12` charged (items $502 plus prorated tax $30.12). The rest of the $3,500 hold was released |

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

The AI never writes the legal terms of the agreement, and never decides how much is paid:
- The agreement is a fixed template (`src/lib/agreement.ts`).
- The amount is deterministic math over the AI's line verdicts (`src/lib/invoice-math.ts`).
- Tax lines are shared out in proportion to the approved lines, because a live test showed a model returning the full printed tax for a partly-approved invoice.

On the free tier Gemini sometimes answers "high demand". The app then tries a chain of models (`GEMINI_MODEL`, comma-separated) with a timeout on each.

## Run it locally

Requirements: Node 20 or newer.

```bash
git clone https://github.com/Nafis8709/scuff.git
cd scuff
npm install
cp .env.example .env.local   # optional: add your keys (see below)
npm run dev                  # development server on http://localhost:3000
```

Production build:

```bash
npm run build
npm start                    # http://localhost:3000
```

Checks:

```bash
npm run lint
npm run typecheck
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

`render.yaml` describes a Node web service (build `npm ci && npm run build`, start `npm start`). During deploy Render asks for the secret environment variables:
- the three Braintree keys;
- `GEMINI_API_KEY` or `ANTHROPIC_API_KEY`.

Leave the PayPal keys empty when using Braintree.

## Project layout

```
src/lib/cases.ts      all business rules: who may do what, in which status
src/lib/ai.ts         AI calls (damage report, invoice check) via Gemini or Claude, plus practice-mode samples
src/lib/invoice-math.ts  the money math: supported + payer-approved lines, prorated tax, cap
src/lib/payments.ts   picks the provider: Braintree, PayPal REST, or simulated
src/lib/braintree.ts  Braintree: client token, authorize (vaulted), partial settle, void
src/lib/paypal.ts     PayPal REST: create order, authorize, capture, void, reauthorize
src/lib/agreement.ts  agreement template, SHA-256 fingerprint, legal notice per country
src/lib/db.ts         SQLite storage (one JSON document per case, photos in their own table)
src/app/api/...       thin route handlers
src/components/...    the case room and one component per step
```

Case statuses: `waiting → documenting → assessing → agreement → funding → repairing → reviewing → settled`, plus `stopped` (an injury was reported) and `closed`.

## Tech stack

- Next.js 15 (App Router), TypeScript and Tailwind CSS 4
- SQLite via `better-sqlite3`
- Braintree Node SDK and Drop-in UI; PayPal REST and the JS SDK
- Gemini API (REST) or Claude via `@anthropic-ai/sdk`
- Hosted on Render

## Safety and limits

- Scuff is for small, property-only scrapes. Any reported injury stops the settlement, and the AI's safety flags recommend using insurers instead.
- Scuff does not tell anyone to hide an accident. Each case shows a notice for its country (for example, UK drivers must still tell their insurer).
- The repair estimate is advisory. The binding numbers are the cap that both drivers sign and the verified invoice lines.
- Only damage that was photographed at the scene can be paid for. Both drivers know this before they sign.

## License

MIT. See [LICENSE](LICENSE).
