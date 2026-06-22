import { useState } from 'react'
import { useDashboard } from '@/hooks/useDashboard'
import type { DeptCard, DeptCardRequest, DashboardSummary } from '@shared/ipc'
import {
  IconBox, IconCheck, IconWrench, IconAlert, IconReturn, IconBuilding
} from '@/lib/icons'

const PAGE_SIZE = 6

type StatKey = 'total' | 'allocated' | 'maintenance' | 'broken'

interface StatDef {
  label: string
  key: StatKey
  Icon: React.ComponentType<{ size?: number }>
  color: string
  tint: string
  getDelta?: (stats: DashboardSummary['stats']) => { delta: string; deltaLabel: string } | null
}

const STAT_DEFS: StatDef[] = [
  { label: 'Tổng thiết bị', key: 'total', Icon: IconBox, color: 'var(--primary)', tint: 'var(--primary-tint)' },
  {
    label: 'Đang cấp phát', key: 'allocated', Icon: IconCheck, color: '#16a34a', tint: 'rgba(22,163,74,.14)',
    getDelta: (s) => s.total > 0
      ? { delta: `${Math.round(s.allocated / s.total * 100)}%`, deltaLabel: 'tỷ lệ sử dụng' }
      : null,
  },
  { label: 'Đang bảo trì', key: 'maintenance', Icon: IconWrench, color: '#ca8a04', tint: 'rgba(202,138,4,.18)' },
  { label: 'Hỏng/Thanh lý', key: 'broken', Icon: IconAlert, color: '#dc2626', tint: 'rgba(220,38,38,.14)' },
]

