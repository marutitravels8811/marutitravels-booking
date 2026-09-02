import { requireSession } from "@/server/auth";
import { listAgents, listPendingResets } from "@/server/services/agents";
import { AgentsScreen } from "./AgentsScreen";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const session = await requireSession();
  const [agents, resets] = await Promise.all([listAgents(), listPendingResets()]);

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-lg font-semibold text-ink-900">Agents</h1>
        <p className="text-sm text-ink-500">
          Who can sign in, and password requests waiting for approval.
        </p>
      </header>

      <AgentsScreen
        currentAgentId={session.agentId}
        agents={agents.map((a) => ({
          id: a.id, name: a.name, email: a.email, phone: a.phone,
          isActive: a.isActive, mustChangePassword: a.mustChangePassword,
          lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
          bookingsMade: a.bookingsMade,
        }))}
        resets={resets.map((r) => ({
          id: r.id, agentId: r.agentId, agentName: r.agentName,
          agentEmail: r.agentEmail,
          requestedAt: r.requestedAt.toISOString(),
          expiresAt: r.expiresAt.toISOString(),
        }))}
      />
    </div>
  );
}
