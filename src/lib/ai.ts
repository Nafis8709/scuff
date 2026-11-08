// All Claude calls live here.
// 1. assessDamage: reads the scene photos + both statements, returns a structured damage report.
// 2. checkInvoice: reads the repair invoice and checks every line against the scene evidence.
//
// We use Claude's structured outputs (output_config.format = json_schema) so the response
// is always valid JSON that matches our schema. Totals are computed by our own code,
// never by the model.

import Anthropic from "@anthropic-ai/sdk";
import type {
  DamageReport,
  DamageZone,
  InvoiceCheck,
  InvoiceLine,
  Party,
  Photo,
  SettlementCase,
} from "./types";
import { roundToCents } from "./money";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export function aiMode(): "claude" | "mock" {
  return process.env.ANTHROPIC_API_KEY ? "claude" : "mock";
}

function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// ---------- shared helpers ----------

type ContentBlock = Anthropic.Messages.ContentBlockParam;

function imageBlock(dataUrl: string): ContentBlock {
  // dataUrl looks like "data:image/jpeg;base64,AAAA..."
  const commaIndex = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, commaIndex);
  const data = dataUrl.slice(commaIndex + 1);
  let mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" = "image/jpeg";
  if (header.includes("image/png")) mediaType = "image/png";
  if (header.includes("image/webp")) mediaType = "image/webp";
  return { type: "image", source: { type: "base64", media_type: mediaType, data } };
}

function describeParty(p: Party): string {
  return `Driver ${p.id} (${p.name}, ${p.role === "payer" ? "the one paying" : "the one being paid"}), vehicle: ${p.vehicle || "not given"}, plate: ${p.plate || "not given"}`;
}

async function callClaudeForJson(
  system: string,
  content: ContentBlock[],
  schema: Record<string, unknown>
): Promise<unknown> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content }],
    output_config: { format: { type: "json_schema", schema } },
  });

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") {
      text += block.text;
    }
  }
  return JSON.parse(text);
}

// ---------- 1. damage assessment ----------

const zoneSchema = {
  type: "object",
  additionalProperties: false,
  required: ["zone", "severity", "description", "photo_ids"],
  properties: {
    zone: { type: "string", description: "Body area, e.g. 'rear bumper', 'left rear quarter panel'" },
    severity: { type: "string", enum: ["none", "cosmetic", "minor", "moderate", "severe"] },
    description: { type: "string", description: "What is visibly damaged, in one plain sentence" },
    photo_ids: { type: "array", items: { type: "string" }, description: "IDs of photos that show this damage" },
  },
};

const damageSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "receiver_damage",
    "payer_damage",
    "estimate_low",
    "estimate_high",
    "estimate_basis",
    "statement_summary",
    "statements_consistent",
    "statement_conflicts",
    "safety_flags",
    "recommend_insurance",
    "photo_quality_issues",
  ],
  properties: {
    summary: { type: "string" },
    receiver_damage: { type: "array", items: zoneSchema },
    payer_damage: { type: "array", items: zoneSchema },
    estimate_low: { type: "number" },
    estimate_high: { type: "number" },
    estimate_basis: { type: "string" },
    statement_summary: { type: "string" },
    statements_consistent: { type: "boolean" },
    statement_conflicts: { type: "array", items: { type: "string" } },
    safety_flags: { type: "array", items: { type: "string" } },
    recommend_insurance: { type: "boolean" },
    photo_quality_issues: { type: "array", items: { type: "string" } },
  },
};

const DAMAGE_SYSTEM = `You document minor vehicle collisions so two drivers can settle privately and fairly.
You are neutral: you never take sides and never decide legal fault.

Rules:
- Only report damage you can actually see in the photos. Cite the photo IDs for every damage zone.
- Do not guess about hidden damage. If something might hide damage (e.g. a cracked bumper may hide a broken mount), mention it in the zone description as "possible", keep severity based on what is visible.
- Estimate repair cost for the RECEIVER's vehicle only, as a realistic range at an independent body shop in the given country and currency. Explain the basis briefly (parts, paint, labour hours).
- Flag safety concerns that make a private settlement a bad idea: airbags deployed, fluid leaks, lights or wheels not working, structural or frame damage, the car not drivable. If any exist, set recommend_insurance to true.
- statement_summary: one short neutral paragraph that combines both drivers' statements. Use "Driver A" / "Driver B". Do not assign blame.
- statements_consistent: false if the drivers disagree on any material fact (who hit whom, speed, lane, signals). List each disagreement in statement_conflicts.
- photo_quality_issues: tell the drivers what extra photo would help (e.g. "no clear photo of the receiver's plate").
Keep every text field short and plain. These drivers are standing at the roadside.`;

