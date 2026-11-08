// All business rules for a settlement case.
// Every action checks (1) who is asking and (2) whether the case is in the right status.
// Route handlers stay thin and call these functions.

import { customAlphabet } from "nanoid";
import * as db from "./db";
import * as ai from "./ai";
import * as paypal from "./paypal";
import * as payments from "./payments";
import { buildAgreementText, getPayer, getReceiver, hashText } from "./agreement";
import { roundToCents } from "./money";
import type { CaseView, Party, PartyId, Photo, Role, SettlementCase } from "./types";

// Codes avoid look-alike characters (0/O, 1/I) because people may type them.
const makeCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
const makeId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 16);

export class ActionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function now(): string {
  return new Date().toISOString();
}

function addEvent(c: SettlementCase, by: PartyId | "system", text: string): void {
  c.events.push({ at: now(), by, text });
}

function newParty(id: PartyId, name: string, role: Role): Party {
  return {
    id,
    token: makeId() + makeId(),
    name: name.trim(),
    role,
    plate: "",
    vehicle: "",
    paypalEmail: "",
    injured: null,
    statement: "",
    ready: false,
    signature: null,
    joinedAt: now(),
  };
}

// ---------- loading and permissions ----------

export function loadCase(caseId: string): SettlementCase {
  const c = db.findCaseById(caseId);
  if (!c) {
    throw new ActionError("Case not found", 404);
  }
  return c;
}

export function partyForToken(c: SettlementCase, token: string): Party {
  for (const p of c.parties) {
    if (p.token === token) {
      return p;
    }
  }
  throw new ActionError("You are not part of this case", 403);
}

function requireStatus(c: SettlementCase, allowed: SettlementCase["status"][]): void {
  if (!allowed.includes(c.status)) {
    throw new ActionError(`This step is not available right now (case is "${c.status}")`, 409);
  }
}

function requireRole(p: Party, role: Role): void {
  if (p.role !== role) {
    throw new ActionError(`Only the ${role} can do this`, 403);
  }
}

export function buildView(c: SettlementCase, me: Party): CaseView {
  // Never send the other driver's token to this browser.
  const copy = JSON.parse(JSON.stringify(c)) as SettlementCase;
  for (const p of copy.parties) {
    if (p.id !== me.id) {
      p.token = "";
    }
  }
  const photos = [];
  for (const photo of db.listPhotos(c.id)) {
    photos.push({ id: photo.id, caseId: photo.caseId, party: photo.party, kind: photo.kind, createdAt: photo.createdAt });
  }
  return {
    case: copy,
    me: me.id,
    photos,
    paymentProvider: payments.activeProvider(),
    paypalClientId: payments.activeProvider() === "paypal" ? paypal.paypalClientId() : "",
    aiMode: ai.aiMode(),
  };
}

// ---------- create and join ----------

export function createCase(input: { name: string; role: Role; country: string; currency: string }): {
  caseId: string;
  token: string;
} {
  if (!input.name.trim()) {
    throw new ActionError("Please enter your name");
  }
  const first = newParty("A", input.name, input.role);
  const c: SettlementCase = {
    id: makeId(),
    code: makeCode(),
    createdAt: now(),
    updatedAt: now(),
    status: "waiting",
    country: input.country || "US",
    currency: input.currency || "USD",
    parties: [first],
    report: null,
    capAmount: 0,
    agreementText: "",
    agreementHash: "",
    payment: null,
    invoicePhotoId: "",
    invoiceCheck: null,
    stopReason: "",
    events: [],
  };
  addEvent(c, "A", `${first.name} started the case as the ${first.role}.`);
  db.insertCase(c);
  return { caseId: c.id, token: first.token };
}

export function joinCase(code: string, name: string): { caseId: string; token: string } {
  const c = db.findCaseByCode(code);
  if (!c) {
    throw new ActionError("No case with that code", 404);
  }
  if (c.parties.length >= 2) {
    throw new ActionError("Both drivers have already joined this case", 409);
  }
  if (!name.trim()) {
    throw new ActionError("Please enter your name");
  }
  const otherRole: Role = c.parties[0].role === "payer" ? "receiver" : "payer";
  const second = newParty("B", name, otherRole);
  c.parties.push(second);
  c.status = "documenting";
  addEvent(c, "B", `${second.name} joined as the ${second.role}.`);
  db.saveCase(c);
  return { caseId: c.id, token: second.token };
}

// ---------- documenting ----------

export function updateDetails(
  c: SettlementCase,
  me: Party,
  input: { name?: string; plate?: string; vehicle?: string; paypalEmail?: string }
): void {
  requireStatus(c, ["waiting", "documenting"]);
  if (input.name !== undefined && input.name.trim()) me.name = input.name.trim();
  if (input.plate !== undefined) me.plate = input.plate.trim().toUpperCase();
  if (input.vehicle !== undefined) me.vehicle = input.vehicle.trim();
  if (input.paypalEmail !== undefined) me.paypalEmail = input.paypalEmail.trim();
  me.ready = false;
}

