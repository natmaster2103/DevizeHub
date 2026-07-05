import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRequests } from '@/hooks/useRequests'
import { useAuth } from '@/context/AuthContext'
import { requestEffectiveLabel, requestEffectiveBadgeStyle } from '@/lib/status'
import { IconSearch, IconPlus } from '@/lib/icons'
import { CreateRequestDialog, useDepartments } from '@/components/CreateRequestDialog'
import type { RequestRow, RequestStatus } from '@shared/ipc'

// ── Badge ─────────────────────────────────────────────────────────────────────
function RequestBadge({ status, allReturned }: { status: RequestRow['status']; allReturned: boolean }) {
  const { bg, fg } = requestEffectiveBadgeStyle(status, allReturned)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 999,
      fontSize: 12, fontWeight: 600,
      background: bg, color: fg
    }}>
      {requestEffectiveLabel(status, allReturned)}
    </span>
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
              <div><RequestBadge status={req.status} allReturned={req.allReturned} /></div>
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
