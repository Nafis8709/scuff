"use client";

export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="font-semibold underline underline-offset-4 print:hidden">
      Print or save as PDF
    </button>
  );
}
