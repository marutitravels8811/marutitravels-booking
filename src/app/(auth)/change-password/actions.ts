"use server";

import { requireSession, requestMeta } from "@/server/auth";
import { changeOwnPassword } from "@/server/services/agents";
import { failure, type ActionResult } from "@/server/errors";

export async function changePasswordAction(
  current: string, next: string, confirm: string,
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    if (next !== confirm) {
      return { ok: false, code: "MISMATCH",
               error: "The two new passwords do not match.",
               fieldErrors: { confirm: "Does not match" } };
    }
    const meta = await requestMeta();
    await changeOwnPassword({
      agentId: session.agentId,
      currentPassword: current, newPassword: next, ...meta,
    });
    return { ok: true };
  } catch (e) {
    return failure(e, "changePassword");
  }
}
