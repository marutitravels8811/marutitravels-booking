import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BusForm } from "../BusForm";

export default function NewBusPage() {
  return (
    <div className="p-4 sm:p-6">
      <Link href="/masters/buses"
        className="mb-3 inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-800">
        <ChevronLeft size={14} /> Buses
      </Link>
      <h1 className="mb-1 text-lg font-semibold text-ink-900">Add a bus</h1>
      <p className="mb-5 text-sm text-ink-500">
        Start from the standard 38 sleeper + 5 cabin layout, then adjust every
        berth and number to match the actual vehicle.
      </p>
      <BusForm />
    </div>
  );
}
