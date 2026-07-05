interface ConfirmDeleteDialogProps {
  deviceName: string
  deviceSku: string
  loading: boolean
  error: string
  onClose(): void
  onConfirm(): void
}

export function ConfirmDeleteDialog({
  deviceName, deviceSku, loading, error, onClose, onConfirm,
}: ConfirmDeleteDialogProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
        background: 'rgba(15,23,42,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 440, background: 'var(--surface)', borderRadius: 'var(--rad-lg)',
          boxShadow: '0 24px 60px rgba(0,0,0,.3)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>Xoá thiết bị</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
            Bạn có chắc muốn xoá <strong style={{ color: 'var(--text)' }}>{deviceName}</strong>{' '}
            (<span style={{ fontFamily: "'Consolas',monospace" }}>{deviceSku}</span>)? Hành động này
            xoá vĩnh viễn thiết bị và toàn bộ lịch sử cấp phát/bảo trì liên quan.
          </div>
        </div>
        {error && (
          <div style={{ padding: '12px 22px', fontSize: 13, color: '#dc2626', fontWeight: 500 }}>
            {error}
          </div>
        )}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '14px 22px', borderTop: '1px solid var(--border)',
        }}>
          <button onClick={onClose} style={{
            height: 38, padding: '0 16px', border: '1px solid var(--border)',
            borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Huỷ</button>
          <button onClick={onConfirm} disabled={loading} style={{
            height: 38, padding: '0 16px', border: 'none',
            borderRadius: 'var(--rad-sm)', background: '#dc2626',
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Đang xoá…' : 'Xoá thiết bị'}
          </button>
        </div>
      </div>
    </div>
  )
}