export async function assessDamage(c: SettlementCase, photos: Photo[]): Promise<DamageReport> {
  if (aiMode() === "mock") {
    return mockDamageReport(c, photos);
  }

  const content: ContentBlock[] = [];
  content.push({
    type: "text",
    text: [
      `Country: ${c.country}. Currency: ${c.currency}.`,
      ...c.parties.map(describeParty),
      ``,
      `Statements:`,
      ...c.parties.map((p) => `Driver ${p.id}: "${p.statement || "(no statement)"}"`),
      ``,
      `Photos follow. Each photo is preceded by its ID and who took it.`,
    ].join("\n"),
  });

  // Keep the request reasonable: at most 12 photos.
  let count = 0;
  for (const photo of photos) {
    if (photo.kind === "invoice") continue;
    if (count >= 12) break;
    content.push({ type: "text", text: `Photo ${photo.id} — taken by Driver ${photo.party}, labelled "${photo.kind}"` });
    content.push(imageBlock(photo.dataUrl));
    count++;
  }

  const raw = (await callClaudeForJson(DAMAGE_SYSTEM, content, damageSchema)) as RawDamage;
  return toDamageReport(raw, false);
}

interface RawZone {
  zone: string;
  severity: DamageZone["severity"];
  description: string;
  photo_ids: string[];
}

interface RawDamage {
  summary: string;
  receiver_damage: RawZone[];
  payer_damage: RawZone[];
  estimate_low: number;
  estimate_high: number;
  estimate_basis: string;
  statement_summary: string;
  statements_consistent: boolean;
  statement_conflicts: string[];
  safety_flags: string[];
  recommend_insurance: boolean;
  photo_quality_issues: string[];
}

function toZones(raw: RawZone[]): DamageZone[] {
  const zones: DamageZone[] = [];
  for (const z of raw) {
    zones.push({ zone: z.zone, severity: z.severity, description: z.description, photoIds: z.photo_ids });
  }
  return zones;
}

function toDamageReport(raw: RawDamage, mock: boolean): DamageReport {
  let low = roundToCents(Math.max(0, raw.estimate_low));
  let high = roundToCents(Math.max(0, raw.estimate_high));
  if (high < low) {
    const swap = low;
    low = high;
    high = swap;
  }
  return {
    summary: raw.summary,
    receiverDamage: toZones(raw.receiver_damage),
    payerDamage: toZones(raw.payer_damage),
    estimateLow: low,
    estimateHigh: high,
    estimateBasis: raw.estimate_basis,
    statementSummary: raw.statement_summary,
    statementsConsistent: raw.statements_consistent,
    statementConflicts: raw.statement_conflicts,
    safetyFlags: raw.safety_flags,
    recommendInsurance: raw.recommend_insurance,
    photoQualityIssues: raw.photo_quality_issues,
    generatedAt: new Date().toISOString(),
    mock,
  };
}

// ---------- 2. invoice check ----------

const invoiceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["shop_name", "invoice_date", "invoice_total", "lines", "notes"],
  properties: {
    shop_name: { type: "string" },
    invoice_date: { type: "string" },
    invoice_total: { type: "number", description: "Grand total printed on the invoice" },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "amount", "verdict", "reason", "matched_zone"],
        properties: {
          description: { type: "string" },
          amount: { type: "number", description: "Line amount including its share of tax if tax is shown per line" },
          verdict: { type: "string", enum: ["supported", "not_supported", "unclear"] },
          reason: { type: "string", description: "One short sentence a driver can understand" },
          matched_zone: { type: "string", description: "Damage zone from the report this line repairs, or empty string" },
        },
      },
    },
    notes: { type: "string" },
  },
};

const INVOICE_SYSTEM = `You check a car repair invoice against evidence recorded at the scene of a minor collision.
You protect both drivers: the receiver should be paid for real repairs, the payer should not pay for damage that was not caused by this collision.

For every invoice line decide:
- "supported": the work clearly repairs damage documented in the scene report/photos (including normal related items: paint and materials, labour, clips, disposal, tax on supported items).
- "not_supported": the work is on a part or area with no documented damage, looks like maintenance or an upgrade, or is clearly unrelated.
- "unclear": you cannot tell from the evidence (e.g. a vague "misc parts" line).
Be fair and specific. Quote the zone name from the report in matched_zone when it fits.
If tax is a separate line, judge it as supported and set its amount to only the tax on the supported lines when you can work it out; explain in notes.
Read amounts exactly as printed. Do not invent lines.`;

