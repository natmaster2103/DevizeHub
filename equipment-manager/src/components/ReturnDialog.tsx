import React, { useState } from 'react'
import type { ReturnDeviceArgs } from '@shared/ipc'

export interface ReturnDialogProps {
  allocationId: number
  deviceName: string
  deviceSku: string
  recipient: string
  contextLabel: string
  onClose(): void
  onConfirm(args: ReturnDeviceArgs): void
  loading: boolean
}

const RETURN_CONDITIONS = ['Tốt', 'Trầy xước nhẹ', 'Cần bảo trì', 'Hỏng']

function IconX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function ReturnDialog({
  allocationId, deviceName, deviceSku, recipient, contextLabel,
  onClose, onConfirm, loading,
}: ReturnDialogProps) {
  const [condition, setCondition] = useState('Tốt')
  const [notes, setNotes] = useState('')

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 40, padding: '0 12px',
    border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
    background: 'var(--surface)', color: 'var(--text)',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
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
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Trả thiết bị về kho</div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)',
              borderRadius: 'var(--rad-sm)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Device info */}
        <div style={{ padding: '14px 20px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '10px 0', fontSize: 13 }}>
            {[
              ['Thiết bị', deviceName],
              ['SKU', deviceSku],
              ['Người đang giữ', recipient],
              [contextLabel.split(':')[0], contextLabel.split(':').slice(1).join(':').trim()],
            ].map(([k, v]) => (
              <React.Fragment key={k}>
                <div style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{k}</div>
                <div style={{ fontWeight: 600 }}>{v}</div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Form */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Tình trạng khi trả
            </label>
            <select
              value={condition}
              onChange={e => setCondition(e.target.value)}
              style={{ ...inputStyle, appearance: 'auto' as any }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            >
              {RETURN_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Ghi chú
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Ghi chú thêm (tùy chọn)"
              style={{
                ...inputStyle, height: 80, padding: '10px 12px',
                resize: 'vertical', fontFamily: 'inherit',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '14px 20px', borderTop: '1px solid var(--border)',
        }}>
          <button
            onClick={onClose}
            style={{
              height: 38, padding: '0 16px', border: '1px solid var(--border)',
              borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            Hủy
          </button>
          <button
            onClick={() => onConfirm({ allocationId, condition, notes })}
            disabled={loading}
            style={{
              height: 38, padding: '0 16px', border: 'none',
              borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            }}
            onMouseEnter={e => { if (!loading) (e.currentTarget.style.background = 'var(--primary-hover)') }}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
          >
            {loading ? 'Đang xử lý…' : 'Xác nhận trả về'}
          </button>
        </div>
      </div>
    </div>
  )
}
