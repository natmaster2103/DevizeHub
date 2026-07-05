import { useState } from 'react'
import type { DeviceChangeStatusArgs, DeviceStatus } from '@shared/ipc'

export interface ChangeStatusDialogProps {
  sku: string
  deviceName: string
  currentStatus: DeviceStatus
  isAllocated: boolean
  loading: boolean
  error: string
  onClose(): void
  onConfirm(args: DeviceChangeStatusArgs): void
}

const STATUS_OPTIONS: Array<{ value: DeviceChangeStatusArgs['status']; label: string }> = [
  { value: 'available',      label: 'Trong kho' },
  { value: 'maintenance',    label: 'Đang bảo trì' },
  { value: 'broken',         label: 'Hỏng' },
  { value: 'decommissioned', label: 'Thanh lý' },
]

function IconX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function ChangeStatusDialog({
  sku, deviceName, currentStatus, isAllocated, loading, error, onClose, onConfirm,
}: ChangeStatusDialogProps) {
  const defaultStatus = STATUS_OPTIONS.find(o => o.value !== currentStatus)?.value ?? 'maintenance'
  const [status, setStatus] = useState<DeviceChangeStatusArgs['status']>(defaultStatus)
  const [notes, setNotes] = useState('')

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 40, padding: '0 12px',
    border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
    background: 'var(--surface)', color: 'var(--text)',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 110,
      background: 'rgba(15,23,42,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 440, background: 'var(--surface)', borderRadius: 'var(--rad-lg)',
        boxShadow: '0 24px 60px rgba(0,0,0,.3)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Đổi trạng thái thiết bị</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {deviceName} · <span style={{ fontFamily: "'Consolas',monospace" }}>{sku}</span>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)',
            borderRadius: 'var(--rad-sm)',
          }}>
            <IconX size={16} />
          </button>
        </div>

        {/* Allocated warning */}
        {isAllocated && (
          <div style={{
            margin: '12px 20px 0', padding: '10px 14px',
            background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.25)',
            borderRadius: 'var(--rad-sm)', fontSize: 13, color: '#dc2626', fontWeight: 500,
          }}>
            Thiết bị đang được cấp phát. Vui lòng thu hồi trước khi đổi trạng thái.
          </div>
        )}

        {/* Form */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Trạng thái mới
            </label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as DeviceChangeStatusArgs['status'])}
              disabled={isAllocated}
              style={{
                ...inputStyle,
                appearance: 'auto' as React.CSSProperties['appearance'],
                opacity: isAllocated ? 0.5 : 1,
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            >
              {STATUS_OPTIONS
                .filter(o => o.value !== currentStatus)
                .map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Ghi chú
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              disabled={isAllocated}
              placeholder="Ghi chú thêm (tùy chọn)"
              style={{
                ...inputStyle, height: 64, padding: '8px 12px',
                resize: 'none', fontFamily: 'inherit',
                opacity: isAllocated ? 0.5 : 1,
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>
          {error && (
            <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '14px 20px', borderTop: '1px solid var(--border)',
        }}>
          <button onClick={onClose} style={{
            height: 38, padding: '0 16px', border: '1px solid var(--border)',
            borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Hủy</button>
          <button
            onClick={() => onConfirm({ sku, status, notes: notes.trim() || null })}
            disabled={loading || isAllocated}
            style={{
              height: 38, padding: '0 16px', border: 'none',
              borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: loading || isAllocated ? 'not-allowed' : 'pointer',
              opacity: loading || isAllocated ? 0.5 : 1,
            }}
          >
            {loading ? 'Đang lưu…' : 'Xác nhận đổi trạng thái'}
          </button>
        </div>
      </div>
    </div>
  )
}
