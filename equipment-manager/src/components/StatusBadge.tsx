import type { DeviceStatus } from "@shared/ipc";
import { STATUS_LABELS, badgeStyle } from "@/lib/status";
export function StatusBadge({ status }: { status: DeviceStatus }) {
  const c = badgeStyle(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
