"use client";

import { useState } from "react";
import { Printer, FileText, Receipt, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export type PrintFormat = "a4-2up" | "a5" | "thermal";

const FORMATS: { id: PrintFormat; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "a4-2up", label: "A4 · 2 per page", hint: "Office default — saves paper on a batch",
    icon: <Layers size={14} /> },
  { id: "a5", label: "A5 · 1 per page", hint: "One ticket per sheet, larger text",
    icon: <FileText size={14} /> },
  { id: "thermal", label: "Thermal 80mm", hint: "Counter receipt printer",
    icon: <Receipt size={14} /> },
];

/**
 * Wraps tickets in the sheet that print.css targets.
 *
 * The format lives on a data attribute rather than in JS-generated styles so
 * the page-break rules stay in the stylesheet where the browser's print engine
 * can apply them; switching format is a single attribute change with no
 * re-layout of the ticket markup itself.
 */
export function PrintSheet({
  children, count, subtitle, defaultFormat = "a4-2up",
}: {
  children: React.ReactNode;
  count: number;
  subtitle: string;
  defaultFormat?: PrintFormat;
}) {
  const [format, setFormat] = useState<PrintFormat>(defaultFormat);

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="mr-auto">
          <p className="text-sm font-semibold text-ink-900">
            {count} {count === 1 ? "ticket" : "tickets"} ready to print
          </p>
          <p className="text-xs text-ink-500">{subtitle}</p>
        </div>

        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Paper format</legend>
          {FORMATS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFormat(f.id)}
              title={f.hint} aria-pressed={format === f.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition",
                format === f.id
                  ? "border-brand-500 bg-brand-50 text-brand-800"
                  : "border-[var(--border)] text-ink-700 hover:bg-ink-50",
              )}>
              {f.icon} {f.label}
            </button>
          ))}
        </fieldset>

        <button type="button" onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700">
          <Printer size={15} /> Print
        </button>
      </div>

      <p className="no-print mb-3 text-xs text-ink-500">
        {format === "a4-2up" && "Two tickets per A4 sheet. Set your printer to A4 portrait and margins to Default."}
        {format === "a5" && "One ticket per sheet. Choose A5 in the printer dialog, or A4 with scaling."}
        {format === "thermal" && "Sized for an 80mm roll. Pick your receipt printer and set paper to 80mm."}
      </p>

      <div className="print-sheet flex flex-col items-center gap-4" data-print-format={format}>
        {children}
      </div>
    </>
  );
}
