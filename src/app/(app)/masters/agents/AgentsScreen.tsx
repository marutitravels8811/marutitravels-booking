"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Check, Copy, KeyRound, Loader2, Plus, ShieldAlert, UserPlus, X,
} from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/time";
import {
  saveAgentAction, setAgentActiveAction, issueTempPasswordAction,
  dismissResetAction,
} from "./actions";

export interface AgentView {
  id: string; name: string; email: string; phone: string | null;
  isActive: boolean; mustChangePassword: boolean;
  lastLoginAt: string | null; bookingsMade: number;
}
export interface ResetView {
  id: string; agentId: string; agentName: string; agentEmail: string;
  requestedAt: string; expiresAt: string;
}

type Issued = { tempPassword: string; agentName: string; agentEmail: string };

export function AgentsScreen({
  agents, resets, currentAgentId,
}: { agents: AgentView[]; resets: ResetView[]; currentAgentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AgentView | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) { setError(res.error ?? "That did not work."); return; }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert>{error}</Alert>}
      {issued && <TempPasswordPanel issued={issued} onClose={() => setIssued(null)} />}

      {resets.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <ShieldAlert size={15} />
            {resets.length} password {resets.length === 1 ? "request" : "requests"} waiting
          </h2>
          <p className="mb-3 mt-0.5 text-xs text-amber-800">
            Approving issues a temporary password shown once. Read it out, then
            they will be asked to choose their own.
          </p>
          <div className="flex flex-col gap-2">
            {resets.map((r) => (
              <div key={r.id}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2.5">
                <div className="mr-auto min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{r.agentName}</p>
                  <p className="truncate text-xs text-ink-500">
                    {r.agentEmail} · asked {formatDateTime(r.requestedAt)}
                  </p>
                </div>
                <button type="button" disabled={pending}
                  onClick={() => start(async () => {
                    setError(null);
                    const res = await issueTempPasswordAction(r.agentId, r.id);
                    if (!res.ok) { setError(res.error ?? "Could not issue a password."); return; }
                    setIssued(res.data!);
                    router.refresh();
                  })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
                  <KeyRound size={13} /> Approve
                </button>
                <button type="button" disabled={pending}
                  onClick={() => run(() => dismissResetAction(r.id))}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50 disabled:opacity-40">
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink-800">Agents</h2>
            <p className="text-xs text-ink-500">
              Everyone can do everything — the audit log records who did what.
            </p>
          </div>
          <button type="button" onClick={() => { setAdding(true); setEditing(null); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            <UserPlus size={15} /> Add agent
          </button>
        </div>

        {(adding || editing) && (
          <AgentForm agent={editing} pending={pending}
            onCancel={() => { setAdding(false); setEditing(null); }}
            onSave={(values) => start(async () => {
              setError(null);
              const res = await saveAgentAction(values);
              if (!res.ok) {
                setError(res.error ?? "Could not save the agent.");
                return;
              }
              if (res.data?.tempPassword) {
                setIssued({
                  tempPassword: res.data.tempPassword,
                  agentName: values.name, agentEmail: values.email,
                });
              }
              setAdding(false); setEditing(null);
              router.refresh();
            })} />
        )}

        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--surface-2)] text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Agent</th>
                <th className="px-4 py-2.5 font-medium">Phone</th>
                <th className="px-4 py-2.5 text-right font-medium">Bookings</th>
                <th className="px-4 py-2.5 font-medium">Last signed in</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {agents.map((a) => (
                <tr key={a.id} className={a.isActive ? "hover:bg-[var(--surface-2)]" : "bg-ink-50/60"}>
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink-900">{a.name}</span>
                    {a.id === currentAgentId && (
                      <span className="ml-1.5 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
                        you
                      </span>
                    )}
                    <span className="block text-xs text-ink-500">{a.email}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-600">{a.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-700">{a.bookingsMade}</td>
                  <td className="px-4 py-3 text-xs text-ink-600">
                    {a.lastLoginAt ? formatDateTime(a.lastLoginAt) : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    {!a.isActive ? (
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500">Inactive</span>
                    ) : a.mustChangePassword ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Temp password</span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2 text-xs">
                      <button type="button" onClick={() => { setEditing(a); setAdding(false); }}
                        className="font-medium text-brand-600 hover:underline">Edit</button>
                      <button type="button" disabled={pending}
                        onClick={() => start(async () => {
                          setError(null);
                          const res = await issueTempPasswordAction(a.id);
                          if (!res.ok) { setError(res.error ?? "Could not reset."); return; }
                          setIssued(res.data!);
                          router.refresh();
                        })}
                        className="font-medium text-ink-600 hover:underline disabled:opacity-40">
                        Reset password
                      </button>
                      <button type="button" disabled={pending || a.id === currentAgentId}
                        title={a.id === currentAgentId ? "You cannot deactivate your own account" : undefined}
                        onClick={() => run(() => setAgentActiveAction(a.id, !a.isActive))}
                        className={cn("font-medium hover:underline disabled:opacity-30",
                          a.isActive ? "text-red-600" : "text-emerald-700")}>
                        {a.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AgentForm({ agent, pending, onSave, onCancel }: {
  agent: AgentView | null; pending: boolean;
  onSave: (v: { id?: string; name: string; email: string; phone: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(agent?.name ?? "");
  const [email, setEmail] = useState(agent?.email ?? "");
  const [phone, setPhone] = useState(agent?.phone ?? "");

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink-900">
        {agent ? `Edit ${agent.name}` : "Add an agent"}
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Labelled label="Name">
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)}
            placeholder="Full name" className={field} />
        </Labelled>
        <Labelled label="Email">
          <input value={email} type="email" onChange={(e) => setEmail(e.target.value)}
            placeholder="name@office.local" className={field} />
        </Labelled>
        <Labelled label="Phone">
          <input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)}
            placeholder="Optional" className={field} />
        </Labelled>
      </div>
      {!agent && (
        <p className="mt-2 text-xs text-ink-500">
          A temporary password is generated and shown once. They will be asked to
          change it the first time they sign in.
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={pending || !name.trim() || !email.trim()}
          onClick={() => onSave({ id: agent?.id, name, email, phone })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          {agent ? "Save changes" : "Create agent"}
        </button>
        <button type="button" onClick={onCancel}
          className="text-sm text-ink-600 hover:text-ink-900">Cancel</button>
      </div>
    </div>
  );
}

function TempPasswordPanel({ issued, onClose }: { issued: Issued; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-emerald-900">
            Temporary password for {issued.agentName}
          </h3>
          <p className="text-xs text-emerald-800">
            Shown once, and never stored in readable form. Read it out now —
            reopening this page will not bring it back.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Dismiss"
          className="rounded p-1 text-emerald-700 hover:bg-emerald-100">
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-lg border border-emerald-300 bg-white px-4 py-2.5 font-mono text-lg font-bold tracking-widest text-ink-900">
          {issued.tempPassword}
        </code>
        <button type="button"
          onClick={() => {
            navigator.clipboard?.writeText(issued.tempPassword);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <span className="text-xs text-emerald-800">for {issued.agentEmail}</span>
      </div>
    </div>
  );
}

const field = "w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-700">{label}</label>
      {children}
    </div>
  );
}
