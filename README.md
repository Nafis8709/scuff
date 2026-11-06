# Scuff: settle a minor car scrape fairly, before you drive away

Scuff is an entry for the **PayPal AI Hackathon 2026**. It is built with the **PayPal Orders and Payments APIs** (authorize, partial capture, void, reauthorize) and **Claude** (vision plus structured outputs).

## The problem

After a minor scrape with no injuries, many drivers skip insurance and agree to "sort it out between us". In one survey, 42% of Ontario drivers said they would consider a cash settlement after a collision. These handshake deals usually fail in one of two ways:

- **The payer disappears.** The usual advice is to never hand over cash at the scene, because there is no proof and no guarantee.
- **The bill grows.** A few days later the other driver sends a repair quote that includes things that were never damaged.

Neither driver trusts the other, so one of them usually ends up feeling cheated.

## What Scuff does

1. **At the scene.** One driver starts a case and shows a QR code; the other scans it, with no app to install.
   - Both drivers answer an injury question. If anyone is hurt, the settlement is stopped.
   - Both add photos and a short statement.
   - **Claude** reads every photo and both statements. It produces a structured damage report: damaged zones, severity, the photo IDs that show each zone, and a repair-cost range. It also gives a neutral summary of what happened and lists any points where the two statements disagree.
2. **Agree and hold.** Both drivers sign one plain-language agreement with a **cap**.
   - The paying driver places a **PayPal authorization hold** for the cap. The money is reserved, so nobody can vanish, but nothing is charged yet.
3. **Pay what the evidence supports.** After the repair, the receiver uploads the invoice.
   - **Claude** checks every invoice line against the scene photos and marks it *matches the scene*, *not documented* or *unclear*.
   - Our own code (not the model) adds up the matching lines and limits the total to the cap.
   - When the receiver accepts, **only that amount is captured** (`final_capture: true`) and paid straight to the receiver's PayPal account. The rest of the hold is released.

Both drivers end up with the same printable record: photos, the AI report, the signed agreement with its SHA-256 fingerprint, the invoice check, and the PayPal IDs.

## How PayPal is used

| Step | PayPal API |
|---|---|
| Place the hold | `POST /v2/checkout/orders` with `intent: AUTHORIZE`, and `payee.email_address` set to the receiver, so the money never passes through Scuff |
| Payer approves | PayPal JS SDK buttons (`intent=authorize`) |
| Reserve the funds | `POST /v2/checkout/orders/{id}/authorize`, which holds the funds for up to 29 days |
| Pay the verified amount | `POST /v2/payments/authorizations/{id}/capture` with a **partial amount** and `final_capture: true`, which releases the remainder |
| Nothing verified | `POST /v2/payments/authorizations/{id}/void` |
| Repair takes longer than 3 days | `POST /v2/payments/authorizations/{id}/reauthorize` |

All money-moving calls send a `PayPal-Request-Id`, so a double click or a retry never charges twice.

## How Claude is used

Both calls are in `src/lib/ai.ts`. They use **structured outputs** (`output_config.format` with a JSON schema), so every response is valid, typed JSON.

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

- `ANTHROPIC_API_KEY`: from the Claude Console.
- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`: from a PayPal **sandbox** app at developer.paypal.com → Apps & Credentials.
- For the receiver's PayPal email, use a sandbox *personal* account. Log in as a different sandbox personal account to approve the hold.

### Try both drivers on one screen

Open **`/demo`**. It creates a fresh case and shows both drivers' phones side by side: Alex is paying, Sam is being paid. Use any photo of a scratch or dent, and any photo or screenshot of a repair invoice.

### Deploy

`render.yaml` deploys the app to Render as a Node web service. Set the three secret environment variables in the Render dashboard.

## Project layout

```
src/lib/cases.ts      all business rules: who may do what, in which status
src/lib/ai.ts         Claude calls (damage report, invoice check) and practice-mode samples
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