export function answerInjury(c: SettlementCase, me: Party, injured: boolean): void {
  requireStatus(c, ["waiting", "documenting"]);
  me.injured = injured;
  if (injured) {
    c.status = "stopped";
    c.stopReason =
      "Someone reported an injury. Injuries can appear hours later and are not covered by a private settlement. Call emergency services if needed, and report this collision to the police and your insurers.";
    addEvent(c, me.id, `${me.name} reported an injury. Private settlement stopped.`);
  } else {
    addEvent(c, me.id, `${me.name} confirmed no injuries.`);
  }
}

export function setStatement(c: SettlementCase, me: Party, statement: string): void {
  requireStatus(c, ["waiting", "documenting"]);
  me.statement = statement.trim().slice(0, 1500);
  me.ready = false;
}

export function addPhoto(c: SettlementCase, me: Party, kind: Photo["kind"], dataUrl: string): Photo {
  if (!dataUrl.startsWith("data:image/")) {
    throw new ActionError("That file is not an image");
  }
  if (dataUrl.length > 4_000_000) {
    throw new ActionError("Image is too large");
  }
  if (kind === "invoice") {
    throw new ActionError("Use the invoice upload step for invoices");
  }
  requireStatus(c, ["waiting", "documenting"]);
  const photo: Photo = { id: "p_" + makeId().slice(0, 8), caseId: c.id, party: me.id, kind, dataUrl, createdAt: now() };
  db.insertPhoto(photo);
  me.ready = false;
  return photo;
}

export function removePhoto(c: SettlementCase, me: Party, photoId: string): void {
  requireStatus(c, ["waiting", "documenting"]);
  const photo = db.findPhoto(c.id, photoId);
  if (!photo || photo.party !== me.id) {
    throw new ActionError("You can only remove your own photos", 403);
  }
  db.deletePhoto(c.id, photoId);
  me.ready = false;
}

// Returns the list of things this driver still has to do before marking ready.
export function missingItems(c: SettlementCase, me: Party): string[] {
  const missing: string[] = [];
  if (me.injured === null) missing.push("Answer the injury question");
  if (!me.plate) missing.push("Your plate number");
  if (!me.vehicle) missing.push("Your vehicle (make, model, colour)");
  if (me.role === "receiver" && !me.paypalEmail.includes("@")) missing.push("Your PayPal email (to receive the payment)");
  if (!me.statement) missing.push("A short statement of what happened");
  let myPhotos = 0;
  for (const p of db.listPhotos(c.id)) {
    if (p.party === me.id) myPhotos++;
  }
  if (myPhotos < 2) missing.push("At least 2 photos (damage close-up and your plate)");
  return missing;
}

// Marks this driver as ready. When both are ready, Claude assesses the damage.
export async function markReady(c: SettlementCase, me: Party): Promise<void> {
  requireStatus(c, ["documenting"]);
  const missing = missingItems(c, me);
  if (missing.length > 0) {
    throw new ActionError("Still missing: " + missing.join(", "));
  }
  me.ready = true;
  addEvent(c, me.id, `${me.name} finished documenting.`);

  const everyoneReady = c.parties.length === 2 && c.parties[0].ready && c.parties[1].ready;
  if (everyoneReady) {
    c.status = "assessing";
    db.saveCase(c);
    await runAssessment(c);
  }
}

// Running assessments, so a double click does not start two Claude calls.
const assessmentsInProgress = new Set<string>();

export async function runAssessment(c: SettlementCase): Promise<void> {
  requireStatus(c, ["assessing"]);
  if (assessmentsInProgress.has(c.id)) {
    // Throwing (instead of returning) stops the caller from saving a stale copy of the case.
    throw new ActionError("The analysis is already running. Please wait a moment.", 409);
  }
  assessmentsInProgress.add(c.id);
  try {
    const report = await ai.assessDamage(c, db.listPhotos(c.id));
    c.report = report;
    c.capAmount = suggestCap(report.estimateHigh);
    c.status = "agreement";
    rebuildAgreement(c);
    addEvent(c, "system", `Damage report ready. Estimated repair ${report.estimateLow}–${report.estimateHigh} ${c.currency}.`);
  } catch (error) {
    // Stay in "assessing" so either driver can press "Try again".
    addEvent(c, "system", `Damage analysis failed: ${(error as Error).message.slice(0, 200)}`);
  } finally {
    assessmentsInProgress.delete(c.id);
    db.saveCase(c);
  }
}

// Suggest the top of the estimate, rounded up to the next 10.
function suggestCap(estimateHigh: number): number {
  if (estimateHigh <= 0) return 0;
  return Math.ceil(estimateHigh / 10) * 10;
}

