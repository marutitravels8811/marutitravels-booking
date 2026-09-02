"use client";

import { useState } from "react";
import { Printer, Grid2x2, Rows3, FileText, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

export type PrintFormat = "a4-8up" | "a4-4up" | "a5" | "thermal";

export const COMPACT_FORMATS: PrintFormat[] = ["a4-8up", "a4-4up"];

const FORMATS: {
  id: PrintFormat; label: string; perPage: string; hint: string;
  icon: React.ReactNode;
}[] = [
  { id: "a4-8up", label: "A4 · 8 per page", perPage: "8",
    hint: "Two columns, four rows. Most tickets per sheet.",
    icon: <Grid2x2 size={14} /> },
  { id: "a4-4up", label: "A4 · 4 per page", perPage: "4",
    hint: "Full-width strips, roomier to read and tear.",
    icon: <Rows3 size={14} /> },
  { id: "a5", label: "A5 · 1 per page", perPage: "1",
    hint: "One ticket with the full berth breakdown.",
    icon: <FileText size={14} /> },
  { id: "thermal", label: "Thermal 80mm", perPage: "1",
    hint: "Counter receipt printer.",
    icon: <Receipt size={14} /> },
];

const PER_PAGE: Record<PrintFormat, number> = {
  "a4-8up": 8, "a4-4up": 4, a5: 1, thermal: 1,
};

/**
 * Wraps tickets in the sheet that the print stylesheet targets.
 *
 * The format is a data attribute rather than JS-generated styles so the
 * page-break rules stay in the stylesheet, where the browser's print engine
 * can actually apply them.
 */
export function PrintSheet({
  children, count, subtitle, defaultFormat = "a4-8up", onFormatChange,
}: {
  children: React.ReactNode;
  count: number;
  subtitle: string;
  defaultFormat?: PrintFormat;
  onFormatChange?: (f: PrintFormat) => void;
}) {
  const [format, setFormat] = useState<PrintFormat>(defaultFormat);
  const sheets = Math.ceil(count / PER_PAGE[format]);

  function pick(f: PrintFormat) {
    setFormat(f);
    onFormatChange?.(f);
  }

  return (
    <>
      <div className="no-print mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="mr-auto">
          <p className="text-sm font-semibold text-ink-900">
            {count} {count === 1 ? "ticket" : "tickets"}
            <span className="ml-1.5 font-normal text-ink-500">
              on {sheets} {sheets === 1 ? "sheet" : "sheets"}
            </span>
          </p>
          <p className="text-xs text-ink-500">{subtitle}</p>
        </div>

        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Paper format</legend>
          {FORMATS.map((f) => (
            <button key={f.id} type="button" onClick={() => pick(f.id)}
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
        {FORMATS.find((f) => f.id === format)?.hint}{" "}
        {format.startsWith("a4")
          ? "Set the printer to A4 portrait with default margins, and turn off any “fit to page” scaling."
          : format === "a5"
          ? "Choose A5 in the printer dialog, or A4 with scaling."
          : "Pick your receipt printer and set paper width to 80mm."}
      </p>

      <div className="print-sheet mx-auto flex w-full flex-col items-center gap-3"
        data-print-format={format}>
        {children}
      </div>
    </>
  );
}
