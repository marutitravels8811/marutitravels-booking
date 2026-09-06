import { DatabaseZap } from "lucide-react";
import { requireSession } from "@/server/auth";
import { getRetentionSettings } from "@/server/services/data-retention";
import { DataRetentionPanel } from "./DataRetentionPanel";

export const dynamic = "force-dynamic";

export default async function DataRetentionPage() {
  await requireSession();
  const settings = await getRetentionSettings();
  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5 flex items-start gap-3">
        <DatabaseZap className="mt-0.5 text-brand-600" size={22} />
        <div>
          <h1 className="text-lg font-semibold text-ink-900">Data cleanup</h1>
          <p className="text-sm text-ink-500">
            Permanently remove old operational data to reclaim database space.
          </p>
        </div>
      </header>
      <DataRetentionPanel initialSettings={settings} />
    </div>
  );
}
