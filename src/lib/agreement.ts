// The settlement agreement is a fixed template filled with case facts.
// We deliberately do NOT let the AI write the legal terms: only the neutral
// "what happened" summary inside it comes from Claude.

import crypto from "node:crypto";
import type { Party, SettlementCase } from "./types";
import { formatMoney } from "./money";

export function getPayer(c: SettlementCase): Party | null {
  for (const p of c.parties) {
    if (p.role === "payer") {
      return p;
    }
  }
  return null;
}

export function getReceiver(c: SettlementCase): Party | null {
  for (const p of c.parties) {
    if (p.role === "receiver") {
      return p;
    }
  }
  return null;
}

export function buildAgreementText(c: SettlementCase): string {
  const payer = getPayer(c);
  const receiver = getReceiver(c);
  if (!payer || !receiver || !c.report) {
    return "";
  }

  const date = new Date(c.createdAt).toUTCString();
  const damageLines: string[] = [];
  for (const zone of c.report.receiverDamage) {
    damageLines.push(`  - ${zone.zone} (${zone.severity}): ${zone.description}`);
  }

  return [
    `PRIVATE VEHICLE DAMAGE SETTLEMENT — Case ${c.code}`,
    ``,
    `Date of incident record: ${date}`,
    `Payer: ${payer.name}, vehicle ${payer.vehicle}, plate ${payer.plate}`,
    `Receiver: ${receiver.name}, vehicle ${receiver.vehicle}, plate ${receiver.plate}`,
    ``,
    `1. What happened (neutral summary of both drivers' statements):`,
    `   ${c.report.statementSummary}`,
    ``,
    `2. Damage documented at the scene on the Receiver's vehicle:`,
    ...damageLines,
    ``,
    `3. Both drivers confirmed that nobody was injured.`,
    ``,
    `4. The Payer agrees to pay for the repair of the damage listed in section 2,`,
    `   up to a maximum of ${formatMoney(c.capAmount, c.currency)} (the "Cap").`,
    ``,
    `5. The Payer places a PayPal authorization hold for the Cap. No money moves at this point.`,
    ``,
    `6. The Receiver uploads the repair invoice. Each invoice line is checked against the`,
    `   scene photos. Only lines that match the documented damage are approved.`,
    `   When the Receiver accepts the verified amount, that amount (never more than the Cap)`,
    `   is captured from the hold and paid to the Receiver, and the rest of the hold is released.`,
    ``,
    `7. Once the verified amount is paid, the Receiver releases the Payer from further claims`,
    `   for the vehicle damage listed in section 2. This release does NOT cover any injury,`,
    `   and does not cover damage that was not documented in this record.`,
    ``,
    `8. If no invoice is uploaded before the hold expires, the hold is released and the`,
    `   Receiver keeps any other legal rights they have.`,
    ``,
    `9. This record does not replace any duty either driver has to report the incident to`,
    `   the police or to their insurer under local law or their policy.`,
  ].join("\n");
}

export function hashText(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export function legalNotice(country: string): string {
  if (country === "GB") {
    return "UK: you must still exchange details and tell your insurer about any accident, even if you settle privately.";
  }
  if (country === "US") {
    return "US: rules vary by state. Report to police if required (injury or damage above your state's threshold). Your policy may require you to tell your insurer.";
  }
  if (country === "CA") {
    return "Canada: report to police if damage exceeds your province's threshold. Your insurer may still need to be told.";
  }
  return "Check your local law: some places require you to report every collision to police or your insurer, even when you settle privately.";
}