// Go back to documenting (e.g. the report asked for a better photo).
export function reopenDocumenting(c: SettlementCase, me: Party): void {
  requireStatus(c, ["agreement", "assessing"]);
  c.status = "documenting";
  c.report = null;
  c.agreementText = "";
  c.agreementHash = "";
  for (const p of c.parties) {
    p.ready = false;
    p.signature = null;
  }
  addEvent(c, me.id, `${me.name} reopened documenting to add more evidence.`);
}

// ---------- agreement ----------

function rebuildAgreement(c: SettlementCase): void {
  c.agreementText = buildAgreementText(c);
  c.agreementHash = hashText(c.agreementText);
  // Any change to the text invalidates earlier signatures.
  for (const p of c.parties) {
    p.signature = null;
  }
}

export function setCap(c: SettlementCase, me: Party, amount: number): void {
  requireStatus(c, ["agreement"]);
  requireRole(me, "payer");
  const rounded = roundToCents(amount);
  if (!(rounded > 0) || rounded > 10000) {
    throw new ActionError("Cap must be between 1 and 10,000");
  }
  c.capAmount = rounded;
  rebuildAgreement(c);
  addEvent(c, me.id, `${me.name} set the cap to ${rounded} ${c.currency}. Signatures reset.`);
}

export function sign(c: SettlementCase, me: Party, typedName: string, agreementHash: string): void {
  requireStatus(c, ["agreement"]);
  if (agreementHash !== c.agreementHash) {
    throw new ActionError("The agreement changed while you were reading it. Please review it again.", 409);
  }
  if (typedName.trim().toLowerCase() !== me.name.trim().toLowerCase()) {
    throw new ActionError(`Type your name exactly as "${me.name}" to sign`);
  }
  if (c.capAmount <= 0) {
    throw new ActionError("The payer must set a cap first");
  }
  me.signature = { typedName: typedName.trim(), agreementHash, signedAt: now() };
  addEvent(c, me.id, `${me.name} signed the agreement.`);

  if (c.parties.every((p) => p.signature !== null)) {
    c.status = "funding";
    addEvent(c, "system", "Both drivers signed. Waiting for the payer to place the hold.");
  }
}

// ---------- the hold (Braintree, PayPal Orders, or simulated) ----------

const PROVIDER_NAME = { braintree: "Braintree", paypal: "PayPal", mock: "simulated" };

// Braintree: the browser needs a client token to show the card / PayPal form.
export async function paymentClientToken(c: SettlementCase, me: Party): Promise<string> {
  requireStatus(c, ["funding"]);
  requireRole(me, "payer");
  return payments.clientToken();
}

// PayPal Orders: an order must exist before the buyer approves it.
export async function startHold(c: SettlementCase, me: Party): Promise<string> {
  requireStatus(c, ["funding"]);
  requireRole(me, "payer");
  const receiver = getReceiver(c);
  const orderId = await payments.createPayPalOrder({
    caseId: c.id,
    caseCode: c.code,
    amount: c.capAmount,
    currency: c.currency,
    receiverEmail: receiver ? receiver.paypalEmail : "",
  });
  addEvent(c, me.id, `PayPal order ${orderId} created for the hold.`);
  return orderId;
}

export async function confirmHold(c: SettlementCase, me: Party, input: { nonce: string; orderId: string }): Promise<void> {
  requireStatus(c, ["funding"]);
  requireRole(me, "payer");
  let hold: payments.Hold;
  try {
    hold = await payments.placeHold({
      amount: c.capAmount,
      currency: c.currency,
      caseCode: c.code,
      nonce: input.nonce,
      orderId: input.orderId,
    });
  } catch (error) {
    throw new ActionError((error as Error).message, 402);
  }
  c.payment = {
    provider: hold.provider,
    orderId: hold.orderId,
    authorizationId: hold.authorizationId,
    paymentMethodToken: hold.paymentMethodToken,
    description: hold.description,
    authorizedAmount: hold.amount,
    authorizedAt: now(),
    expiresAt: hold.expiresAt,
    captureId: "",
    capturedAmount: 0,
    capturedAt: "",
    released: false,
  };
  c.status = "repairing";
  addEvent(
    c,
    me.id,
    `${me.name} placed a ${PROVIDER_NAME[hold.provider]} hold of ${hold.amount} ${c.currency} on ${hold.description} (authorization ${hold.authorizationId}). Nothing has been charged.`
  );
}

