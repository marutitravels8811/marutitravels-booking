"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, requestMeta } from "@/server/auth";
import {
  createAgent, updateAgent, setAgentActive, issueTempPassword, dismissReset,
} from "@/server/services/agents";
import { failure, zodFailure, AppError, type ActionResult } from "@/server/errors";

const agentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Enter the agent's name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
});

export async function saveAgentAction(raw: unknown): Promise<ActionResult<{
  agentId: string; tempPassword?: string;
}>> {
  try {
    const session = await requireSession();
    const parsed = agentSchema.safeParse(raw);
    if (!parsed.success) return zodFailure(parsed.error);
    const v = parsed.data;
    const meta = await requestMeta();

    if (v.id) {
      await updateAgent({
        agentId: v.id, name: v.name, email: v.email, phone: v.phone,
        actorAgentId: session.agentId, ...meta,
      });
      revalidatePath("/masters/agents");
      return { ok: true, data: { agentId: v.id } };
    }

    const created = await createAgent({
      name: v.name, email: v.email, phone: v.phone,
      actorAgentId: session.agentId, ...meta,
    });
    revalidatePath("/masters/agents");
    return { ok: true, data: created };
  } catch (e) {
    return failure(e, "saveAgent");
  }
}

export async function setAgentActiveAction(
  agentId: string, isActive: boolean,
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    if (agentId === session.agentId && !isActive) {
      throw new AppError("SELF_DEACTIVATE",
        "You cannot deactivate your own account. Ask a colleague to do it.");
    }
    const meta = await requestMeta();
    await setAgentActive({
      agentId, isActive, actorAgentId: session.agentId, ...meta,
    });
    revalidatePath("/masters/agents");
    return { ok: true };
  } catch (e) {
    return failure(e, "setAgentActive");
  }
}

export async function issueTempPasswordAction(
  agentId: string, resetId?: string,
): Promise<ActionResult<{ tempPassword: string; agentName: string; agentEmail: string }>> {
  try {
    const session = await requireSession();
    const meta = await requestMeta();
    const result = await issueTempPassword({
      agentId, actorAgentId: session.agentId, resetId: resetId ?? null, ...meta,
    });
    revalidatePath("/masters/agents");
    return { ok: true, data: result };
  } catch (e) {
    return failure(e, "issueTempPassword");
  }
}

export async function dismissResetAction(resetId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    await dismissReset({ resetId, actorAgentId: session.agentId });
    revalidatePath("/masters/agents");
    return { ok: true };
  } catch (e) {
    return failure(e, "dismissReset");
  }
}
