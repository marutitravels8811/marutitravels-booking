"use client";

import { useState } from "react";
import {
  LayoutGrid, Trash2, Wand2, RotateCcw, AlertTriangle,
  CheckCircle2, Eye, EyeOff, Plus, Minus,
} from "lucide-react";
import { SeatMap } from "@/components/seat-map/SeatMap";
import type { SeatLike } from "@/components/seat-map/geometry";
import type { DraftLayout, DraftSeat, Deck, BerthType } from "@/lib/seat-layout";
import { useLayoutEditor } from "./useLayoutEditor";
import { cn } from "@/lib/utils";

interface Props {
  initial?: DraftLayout;
  onChange?: (layout: DraftLayout, isValid: boolean) => void;
  readOnly?: boolean;
}

const TYPE_LABEL: Record<BerthType, string> = {
  SLEEPER_SINGLE: "Single sofa",
  SLEEPER_DOUBLE: "Double sofa",
  CABIN: "Cabin seat",
};

export function LayoutEditor({ initial, onChange, readOnly = false }: Props) {
  const { layout, dispatch, issues, summary, isValid, loadStandard } =
    useLayoutEditor(initial);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pendingCell, setPendingCell] =
    useState<{ deck: Deck; row: number; col: number } | null>(null);
  const [showInactive, setShowInactive] = useState(true);

  // report upward on every render where the layout changed
  const [lastSent, setLastSent] = useState<DraftLayout | null>(null);
  if (onChange && lastSent !== layout) {
    setLastSent(layout);
    queueMicrotask(() => onChange(layout, isValid));
  }

  const selected = layout.seats.find((s) => s.key === selectedKey) ?? null;
  const errors = issues.filter((i) => i.level === "error");
  const visibleSeats = (showInactive
    ? layout.seats
    : layout.seats.filter((s) => s.isActive)) as unknown as SeatLike[];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <button type="button" onClick={loadStandard} disabled={readOnly}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40">
            <Wand2 size={14} /> Generate standard 38 + 5
          </button>
          <button type="button" disabled={readOnly}
            onClick={() => dispatch({ type: "AUTO_NUMBER", scheme: "PER_DECK" })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:opacity-40">
            <RotateCcw size={14} /> Auto-number U/L/C
          </button>
          <button type="button" disabled={readOnly}
            onClick={() => dispatch({ type: "AUTO_NUMBER", scheme: "SEQUENTIAL" })}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:opacity-40">
            Auto-number 1…{summary.totalBerths}
          </button>

          <div className="mx-1 h-5 w-px bg-[var(--border)]" />

          <RowStepper
            label="Rows"
            value={layout.sleeperRows}
            onChange={(v) => dispatch({ type: "SET_META", patch: { sleeperRows: v } })}
            disabled={readOnly}
            min={1} max={14}
          />

          <button type="button" onClick={() => setShowInactive((v) => !v)}
            className="inline-flex items-center gap-1.5 sm:ml-auto rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:bg-ink-50">
            {showInactive ? <Eye size={14} /> : <EyeOff size={14} />}
            {showInactive ? "Showing disabled" : "Hiding disabled"}
          </button>
        </div>

        <SeatMap
          seats={visibleSeats}
          sleeperRows={layout.sleeperRows}
          sleeperCols={layout.sleeperCols}
          cabinCols={layout.cabinCols}
          stateOf={(s) => (s.key === selectedKey ? "SELECTED" : "AVAILABLE")}
          titleOf={(s) => `${s.seatNumber} · ${TYPE_LABEL[s.berthType]}${s.isActive ? "" : " (disabled)"}`}
          onSeatClick={readOnly ? undefined : (s) => {
            setSelectedKey(s.key ?? null);
            setPendingCell(null);
          }}
          onEmptyCellClick={readOnly ? undefined : (deck, row, col) => {
            setSelectedKey(null);
            setPendingCell({ deck, row, col });
          }}
          highlightKeys={selectedKey ? new Set([selectedKey]) : undefined}
          showLegend={false}
        />
      </div>

      {/* inspector */}
      <aside className="order-first flex flex-col gap-4 xl:order-none">
        <SummaryCard summary={summary} />

        {errors.length > 0 ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-red-700">
              <AlertTriangle size={14} /> {errors.length} problem{errors.length > 1 ? "s" : ""} to fix
            </p>
            <ul className="space-y-1 text-xs text-red-700">
              {errors.slice(0, 6).map((e, i) => <li key={i}>• {e.message}</li>)}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
            <CheckCircle2 size={14} /> Layout is valid and ready to save.
          </p>
        )}

        {pendingCell && !readOnly && (
          <AddPanel
            cell={pendingCell}
            onAdd={(berthType) => {
              if (berthType === "SLEEPER_DOUBLE") {
                dispatch({ type: "ADD_DOUBLE", deck: pendingCell.deck,
                  row: pendingCell.row, col: pendingCell.col });
              } else {
                dispatch({ type: "ADD_SINGLE", deck: pendingCell.deck,
                  row: pendingCell.row, col: pendingCell.col, berthType });
              }
              setPendingCell(null);
            }}
            onCancel={() => setPendingCell(null)}
          />
        )}

        {selected && !readOnly && (
          <SeatInspector
            seat={selected}
            layout={layout}
            onRenumber={(n) => dispatch({ type: "RENUMBER", key: selected.key, seatNumber: n })}
            onType={(t) => dispatch({ type: "SET_TYPE", key: selected.key, berthType: t })}
            onToggle={() => dispatch({ type: "TOGGLE_ACTIVE", key: selected.key })}
            onRemove={() => {
              dispatch({ type: "REMOVE", keys: [selected.key] });
              setSelectedKey(null);
            }}
          />
        )}

        {!selected && !pendingCell && (
          <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-xs leading-relaxed text-ink-500">
            <LayoutGrid className="mx-auto mb-2 text-ink-300" size={20} />
            Click a berth to rename, retype or remove it.
            <br />Click a dashed cell to add a new berth there.
          </p>
        )}
      </aside>
    </div>
  );
}

