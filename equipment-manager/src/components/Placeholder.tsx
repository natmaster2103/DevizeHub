export function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '80px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
      <div style={{ marginTop: 8 }}>Tính năng đang phát triển.</div>
    </div>
  )
}
