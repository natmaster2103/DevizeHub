import { IconBox } from "@/lib/icons";

export function DeviceThumbnail({
  thumbnailPath,
  size = 48,
}: {
  thumbnailPath: string | null;
  size?: number;
}) {
  if (thumbnailPath) {
    return (
      <img
        src={`file://${thumbnailPath}`}
        alt=""
        style={{
          width: size,
          height: size,
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
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "var(--rad-sm)",
        background: "var(--surface-2)",
        color: "var(--text-muted)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <IconBox size={Math.round(size * 0.42)} />
    </div>
  );
}
