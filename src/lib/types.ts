// Shared types for a Scuff settlement case.
// A case is stored as one JSON document (photos are stored separately because they are large).

export type PartyId = "A" | "B";

// "payer" = the driver who agreed to pay for the damage.
// "receiver" = the driver whose car gets repaired.
export type Role = "payer" | "receiver";

export type CaseStatus =
  | "waiting" // only the first driver has joined
  | "documenting" // both drivers are adding details, photos and statements
  | "stopped" // someone reported an injury: private settlement is not allowed
  | "assessing" // Claude is analysing the photos
  | "agreement" // drivers review the AI report, set the cap and sign
  | "funding" // both signed, payer needs to place the PayPal hold
  | "repairing" // money is on hold, waiting for the repair invoice
  | "reviewing" // invoice uploaded, AI check done, waiting for receiver to accept
  | "settled" // verified amount captured, rest released
  | "closed" // no charge (verified amount was 0) or cancelled
  ;

export interface Party {
  id: PartyId;
  token: string; // secret that identifies this driver's device
  name: string;
  role: Role;
  plate: string;
  vehicle: string; // e.g. "Silver Toyota Corolla 2019"
  paypalEmail: string; // only needed for the receiver
  injured: boolean | null; // null = not answered yet
  statement: string; // what happened, in the driver's own words
  ready: boolean; // finished documenting
  signature: Signature | null;
  joinedAt: string;
}

export interface Signature {
  typedName: string;
  agreementHash: string; // sha256 of the exact agreement text that was signed
  signedAt: string;
}

export type Severity = "none" | "cosmetic" | "minor" | "moderate" | "severe";

export interface DamageZone {
  zone: string; // e.g. "rear bumper"
  severity: Severity;
  description: string;
  photoIds: string[];
}

export interface DamageReport {
  summary: string;
  receiverDamage: DamageZone[]; // damage that the payer will pay for
  payerDamage: DamageZone[]; // recorded for completeness, not paid by this settlement
  estimateLow: number;
  estimateHigh: number;
  estimateBasis: string;
  statementSummary: string; // neutral account built from both statements
  statementsConsistent: boolean;
  statementConflicts: string[];
  safetyFlags: string[]; // e.g. "airbag deployed" — reasons to use insurance instead
  recommendInsurance: boolean;
  photoQualityIssues: string[];
  generatedAt: string;
  mock: boolean; // true when produced without a real Claude call (no API key)
}

export type LineVerdict = "supported" | "not_supported" | "unclear";

export interface InvoiceLine {
  description: string;
  amount: number;
  verdict: LineVerdict;
  reason: string;
  matchedZone: string; // the damage zone this line relates to, or ""
}

export interface InvoiceCheck {
  shopName: string;
  invoiceDate: string;
  lines: InvoiceLine[];
  invoiceTotal: number; // total printed on the invoice
  supportedTotal: number; // sum of supported lines, computed by our code (not by the AI)
  approvedAmount: number; // supportedTotal limited to the agreed cap
  notes: string;
  generatedAt: string;
  mock: boolean;
}

export interface PaymentState {
  mode: "sandbox" | "mock";
  orderId: string;
  authorizationId: string;
  authorizedAmount: number;
  authorizedAt: string;
  expiresAt: string; // PayPal authorizations last up to 29 days
  captureId: string;
  capturedAmount: number;
  capturedAt: string;
  released: boolean; // remaining hold released (final capture or void)
}

export interface CaseEvent {
  at: string;
  by: PartyId | "system";
  text: string;
}

export interface SettlementCase {
  id: string;
  code: string; // short code used in the join link / QR
  createdAt: string;
  updatedAt: string;
  status: CaseStatus;
  country: string; // used for the legal notice
  currency: string;
  parties: Party[];
  report: DamageReport | null;
  capAmount: number; // maximum the payer agrees to pay
  agreementText: string;
  agreementHash: string;
  payment: PaymentState | null;
  invoicePhotoId: string;
  invoiceCheck: InvoiceCheck | null;
  stopReason: string;
  events: CaseEvent[];
}

export interface Photo {
  id: string;
  caseId: string;
  party: PartyId;
  kind: "damage" | "plate" | "scene" | "invoice";
  dataUrl: string; // JPEG data URL, already resized in the browser
  createdAt: string;
}

// What a driver's browser receives: the other driver's token is removed.
export interface CaseView {
  case: SettlementCase;
  me: PartyId;
  photos: Omit<Photo, "dataUrl">[];
  paypalClientId: string;
  aiMode: "claude" | "mock";
}