function DeptCardPanel({ card }: { card: DeptCard }) {
  const firstCode = card.requests[0]?.code ?? ''
  const [activeCode, setActiveCode] = useState(firstCode)
  const [page, setPage] = useState(1)

  const req: DeptCardRequest | undefined =
    card.requests.find(r => r.code === activeCode) ?? card.requests[0]

  const items = req?.items ?? []
  const totalPages = Math.ceil(items.length / PAGE_SIZE)
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const hasPager = items.length > PAGE_SIZE

  function switchChip(code: string) {
    setActiveCode(code)
    setPage(1)
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--rad-lg)', padding: 18,
      display: 'flex', flexDirection: 'column', gap: 14,
      height: 430, overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, flexShrink: 0, borderRadius: 'var(--rad-md)',
          background: 'var(--primary-soft)', color: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <IconBuilding size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 700,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>{card.dept}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
            {card.share}% tổng cấp phát
          </div>
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1 }}>
          {card.count}
        </div>
      </div>

      {/* Chips label */}
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '.03em'
      }}>{`Phiếu đề nghị (${String(card.requests.length).padStart(2, '0')})`}</div>

      {/* Request chips */}
      <div style={{
        display: 'flex', flexWrap: 'nowrap', gap: 6,
        overflowX: 'auto', paddingBottom: 2
      }}>
        {card.requests.map(r => {
          const isActive = r.code === activeCode
          return (
            <div
              key={r.code}
              onClick={() => switchChip(r.code)}
              style={{
                flexShrink: 0, padding: '4px 10px', borderRadius: 999,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                fontFamily: "'Consolas', monospace",
                background: isActive ? 'var(--primary)' : 'var(--surface-2)',
                color: isActive ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                whiteSpace: 'nowrap'
              }}
            >
              {r.code}
            </div>
          )
        })}
      </div>

      {/* Meta line */}
      {req && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, fontSize: 12, color: 'var(--text-muted)'
        }}>
          <span>{req.date} · {req.items.length} thiết bị</span>
          {req.status === 'allocated' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '2px 8px', borderRadius: 999,
              fontSize: 11, fontWeight: 600,
              background: 'rgba(37,99,235,.14)', color: '#2563eb'
            }}>
              Đang trang bị
            </span>
          )}
        </div>
      )}

      {/* Items — scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* empty state */}
        {pageItems.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', gap: 10, color: 'var(--text-muted)', padding: '24px 0'
          }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
              <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
            </svg>
            <span style={{ fontSize: 13 }}>Không có thiết bị được cấp phát</span>
          </div>
        )}
        {pageItems.map((item, idx) => (
          <div key={idx} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px',
            borderRadius: 'var(--rad-sm)', background: 'var(--surface-2)',
            border: '1px solid var(--border)'
          }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{
                  fontSize: 13, fontWeight: 600,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>{item.name}</span>
                <span style={{
                  fontSize: 11, color: 'var(--text-muted)',
                  whiteSpace: 'nowrap', flexShrink: 0,
                  fontFamily: "'Consolas', monospace"
                }}>{item.datetime}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  Mượn: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{item.borrower}</span>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  Cấp: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{item.lender}</span>
                </span>
              </div>
            </div>
            <button
              onClick={() => { /* TODO: wire Return Dialog in Task 7 */ }}
              style={{
                flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
                height: 30, padding: '0 11px',
                border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                background: 'var(--surface)', color: 'var(--text)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--primary)'
                e.currentTarget.style.color = 'var(--primary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.color = 'var(--text)'
              }}
            >
              <IconReturn size={14} />
              <span>Trả về</span>
            </button>
          </div>
        ))}
      </div>

      {/* Pager */}
      {hasPager && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, marginTop: 2
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Trang {page}/{totalPages} · {items.length} mục
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                background: 'none', cursor: page === 1 ? 'default' : 'pointer',
                color: page === 1 ? 'var(--text-muted)' : 'var(--text)', fontSize: 14
              }}
            >‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                onClick={() => setPage(n)}
                style={{
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                  background: n === page ? 'var(--primary)' : 'none',
                  color: n === page ? '#fff' : 'var(--text)',
                  cursor: 'pointer', fontSize: 13, fontWeight: n === page ? 700 : 400
                }}
              >{n}</button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                background: 'none', cursor: page === totalPages ? 'default' : 'pointer',
                color: page === totalPages ? 'var(--text-muted)' : 'var(--text)', fontSize: 14
              }}
            >›</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { data, isLoading, error } = useDashboard()
  const [lendOpen, setLendOpen] = useState(false)

  if (isLoading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 14 }}>
        Đang tải…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 24, color: '#dc2626', fontSize: 14 }}>
        {(error as Error).message}
      </div>
    )
  }

  if (!data) return null

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto' }}>
      {/* Stat cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
        gap: 16, marginBottom: 18
      }}>
        {STAT_DEFS.map(({ label, key, Icon, color, tint, getDelta }) => {
          const value = key === 'broken'
            ? (data.stats.broken ?? 0) + (data.stats.decommissioned ?? 0)
            : data.stats[key]
          const deltaInfo = getDelta?.(data.stats) ?? null
          return (
          <div key={key} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--rad-lg)', padding: '18px 18px 16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
                <div style={{
                  fontSize: 30, fontWeight: 700, letterSpacing: '-.02em',
                  marginTop: 6, lineHeight: 1
                }}>{value}</div>
              </div>
              <div style={{
                width: 42, height: 42, borderRadius: 'var(--rad-md)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: tint, color
              }}>
                <Icon size={20} />
              </div>
            </div>
            {deltaInfo && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                marginTop: 12, fontSize: 12, color: 'var(--text-muted)'
              }}>
                <span style={{ color, fontWeight: 600 }}>{deltaInfo.delta}</span>
                {deltaInfo.deltaLabel}
              </div>
            )}
          </div>
        )})}
      </div>

      {/* Dept section */}
      {data.deptCards.length > 0 && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            margin: '20px 0 14px'
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                Thiết bị đang trang bị theo phòng ban
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {data.deptAllocTotal} thiết bị đang được cấp phát · top {data.deptCards.length} phòng ban
              </div>
            </div>
            <button
              onClick={() => setLendOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 34, padding: '0 12px', border: 'none',
                borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
                color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Cấp phát
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
            {data.deptCards.map(card => (
              <DeptCardPanel key={card.dept} card={card} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
