import { Building2 } from "lucide-react";
import { requireSession } from "@/server/auth";
import { getOfficeSetting } from "@/server/services/office-settings";
import { OfficeSettingsPanel } from "./OfficeSettingsPanel";

export const dynamic = "force-dynamic";

export default async function OfficeSettingsPage() {
  await requireSession();
  const settings = await getOfficeSetting();
  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5 flex items-start gap-3">
        <Building2 className="mt-0.5 text-brand-600" size={22} />
        <div>
          <h1 className="text-lg font-semibold text-ink-900">Office details</h1>
          <p className="text-sm text-ink-500">
            These two addresses and all phone numbers appear on printed tickets.
          </p>
        </div>
      </header>
      <OfficeSettingsPanel initialSettings={settings} />
    </div>
  );
}
