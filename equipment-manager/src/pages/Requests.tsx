import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRequests } from '@/hooks/useRequests'
import { useAuth } from '@/context/AuthContext'
import { REQUEST_STATUS_LABELS, requestBadgeStyle } from '@/lib/status'
import { IconSearch, IconPlus } from '@/lib/icons'
import { api, unwrap } from '@/lib/api'
import type { RequestRow, CreateRequestArgs, RequestStatus } from '@shared/ipc'

// ── Badge ─────────────────────────────────────────────────────────────────────
function RequestBadge({ status }: { status: RequestRow['status'] }) {
  const { bg, fg } = requestBadgeStyle(status)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 999,
      fontSize: 12, fontWeight: 600,
      background: bg, color: fg
    }}>
      {REQUEST_STATUS_LABELS[status]}
    </span>
  )
}

// ── Create Request Dialog ─────────────────────────────────────────────────────
function IconX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function useDepartments() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: () => unwrap(api.catalog.list()),
    select: (data) => data.departments,
  })
}

interface CreateRequestDialogProps {
  onClose(): void
}

function CreateRequestDialog({ onClose }: CreateRequestDialogProps) {
  const queryClient = useQueryClient()
  const { data: departments } = useDepartments()
  const [code, setCode] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [createdAt, setCreatedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')

  const mutation = useMutation({
    mutationFn: (args: CreateRequestArgs) => unwrap(api.requests.create(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] })
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
                style={{ ...inputStyle, appearance: 'auto' as any }}
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

// ── Main page ─────────────────────────────────────────────────────────────────
const COL = '140px 1fr 1fr 60px 130px 36px'
const STATUS_FILTER_KEYS: Array<'all' | RequestStatus> = ['all', 'pending', 'allocated', 'completed']
const STATUS_FILTER_LABELS: Record<'all' | RequestStatus, string> = {
  all: 'Tất cả',
  pending: 'Chưa cấp phát',
  allocated: 'Đang cho mượn',
  completed: 'Hoàn tất',
}

export default function Requests() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const [query, setQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all')
  const [deptFilter, setDeptFilter] = useState<string>('')
  const { data: departments } = useDepartments()
  const { data, isLoading, error } = useRequests(query)
  const filtered = (data?.requests ?? []).filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (deptFilter && r.department !== deptFilter) return false
    return true
  })

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <span style={{
            position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', display: 'flex'
          }}>
            <IconSearch size={16} />
          </span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Tìm phiếu, phòng ban…"
            style={{
              width: '100%', height: 40, padding: '0 14px 0 36px',
              border: '1px solid var(--border)', borderRadius: 'var(--rad-md)',
              background: 'var(--surface)', color: 'var(--text)',
              fontSize: 14, outline: 'none', boxSizing: 'border-box'
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>
        <select
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          style={{
            height: 40, padding: '0 12px', flexShrink: 0,
            border: '1px solid var(--border)', borderRadius: 'var(--rad-md)',
            background: 'var(--surface)', color: 'var(--text)',
            fontSize: 14, outline: 'none', appearance: 'auto' as any,
          }}
        >
          <option value="">Tất cả phòng ban</option>
          {(departments ?? []).map(d => (
            <option key={d.id} value={d.name}>{d.name}</option>
          ))}
        </select>
        {hasPermission('create_request') && (
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 40, padding: '0 16px', border: 'none',
              borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              flexShrink: 0,
              boxShadow: '0 4px 12px color-mix(in srgb, var(--primary) 30%, transparent)'
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
          >
            <IconPlus size={16} />
            Tạo phiếu đề nghị
          </button>
        )}
      </div>

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_FILTER_KEYS.map(key => {
          const isActive = statusFilter === key
          return (
            <div
              key={key}
              onClick={() => setStatusFilter(key)}
              style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '5px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
                background: isActive ? 'var(--primary)' : 'var(--surface-2)',
                color: isActive ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`
              }}
            >
              {STATUS_FILTER_LABELS[key]}
            </div>
          )
        })}
      </div>

      {/* Loading / error */}
      {isLoading && (
        <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 14 }}>Đang tải…</div>
      )}
      {error && (
        <div style={{ padding: 24, color: '#dc2626', fontSize: 14 }}>{(error as Error).message}</div>
      )}

      {/* Table */}
      {!isLoading && !error && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--rad-lg)', overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: COL,
            padding: '0 18px', height: 44, alignItems: 'center',
            background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
            fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '.03em'
          }}>
            <div>Mã phiếu</div>
            <div>Phòng ban</div>
            <div>Ngày lập</div>
            <div style={{ textAlign: 'center' }}>SL</div>
            <div>Trạng thái</div>
            <div />
          </div>

          {/* Rows */}
          {filtered.length === 0 && (
            <div style={{ padding: '32px 18px', fontSize: 14, color: 'var(--text-muted)', textAlign: 'center' }}>
              Không có phiếu đề nghị nào.
            </div>
          )}
          {filtered.map(req => (
            <div
              key={req.id}
              onClick={() => navigate(`/requests/${req.id}`)}
              style={{
                display: 'grid', gridTemplateColumns: COL,
                padding: '0 18px', minHeight: 52, alignItems: 'center',
                borderBottom: '1px solid var(--border)',
                fontSize: 14, cursor: 'pointer'
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <div style={{
                fontFamily: "'Consolas','SF Mono',monospace",
                fontWeight: 700, fontSize: 13, color: 'var(--primary)'
              }}>
                {req.code}
              </div>
              <div style={{ color: 'var(--text)', fontWeight: 500 }}>{req.department || '—'}</div>
              <div style={{
                fontFamily: "'Consolas','SF Mono',monospace",
                fontSize: 12, color: 'var(--text-muted)'
              }}>{req.createdAt}</div>
              <div style={{ textAlign: 'center', fontWeight: 600 }}>{req.deviceCount}</div>
              <div><RequestBadge status={req.status} /></div>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 16 }}>›</div>
            </div>
          ))}

          {/* Footer */}
          <div style={{ padding: '12px 18px', fontSize: 13, color: 'var(--text-muted)' }}>
            {filtered.length} phiếu đề nghị
          </div>
        </div>
      )}

      {/* Create dialog */}
      {showCreate && <CreateRequestDialog onClose={() => setShowCreate(false)} />}
    </div>
  )
}
