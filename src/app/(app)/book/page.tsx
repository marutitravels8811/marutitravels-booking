import { redirect } from "next/navigation";
import { serviceDateOf } from "@/lib/time";

export default async function BookIndex({
  searchParams,
}: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  redirect(`/trips?date=${sp.date ?? serviceDateOf()}`);
}
