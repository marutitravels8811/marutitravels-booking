"use server";

import { redirect } from "next/navigation";
import { login, requestMeta } from "@/server/auth";
import { loginSchema } from "@/lib/schemas";
import { writeAudit } from "@/server/audit";
import { requestPasswordReset } from "@/server/services/agents";
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
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  let mustChange = false;
  try {
    const session = await login(parsed.data.email, parsed.data.password);
    mustChange = !!session.mustChangePassword;
    const meta = await requestMeta();
    await writeAudit(db, {
      agentId: session.agentId, action: "LOGIN",
      entityType: "agent", entityId: session.agentId, ...meta,
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : "UNKNOWN";
    if (code === "ACCOUNT_DISABLED") {
      return { error: "This account has been deactivated. Ask a colleague to re-enable it." };
    }
    // deliberately identical for a wrong password and an unknown email, so the
    // form cannot be used to discover which addresses have accounts
    return { error: "Email or password is incorrect." };
  }

  redirect(mustChange ? "/change-password?first=1" : "/trips");
}

export interface ForgotState { done?: boolean; error?: string }

export async function forgotPasswordAction(
  _prev: ForgotState, formData: FormData,
): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email || !email.includes("@")) {
    return { error: "Enter the email address you sign in with." };
  }
  try {
    const meta = await requestMeta();
    await requestPasswordReset({ email, ...meta });
  } catch {
    // never reveal whether the address matched an account
  }
  return { done: true };
}