export async function extendHold(c: SettlementCase, me: Party): Promise<void> {
  requireStatus(c, ["repairing", "reviewing"]);
  if (!c.payment) throw new ActionError("No hold to extend");
  const renewed = await payments.renewHold({
    provider: c.payment.provider,
    authorizationId: c.payment.authorizationId,
    paymentMethodToken: c.payment.paymentMethodToken,
    amount: c.payment.authorizedAmount,
    currency: c.currency,
    caseCode: c.code,
  });
  c.payment.authorizationId = renewed.authorizationId;
  c.payment.expiresAt = renewed.expiresAt;
  addEvent(c, me.id, `Hold renewed (${renewed.authorizationId}), now valid until ${renewed.expiresAt.slice(0, 10)}.`);
}

// ---------- invoice and settlement ----------

export async function submitInvoice(c: SettlementCase, me: Party, dataUrl: string): Promise<void> {
  requireStatus(c, ["repairing"]);
  requireRole(me, "receiver");
  if (!dataUrl.startsWith("data:image/")) {
    throw new ActionError("Please upload a photo or screenshot of the invoice");
  }
  const invoice: Photo = { id: "inv_" + makeId().slice(0, 8), caseId: c.id, party: me.id, kind: "invoice", dataUrl, createdAt: now() };
  db.insertPhoto(invoice);
  c.invoicePhotoId = invoice.id;
  addEvent(c, me.id, `${me.name} uploaded the repair invoice.`);

  // Only the receiver's car matters for the invoice, but the payer's photos may show it too.
  const scenePhotos: Photo[] = [];
  for (const p of db.listPhotos(c.id)) {
    if (p.kind !== "invoice") scenePhotos.push(p);
  }
  const check = await ai.checkInvoice(c, invoice, scenePhotos);
  c.invoiceCheck = check;
  c.status = "reviewing";
  addEvent(c, "system", `Invoice checked: ${check.supportedTotal} of ${check.invoiceTotal} ${c.currency} matches the scene evidence.`);
}

// The AI advises, people decide: the payer can choose to pay a line the AI did not support.
export function setLineApproval(c: SettlementCase, me: Party, lineIndex: number, approved: boolean): void {
  requireStatus(c, ["reviewing"]);
  requireRole(me, "payer");
  const check = c.invoiceCheck;
  if (!check || !c.payment) throw new ActionError("No invoice to review");
  const line = check.lines[lineIndex];
  if (!line) throw new ActionError("No such invoice line");
  if (line.isTax) throw new ActionError("Tax is shared out automatically over the approved lines");
  if (line.verdict === "supported") throw new ActionError("This line is already included");
  line.payerApproved = approved;
  check.approvedAmount = ai.approvedAmount(check.lines, Math.min(c.capAmount, c.payment.authorizedAmount));
  addEvent(
    c,
    me.id,
    `${me.name} ${approved ? "agreed to pay" : "withdrew approval for"} "${line.description}" (${line.amount} ${c.currency}). Amount to be paid is now ${check.approvedAmount} ${c.currency}.`
  );
}

export function rejectInvoiceCheck(c: SettlementCase, me: Party): void {
  requireStatus(c, ["reviewing"]);
  requireRole(me, "receiver");
  c.status = "repairing";
  c.invoiceCheck = null;
  c.invoicePhotoId = "";
  addEvent(c, me.id, `${me.name} will upload a clearer or itemised invoice.`);
}

export async function acceptAndSettle(c: SettlementCase, me: Party): Promise<void> {
  requireStatus(c, ["reviewing"]);
  requireRole(me, "receiver");
  if (!c.payment || !c.invoiceCheck) throw new ActionError("Nothing to settle");

  const amount = Math.min(c.invoiceCheck.approvedAmount, c.payment.authorizedAmount);
  if (amount <= 0) {
    await payments.releaseHold(c.payment.provider, c.payment.authorizationId);
    c.payment.released = true;
    c.status = "closed";
    addEvent(c, "system", "Verified amount was 0. The whole hold was released.");
    return;
  }

  let captureId = "";
  try {
    captureId = await payments.captureVerified({
      provider: c.payment.provider,
      authorizationId: c.payment.authorizationId,
      amount,
      currency: c.currency,
      caseCode: c.code,
    });
  } catch (error) {
    throw new ActionError((error as Error).message, 402);
  }
  c.payment.captureId = captureId;
  c.payment.capturedAmount = amount;
  c.payment.capturedAt = now();
  c.payment.released = true;
  c.status = "settled";
  const payer = getPayer(c);
  const released = roundToCents(c.payment.authorizedAmount - amount);
  addEvent(c, me.id, `${me.name} accepted the verified amount. ${amount} ${c.currency} paid (capture ${captureId}); ${released} ${c.currency} of ${payer ? payer.name : "the payer"}'s hold released.`);
}

export async function cancelCase(c: SettlementCase, me: Party): Promise<void> {
  requireStatus(c, ["waiting", "documenting", "assessing", "agreement", "funding"]);
  c.status = "closed";
  addEvent(c, me.id, `${me.name} cancelled the settlement before any money was held.`);
}
