import "server-only";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { hashPassword, verifyPassword, DUMMY_HASH } from "@/lib/password";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agent } from "@/db/schema";

const COOKIE = "bb_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET is missing or too short. See .env.example.");
  }
  return new TextEncoder().encode(s);
}

export interface Session {
  agentId: string;
  name: string;
  email: string;
}

export { hashPassword, verifyPassword };

export async function createSession(s: Session): Promise<void> {
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/**
 * Clear the cookie if the surrounding context allows it.
 *
 * Next only permits cookie writes inside a Server Action or Route Handler, so
 * a page render cannot delete a stale cookie. That is fine: the session fails
 * verification on every request either way, and the user lands on the login
 * screen, where signing in overwrites it. Tidying up is a nicety, not a
 * requirement, so a refusal here is swallowed deliberately.
 */
async function tryDestroySession(): Promise<void> {
  try {
    await destroySession();
  } catch {
    // read-only context — the redirect to /login still happens
  }
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      agentId: payload.agentId as string,
      name: payload.name as string,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}

/**
 * The signed-in agent, confirmed to still exist and be active.
 *
 * A JWT stays valid until it expires, which means a session can outlive the
 * account it names — the agent is deactivated, or the database is restored from
 * a backup with different ids. Without this check the stale id reaches the
 * database as a foreign key and surfaces as an unreadable constraint error
 * halfway through a booking. Verifying here turns that into a clean sign-out.
 */
export async function getVerifiedSession(): Promise<Session | null> {
  const s = await getSession();
  if (!s) return null;

  const [row] = await db
    .select({ id: agent.id, name: agent.name, email: agent.email,
              isActive: agent.isActive })
    .from(agent).where(eq(agent.id, s.agentId)).limit(1);

  if (!row || !row.isActive) {
    await tryDestroySession();
    return null;
  }
  // trust the database over the token for display fields
  return { agentId: row.id, name: row.name, email: row.email };
}

/** Throws if not signed in, or if the account no longer exists. */
export async function requireSession(): Promise<Session> {
  const s = await getVerifiedSession();
  if (!s) throw new Error("UNAUTHENTICATED");
  return s;
}

export async function login(email: string, password: string): Promise<Session> {
  const [found] = await db.select().from(agent)
    .where(eq(agent.email, email.trim().toLowerCase())).limit(1);

  // Always run a comparison so a missing account and a wrong password take
  // the same amount of time.
  const ok = await verifyPassword(
    password,
    found?.passwordHash ?? DUMMY_HASH,
  );
  if (!found || !ok) throw new Error("INVALID_CREDENTIALS");
  if (!found.isActive) throw new Error("ACCOUNT_DISABLED");

  const session: Session = { agentId: found.id, name: found.name, email: found.email };
  await createSession(session);
  return session;
}

export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  };
}
