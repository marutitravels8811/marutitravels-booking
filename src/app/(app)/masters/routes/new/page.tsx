import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { RouteForm } from "../RouteForm";

export default function NewRoutePage() {
  return (
    <div className="p-4 sm:p-6">
      <Link href="/masters/routes"
        className="mb-3 inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-800">
        <ChevronLeft size={14} /> Routes
      </Link>
      <h1 className="mb-1 text-lg font-semibold text-ink-900">Add a route</h1>
      <p className="mb-5 text-sm text-ink-500">
        Pickup and drop points are optional — an agent can always type a one-off
        location on the booking itself.
      </p>
      <RouteForm />
    </div>
  );
}
