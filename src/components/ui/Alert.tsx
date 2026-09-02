import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const STYLES = {
  error: { box: "border-red-200 bg-red-50 text-red-800", icon: <AlertTriangle size={15} /> },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-800", icon: <AlertTriangle size={15} /> },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: <CheckCircle2 size={15} /> },
  info: { box: "border-brand-200 bg-brand-50 text-brand-800", icon: <Info size={15} /> },
} as const;

/** One consistent way to show an action's outcome. */
export function Alert({
  kind = "error", title, children, className,
}: {
  kind?: keyof typeof STYLES;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const s = STYLES[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm", s.box, className)}>
      <span className="mt-0.5 shrink-0">{s.icon}</span>
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-[13px] leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}
