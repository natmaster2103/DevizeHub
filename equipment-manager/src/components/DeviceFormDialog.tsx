import { useState, useEffect } from 'react'
import type { DeviceCreateArgs, DeviceUpdateArgs, CategoryRow } from '@shared/ipc'

export interface DeviceFormInitial {
  sku: string
  name: string
  categoryId: number | null
  serialNumber: string | null
  notes: string | null
}

export interface DeviceFormDialogProps {
  mode: 'create' | 'edit'
  initial?: DeviceFormInitial
  categories: CategoryRow[]
  loading: boolean
  error: string
  onClose(): void
  onSubmit(args: DeviceCreateArgs | DeviceUpdateArgs): void
}

function IconX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function DeviceFormDialog({
  mode, initial, categories, loading, error, onClose, onSubmit,
}: DeviceFormDialogProps) {
  const [sku, setSku] = useState(initial?.sku ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [categoryId, setCategoryId] = useState<number | null>(initial?.categoryId ?? null)
  const [serialNumber, setSerialNumber] = useState(initial?.serialNumber ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (initial) {
      setSku(initial.sku)
      setName(initial.name)
      setCategoryId(initial.categoryId)
      setSerialNumber(initial.serialNumber ?? '')
      setNotes(initial.notes ?? '')
    }
  }, [initial?.sku])

  function submit() {
    if (!sku.trim()) { setLocalError('SKU không được để trống.'); return }
    if (!name.trim()) { setLocalError('Tên thiết bị không được để trống.'); return }
    setLocalError('')
    onSubmit({ sku: sku.trim(), name: name.trim(), categoryId, serialNumber: serialNumber.trim() || null, notes: notes.trim() || null })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 40, padding: '0 12px',
    border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
    background: 'var(--surface)', color: 'var(--text)',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }
  const focusBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    (e.target.style.borderColor = 'var(--primary)')
  const blurBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    (e.target.style.borderColor = 'var(--border)')

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 110,
      background: 'rgba(15,23,42,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 480, background: 'var(--surface)', borderRadius: 'var(--rad-lg)',
        boxShadow: '0 24px 60px rgba(0,0,0,.3)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {mode === 'create' ? 'Thêm thiết bị mới' : 'Chỉnh sửa thiết bị'}
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)',
            borderRadius: 'var(--rad-sm)',
          }}>
            <IconX size={16} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* SKU */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              SKU <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              value={sku}
              onChange={e => setSku(e.target.value)}
              disabled={mode === 'edit'}
              placeholder="VD: LAP-0013"
              style={{
                ...inputStyle,
                fontFamily: "'Consolas',monospace",
                opacity: mode === 'edit' ? 0.6 : 1,
                cursor: mode === 'edit' ? 'not-allowed' : 'text',
              }}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
          </div>

          {/* Name */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Tên thiết bị <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="VD: Laptop Dell XPS 13"
              style={inputStyle}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
          </div>

          {/* Category */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Loại thiết bị
            </label>
            <select
              value={categoryId ?? ''}
              onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : null)}
              style={{ ...inputStyle, appearance: 'auto' as React.CSSProperties['appearance'] }}
              onFocus={focusBorder}
              onBlur={blurBorder}
            >
              <option value="">— Không phân loại —</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Serial */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Số serial
            </label>
            <input
              value={serialNumber}
              onChange={e => setSerialNumber(e.target.value)}
              placeholder="VD: SN-12345678"
              style={inputStyle}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Ghi chú
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Ghi chú (tùy chọn)"
              style={{
                ...inputStyle, height: 64, padding: '8px 12px',
                resize: 'none', fontFamily: 'inherit',
              }}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
          </div>

          {(localError || error) && (
            <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>
              {localError || error}
            </div>
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
          <button onClick={submit} disabled={loading} style={{
            height: 38, padding: '0 16px', border: 'none',
            borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Đang lưu…' : mode === 'create' ? 'Thêm thiết bị' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  )
}
