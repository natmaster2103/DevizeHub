import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { IconPlus } from '@/lib/icons'
import { api, unwrap } from '@/lib/api'
import type { CreateRequestArgs } from '@shared/ipc'

function IconX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function useDepartments() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: () => unwrap(api.catalog.list()),
    select: (data) => data.departments,
  })
}

export interface CreateRequestDialogProps {
  onClose(): void
  /** When set, the department field is pre-filled and locked (used when
   * creating a request from a specific DeptCard on the Dashboard). */
  presetDepartmentId?: number
}

export function CreateRequestDialog({ onClose, presetDepartmentId }: CreateRequestDialogProps) {
  const queryClient = useQueryClient()
  const { data: departments } = useDepartments()
  const [code, setCode] = useState('')
  const [departmentId, setDepartmentId] = useState(
    presetDepartmentId != null ? String(presetDepartmentId) : ''
  )
  const [createdAt, setCreatedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')

  const mutation = useMutation({
    mutationFn: (args: CreateRequestArgs) => unwrap(api.requests.create(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (e) => setFormError((e as Error).message),
  })

  function submit() {
    setFormError('')
    if (!code.trim()) { setFormError('Vui lòng nhập mã phiếu.'); return }
    if (!departmentId) { setFormError('Vui lòng chọn phòng ban.'); return }
    mutation.mutate({
      code: code.trim(),
      departmentId: Number(departmentId),
      createdAt: createdAt || null,
      notes: notes.trim() || null,
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 40, padding: '0 12px',
    border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
    background: 'var(--surface)', color: 'var(--text)',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }

  const REQUIRED = <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(15,23,42,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn .12s ease'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 520, background: 'var(--surface)', borderRadius: 'var(--rad-lg)',
          boxShadow: '0 24px 60px rgba(0,0,0,.3)', overflow: 'hidden',
          animation: 'popIn .14s ease'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)'
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Tạo phiếu đề nghị</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Điền thông tin phiếu đề nghị cấp phát thiết bị
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)',
              borderRadius: 'var(--rad-sm)'
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Row 1: code + dept */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Mã phiếu{REQUIRED}
              </label>
              <input
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="VD: DX-302"
                style={{ ...inputStyle, fontFamily: "'Consolas','SF Mono',monospace" }}
                onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Phòng ban{REQUIRED}
              </label>
              <select
                value={departmentId}
                onChange={e => setDepartmentId(e.target.value)}
                disabled={presetDepartmentId != null}
                style={{
                  ...inputStyle, appearance: 'auto' as any,
                  opacity: presetDepartmentId != null ? 0.7 : 1,
                  cursor: presetDepartmentId != null ? 'not-allowed' : 'auto',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              >
                <option value="">— Chọn phòng ban —</option>
                {(departments ?? []).map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Ngày lập */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Ngày lập
            </label>
            <input
              type="date"
              value={createdAt}
              onChange={e => setCreatedAt(e.target.value)}
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {/* Ghi chú */}
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
                resize: 'vertical', fontFamily: 'inherit'
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {formError && (
            <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>{formError}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '14px 20px', borderTop: '1px solid var(--border)'
        }}>
          <button
            onClick={onClose}
            style={{
              height: 38, padding: '0 16px', border: '1px solid var(--border)',
              borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            Hủy
          </button>
          <button
            onClick={submit}
            disabled={mutation.isPending}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 38, padding: '0 16px', border: 'none',
              borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: mutation.isPending ? 'not-allowed' : 'pointer',
              opacity: mutation.isPending ? 0.7 : 1
            }}
            onMouseEnter={e => { if (!mutation.isPending) (e.currentTarget.style.background = 'var(--primary-hover)') }}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
          >
            <IconPlus size={14} />
            {mutation.isPending ? 'Đang tạo…' : 'Tạo phiếu'}
          </button>
        </div>
      </div>
    </div>
  )
}