export async function checkInvoice(
  c: SettlementCase,
  invoicePhoto: Photo,
  scenePhotos: Photo[]
): Promise<InvoiceCheck> {
  if (aiMode() === "mock") {
    return mockInvoiceCheck(c);
  }
  const report = c.report;
  if (!report) {
    throw new Error("Damage report missing");
  }

  const content: ContentBlock[] = [];
  content.push({
    type: "text",
    text: [
      `Currency: ${c.currency}. Agreed cap: ${c.capAmount}.`,
      `Damage documented on the receiver's vehicle at the scene:`,
      ...report.receiverDamage.map((z) => `- ${z.zone} (${z.severity}): ${z.description}`),
      `Damage on the payer's own vehicle (NOT covered): ${report.payerDamage.map((z) => z.zone).join(", ") || "none"}`,
      ``,
      `Scene photos of the receiver's side follow, then the invoice.`,
    ].join("\n"),
  });

  let count = 0;
  for (const photo of scenePhotos) {
    if (count >= 8) break;
    content.push({ type: "text", text: `Scene photo ${photo.id} (Driver ${photo.party}, ${photo.kind})` });
    content.push(imageBlock(photo.dataUrl));
    count++;
  }
  content.push({ type: "text", text: "REPAIR INVOICE:" });
  content.push(imageBlock(invoicePhoto.dataUrl));

  const raw = (await callClaudeForJson(INVOICE_SYSTEM, content, invoiceSchema)) as RawInvoice;
  return toInvoiceCheck(raw, c.capAmount, false);
}

interface RawInvoice {
  shop_name: string;
  invoice_date: string;
  invoice_total: number;
  lines: {
    description: string;
    amount: number;
    verdict: InvoiceLine["verdict"];
    reason: string;
    matched_zone: string;
  }[];
  notes: string;
}

// Our own deterministic math (never the model's): add up the supported lines.
export function totalSupported(lines: InvoiceLine[]): number {
  let total = 0;
  for (const line of lines) {
    if (line.verdict === "supported") {
      total += line.amount;
    }
  }
  return roundToCents(total);
}

// What will actually be paid: supported lines + lines the payer chose to approve, never more than the cap.
export function approvedAmount(lines: InvoiceLine[], cap: number): number {
  let total = 0;
  for (const line of lines) {
    if (line.verdict === "supported" || line.payerApproved) {
      total += line.amount;
    }
  }
  return Math.min(roundToCents(total), cap);
}

function toInvoiceCheck(raw: RawInvoice, cap: number, mock: boolean): InvoiceCheck {
  const lines: InvoiceLine[] = [];
  for (const l of raw.lines) {
    lines.push({
      description: l.description,
      amount: roundToCents(Math.max(0, l.amount)),
      verdict: l.verdict,
      reason: l.reason,
      matchedZone: l.matched_zone,
      payerApproved: false,
    });
  }
  const supported = totalSupported(lines);
  return {
    shopName: raw.shop_name,
    invoiceDate: raw.invoice_date,
    lines,
    invoiceTotal: roundToCents(raw.invoice_total),
    supportedTotal: supported,
    approvedAmount: approvedAmount(lines, cap),
    notes: raw.notes,
    generatedAt: new Date().toISOString(),
    mock,
  };
}

// ---------- mock mode (no API key) ----------
// Lets the full flow be clicked through locally. Results are clearly labelled as mock in the UI.

function mockDamageReport(c: SettlementCase, photos: Photo[]): DamageReport {
  const ids: string[] = [];
  for (const p of photos) {
    if (p.kind !== "invoice") ids.push(p.id);
  }
  const raw: RawDamage = {
    summary: "Low-speed rear impact. Scuffs and a dent on the receiver's rear bumper.",
    receiver_damage: [
      { zone: "rear bumper", severity: "minor", description: "Paint scuffs and a shallow dent on the left side.", photo_ids: ids.slice(0, 2) },
    ],
    payer_damage: [
      { zone: "front bumper", severity: "cosmetic", description: "Light paint transfer.", photo_ids: ids.slice(2, 3) },
    ],
    estimate_low: 280,
    estimate_high: 520,
    estimate_basis: "Bumper repair and refinish, about 3–5 labour hours plus paint materials.",
    statement_summary: "Driver B was stopped in traffic. Driver A moved forward and touched Driver B's rear bumper at low speed.",
    statements_consistent: true,
    statement_conflicts: [],
    safety_flags: [],
    recommend_insurance: false,
    photo_quality_issues: c.parties.length < 2 ? ["Second driver has not added photos yet."] : [],
  };
  return toDamageReport(raw, true);
}

function mockInvoiceCheck(c: SettlementCase): InvoiceCheck {
  const raw: RawInvoice = {
    shop_name: "Demo Body Shop",
    invoice_date: new Date().toISOString().slice(0, 10),
    invoice_total: 612,
    lines: [
      { description: "Rear bumper repair and refinish", amount: 310, verdict: "supported", reason: "Matches the dent and scuffs on the rear bumper.", matched_zone: "rear bumper" },
      { description: "Paint materials", amount: 62, verdict: "supported", reason: "Needed to refinish the rear bumper.", matched_zone: "rear bumper" },
      { description: "Left headlamp assembly", amount: 210, verdict: "not_supported", reason: "No headlamp damage was photographed at the scene.", matched_zone: "" },
      { description: "Shop supplies", amount: 30, verdict: "unclear", reason: "Not itemised, cannot link to the documented damage.", matched_zone: "" },
    ],
    notes: "Mock result: add an ANTHROPIC_API_KEY to check real invoices.",
  };
  return toInvoiceCheck(raw, c.capAmount, true);
}
