import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { bus, seatLayout } from "@/db/schema";
import { loadDraftLayout, isLayoutInUse } from "@/server/services/layout";
import { generateStandardLayout } from "@/lib/seat-layout";
import { BusForm } from "../BusForm";

export const dynamic = "force-dynamic";

export default async function EditBusPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [row] = await db.select().from(bus).where(eq(bus.id, id)).limit(1);
  if (!row) notFound();

  const layout = row.currentLayoutId
    ? await loadDraftLayout(row.currentLayoutId)
    : null;
  const inUse = row.currentLayoutId ? await isLayoutInUse(row.currentLayoutId) : false;

  const [layoutRow] = row.currentLayoutId
    ? await db.select({ version: seatLayout.version }).from(seatLayout)
        .where(eq(seatLayout.id, row.currentLayoutId)).limit(1)
    : [undefined];

  return (
    <div className="p-6">
      <Link href="/masters/buses"
        className="mb-3 inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-800">
        <ChevronLeft size={14} /> Buses
      </Link>
      <h1 className="mb-1 text-lg font-semibold text-ink-900">{row.displayName}</h1>
      <p className="mb-5 font-mono text-xs text-ink-500">{row.registrationNo}</p>

      <BusForm initial={{
        id: row.id,
        registrationNo: row.registrationNo,
        displayName: row.displayName,
        note: row.note ?? "",
        isActive: row.isActive,
        fareSingleSofa: row.fareSingleSofaPaise / 100,
        fareDoubleSofa: row.fareDoubleSofaPaise / 100,
        fareCabin: row.fareCabinPaise / 100,
        layout: layout ?? generateStandardLayout(),
        layoutInUse: inUse,
        layoutVersion: layoutRow?.version,
      }} />
    </div>
  );
}
