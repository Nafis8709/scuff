// The money math for an invoice check. Deliberately NOT done by the AI:
// a real test showed a model reasoning "tax on supported items is $28.44"
// while still returning the full printed tax of $50.94.
//
// Rules:
// - An item line counts if the AI supported it, or the payer chose to approve it.
// - Tax lines are never judged on their own: their printed amount is shared out in
//   proportion to the item lines that count.
// - The total is never more than the cap.

import type { InvoiceLine } from "./types";

function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

type Rule = (line: InvoiceLine) => boolean;

export const countsAsSupported: Rule = (line) => line.verdict === "supported";
export const countsAsApproved: Rule = (line) => line.verdict === "supported" || line.payerApproved;

function itemTotals(lines: InvoiceLine[], counts: Rule): { allItems: number; countedItems: number } {
  let allItems = 0;
  let countedItems = 0;
  for (const line of lines) {
    if (line.isTax) continue;
    allItems += line.amount;
    if (counts(line)) countedItems += line.amount;
  }
  return { allItems, countedItems };
}

// The part of one tax line that applies to the counted items.
export function taxShare(lines: InvoiceLine[], taxLine: InvoiceLine, counts: Rule): number {
  const { allItems, countedItems } = itemTotals(lines, counts);
  if (allItems <= 0) return 0;
  return roundToCents((taxLine.amount * countedItems) / allItems);
}

export function totalFor(lines: InvoiceLine[], counts: Rule): number {
  let total = 0;
  for (const line of lines) {
    if (line.isTax) {
      total += taxShare(lines, line, counts);
    } else if (counts(line)) {
      total += line.amount;
    }
  }
  return roundToCents(total);
}

export function totalSupported(lines: InvoiceLine[]): number {
  return totalFor(lines, countsAsSupported);
}

export function approvedAmount(lines: InvoiceLine[], cap: number): number {
  return Math.min(totalFor(lines, countsAsApproved), cap);
}
