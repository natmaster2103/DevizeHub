import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import { IconBox } from "@/lib/icons";
import type { AvailableDeviceRow } from "@shared/ipc";

export interface AllocationDrawerProps {
  open: boolean;
  onClose(): void;
  dragStateRef: React.MutableRefObject<{
    devices: AvailableDeviceRow[];
  } | null>;
}

function useAvailableForDrawer() {
  return useQuery({
    queryKey: ["requests", "available-devices"],
    queryFn: () => unwrap(api.requests.availableDevices()),
    select: (d) => d.devices,
  });
}

function IconX({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconDrag({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="9" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="18" r="1" />
    </svg>
  );
}

function DeviceThumbnail({ thumbnailPath }: { thumbnailPath: string | null }) {
  if (thumbnailPath) {
    return (
      <img
        src={`file://${thumbnailPath}`}
        alt=""
        style={{
          width: 48,
          height: 48,
          borderRadius: "var(--rad-sm)",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: 48,
        height: 48,
        flexShrink: 0,
        borderRadius: "var(--rad-sm)",
        background: "var(--surface-2)",
        color: "var(--text-muted)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <IconBox size={20} />
    </div>
  );
}

export function AllocationDrawer({
  open,
  onClose,
  dragStateRef,
}: AllocationDrawerProps) {
  const { data: devices = [] } = useAvailableForDrawer();

  const [lendQuery, setLendQuery] = useState("");
  const [lendSelected, setLendSelected] = useState<string[]>([]);

  const filtered = devices.filter((d) => {
    const q = lendQuery.trim().toLowerCase();
    return (
      !q || (d.name + " " + d.sku + " " + d.category).toLowerCase().includes(q)
    );
  });

  const allSelected =
    filtered.length > 0 && filtered.every((d) => lendSelected.includes(d.sku));

  function toggleOne(sku: string) {
    setLendSelected((prev) =>
      prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku],
    );
  }

  function toggleAll() {
    if (allSelected) {
      setLendSelected([]);
    } else {
      setLendSelected(filtered.map((d) => d.sku));
    }
  }

  function handleDragStart(sku: string) {
    const skus =
      lendSelected.includes(sku) && lendSelected.length > 0
        ? lendSelected
        : [sku];
    const picked = devices.filter((d) => skus.includes(d.sku));
    dragStateRef.current = { devices: picked };
  }

  if (!open) return null;

  return (
    <>
      {/* Pointer-events:none overlay so dashboard cards remain clickable */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          pointerEvents: "none",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 400,
          height: "100vh",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          zIndex: 41,
          boxShadow: "-4px 0 24px rgba(0,0,0,.12)",
          animation: "slideInRight .18s ease",
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 56,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              Cấp phát thiết bị
            </div>
            <div
              style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}
            >
              Chọn rồi kéo thiết bị vào thẻ phòng ban
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              borderRadius: "var(--rad-sm)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--hoverbg)")
            }
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Search */}
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <input
            value={lendQuery}
            onChange={(e) => setLendQuery(e.target.value)}
            placeholder="Tìm thiết bị trong kho…"
            style={{
              width: "100%",
              height: 36,
              padding: "0 10px",
              border: "1px solid var(--border)",
              borderRadius: "var(--rad-sm)",
              background: "var(--surface-2)",
              color: "var(--text)",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
          />
        </div>

        {/* Select-all bar */}
        {filtered.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 16px",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface-2)",
              flexShrink: 0,
            }}
          >
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              style={{ accentColor: "var(--primary)", width: 15, height: 15 }}
            />
            <span style={{ fontSize: 12, color: "var(--text-muted)", flex: 1 }}>
              {lendSelected.length > 0
                ? `${lendSelected.length} đã chọn`
                : "Chọn tất cả"}
            </span>
          </div>
        )}

        {/* Device list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 && (
            <div
              style={{
                padding: 20,
                fontSize: 13,
                color: "var(--text-muted)",
                textAlign: "center",
              }}
            >
              Không có thiết bị trong kho.
            </div>
          )}
          {filtered.map((d) => {
            const selected = lendSelected.includes(d.sku);
            return (
              <div
                key={d.sku}
                draggable
                onDragStart={() => handleDragStart(d.sku)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 16px",
                  cursor: "grab",
                  borderBottom: "1px solid var(--border)",
                  background: selected
                    ? "color-mix(in srgb, var(--primary) 6%, transparent)"
                    : "none",
                  border: selected
                    ? "1px solid color-mix(in srgb, var(--primary) 30%, transparent)"
                    : "1px solid transparent",
                  userSelect: "none",
                }}
                onMouseEnter={(e) => {
                  if (!selected) e.currentTarget.style.background = "var(--hoverbg)";
                }}
                onMouseLeave={(e) => {
                  if (!selected) e.currentTarget.style.background = "none";
                }}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleOne(d.sku)}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    accentColor: "var(--primary)",
                    width: 15,
                    height: 15,
                    flexShrink: 0,
                  }}
                />
                <DeviceThumbnail thumbnailPath={d.thumbnailPath} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {d.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginTop: 2,
                    }}
                  >
                    <span style={{ fontFamily: "'Consolas',monospace" }}>
                      {d.sku}
                    </span>
                    {d.category ? ` · ${d.category}` : ""}
                  </div>
                </div>
                <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                  <IconDrag size={14} />
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
            fontSize: 12,
            color: "var(--text-muted)",
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          Kéo thiết bị và thả vào thẻ phòng ban để cấp phát
        </div>
      </div>
    </>
  );
}
