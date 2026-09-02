"use server";

import { redirect } from "next/navigation";
import { login } from "@/server/auth";
import { loginSchema } from "@/lib/schemas";
import { writeAudit } from "@/server/audit";
import { requestMeta } from "@/server/auth";
import { db } from "@/db";

export interface LoginState { error?: string }

export async function loginAction(
  _prev: LoginState, formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details" };
  }

  try {
    const session = await login(parsed.data.email, parsed.data.password);
    const meta = await requestMeta();
    await writeAudit(db, {
      agentId: session.agentId, action: "LOGIN",
      entityType: "agent", entityId: session.agentId, ...meta,
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : "UNKNOWN";
    if (code === "ACCOUNT_DISABLED") {
      return { error: "This account has been disabled. Ask another agent to re-enable it." };
    }
    return { error: "Email or password is incorrect." };
  }
  redirect("/dashboard");
}
