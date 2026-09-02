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

/** Throws if not signed in. Use at the top of every server action. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
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