function RowStepper({ label, value, onChange, disabled, min, max }: {
  label: string; value: number; onChange: (v: number) => void;
  disabled?: boolean; min: number; max: number;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1">
      <span className="text-xs text-ink-500">{label}</span>
      <button type="button" disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        className="rounded p-0.5 text-ink-600 hover:bg-ink-100 disabled:opacity-30">
        <Minus size={12} />
      </button>
      <span className="w-5 text-center text-xs font-semibold tabular-nums">{value}</span>
      <button type="button" disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className="rounded p-0.5 text-ink-600 hover:bg-ink-100 disabled:opacity-30">
        <Plus size={12} />
      </button>
    </div>
  );
}

function SummaryCard({ summary }: { summary: ReturnType<typeof import("@/lib/seat-layout").summariseLayout> }) {
  const rows: [string, string | number][] = [
    ["Double sofas", summary.doubleSofas],
    ["Single sofas", summary.singleSofas],
    ["Sleeper berths", summary.sleeperBerths],
    ["Cabin seats", summary.cabinSeats],
    ["Lower / Upper", `${summary.perDeck.LOWER} / ${summary.perDeck.UPPER}`],
  ];
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Capacity</h4>
        <span className="text-2xl font-bold tabular-nums text-ink-900">{summary.totalBerths}</span>
      </div>
      <dl className="space-y-1.5 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-ink-500">{k}</dt>
            <dd className="font-medium tabular-nums text-ink-800">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AddPanel({ cell, onAdd, onCancel }: {
  cell: { deck: Deck; row: number; col: number };
  onAdd: (t: BerthType) => void; onCancel: () => void;
}) {
  const options: BerthType[] = cell.deck === "CABIN"
    ? ["CABIN"]
    : ["SLEEPER_SINGLE", "SLEEPER_DOUBLE"];
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
      <h4 className="mb-1 text-xs font-semibold text-brand-900">Add a berth</h4>
      <p className="mb-3 text-xs text-brand-700">
        {cell.deck.toLowerCase()} deck · row {cell.row + 1}, position {cell.col + 1}
      </p>
      <div className="flex flex-col gap-1.5">
        {options.map((t) => (
          <button key={t} type="button" onClick={() => onAdd(t)}
            className="rounded-lg bg-white px-3 py-2 text-left text-xs font-medium text-ink-800 ring-1 ring-brand-200 transition hover:ring-brand-500">
            {TYPE_LABEL[t]}
            {t === "SLEEPER_DOUBLE" && (
              <span className="block text-[10px] font-normal text-ink-500">
                takes this cell and the next one
              </span>
            )}
          </button>
        ))}
        <button type="button" onClick={onCancel}
          className="mt-1 text-xs text-brand-700 underline underline-offset-2">
          Cancel
        </button>
      </div>
    </div>
  );
}

function SeatInspector({ seat, layout, onRenumber, onType, onToggle, onRemove }: {
  seat: DraftSeat; layout: DraftLayout;
  onRenumber: (n: string) => void;
  onType: (t: BerthType) => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const duplicate = layout.seats.some(
    (s) => s.key !== seat.key && s.isActive &&
      s.seatNumber.trim().toUpperCase() === seat.seatNumber.trim().toUpperCase(),
  );
  const partner = seat.sofaGroupKey
    ? layout.seats.find((s) => s.sofaGroupKey === seat.sofaGroupKey && s.key !== seat.key)
    : null;
  const types: BerthType[] = seat.deck === "CABIN"
    ? ["CABIN"] : ["SLEEPER_SINGLE", "SLEEPER_DOUBLE"];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
        Berth {seat.seatNumber}
      </h4>

      <label className="mb-1 block text-xs font-medium text-ink-700">Seat number</label>
      <input
        value={seat.seatNumber}
        onChange={(e) => onRenumber(e.target.value.toUpperCase())}
        className={cn(
          "mb-1 w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none transition",
          duplicate
            ? "border-red-400 bg-red-50 text-red-800"
            : "border-[var(--border)] focus:border-brand-500 focus:ring-2 focus:ring-brand-100",
        )}
      />
      {duplicate && (
        <p className="mb-2 text-[11px] text-red-600">This number is already used.</p>
      )}

      <label className="mb-1 mt-3 block text-xs font-medium text-ink-700">Type</label>
      <div className="flex flex-col gap-1">
        {types.map((t) => (
          <button key={t} type="button" onClick={() => onType(t)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-left text-xs font-medium transition",
              seat.berthType === t
                ? "border-brand-500 bg-brand-50 text-brand-800"
                : "border-[var(--border)] text-ink-700 hover:bg-ink-50",
            )}>
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {partner && (
        <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-600">
          Paired with <strong className="text-ink-800">{partner.seatNumber}</strong> as one
          double sofa. Changing or removing one affects both.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onToggle}
          className="flex-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-ink-700 transition hover:bg-ink-50">
          {seat.isActive ? "Disable" : "Enable"}
        </button>
        <button type="button" onClick={onRemove}
          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50">
          <Trash2 size={13} /> Remove
        </button>
      </div>
    </div>
  );
}
