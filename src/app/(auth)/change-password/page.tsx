import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/server/auth";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const dynamic = "force-dynamic";

/**
 * Deliberately outside the (app) group.
 *
 * The app layout bounces anyone holding a temporary password to this page, so
 * if this page lived inside that layout it would bounce to itself forever.
 */
export default async function ChangePasswordPage({
  searchParams,
}: { searchParams: Promise<{ first?: string }> }) {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  const { first } = await searchParams;

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-10">
      <ChangePasswordForm
        forced={first === "1" || !!session.mustChangePassword}
        agentName={session.name}
      />
    </main>
  );
}
