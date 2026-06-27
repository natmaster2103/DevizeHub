import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRequest, useAvailableDevices } from '@/hooks/useRequest'
import { useAuth } from '@/context/AuthContext'
import { REQUEST_STATUS_LABELS, requestBadgeStyle } from '@/lib/status'
import { IconBack, IconReturn, IconPlus, IconSearch, IconPrint } from '@/lib/icons'
import { printRequest } from '@/lib/print'
import { api, unwrap } from '@/lib/api'
import type { RequestDeviceLine, RequestDetail, ReturnDeviceArgs, AddToRequestArgs } from '@shared/ipc'
import { ReturnDialog } from '@/components/ReturnDialog'

// ── X button icon ────────────────────────────────────────────────────────────
function IconX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// ── Add Device Dialog ─────────────────────────────────────────────────────────
interface AddDeviceDialogProps {
  requestDetail: RequestDetail
  onClose(): void
  onConfirm(args: AddToRequestArgs): void
  loading: boolean
}

function AddDeviceDialog({ requestDetail, onClose, onConfirm, loading }: AddDeviceDialogProps) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const { data } = useAvailableDevices(true)

  const devices = (data?.devices ?? []).filter(d => {
    const q = search.toLowerCase()
    return (
      d.sku.toLowerCase().includes(q) ||
      d.name.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q)
    )
  })

  function toggle(sku: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(sku) ? next.delete(sku) : next.add(sku)
      return next
    })
  }

  const availableCount = data?.devices.length ?? 0

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(15,23,42,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 560, maxHeight: '80vh', background: 'var(--surface)',
          borderRadius: 'var(--rad-lg)', boxShadow: '0 24px 60px rgba(0,0,0,.3)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Thêm thiết bị vào phiếu</div>
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
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Phiếu <span style={{
              fontFamily: "'Consolas',monospace", fontWeight: 700, color: 'var(--primary)'
            }}>{requestDetail.code}</span> · {availableCount} thiết bị sẵn có trong kho
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)', display: 'flex'
            }}>
              <IconSearch size={15} />
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm thiết bị…"
              style={{
                width: '100%', height: 36, padding: '0 12px 0 32px',
                border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                background: 'var(--surface-2)', color: 'var(--text)',
                fontSize: 13, outline: 'none', boxSizing: 'border-box'
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>
        </div>

        {/* Device list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {devices.length === 0 && (
            <div style={{ padding: '20px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
              Không có thiết bị phù hợp.
            </div>
          )}
          {devices.map(dev => {
            const isChecked = selected.has(dev.sku)
            return (
              <label
                key={dev.sku}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 20px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: isChecked ? 'var(--primary-soft2, rgba(37,99,235,.06))' : 'none'
                }}
                onMouseEnter={e => { if (!isChecked) (e.currentTarget.style.background = 'var(--hoverbg)') }}
                onMouseLeave={e => { if (!isChecked) (e.currentTarget.style.background = 'none') }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(dev.sku)}
                  style={{ accentColor: 'var(--primary)', width: 16, height: 16, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{dev.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    <span style={{ fontFamily: "'Consolas',monospace" }}>{dev.sku}</span>
                    {dev.category ? ` · ${dev.category}` : ''}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                  background: 'rgba(22,163,74,.14)', color: '#16a34a'
                }}>Trong kho</span>
              </label>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0
        }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Đã chọn: {selected.size} thiết bị
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
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
              onClick={() => onConfirm({ requestId: requestDetail.id, deviceSkus: [...selected] })}
              disabled={loading || selected.size === 0}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 38, padding: '0 16px', border: 'none',
                borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: (loading || selected.size === 0) ? 'not-allowed' : 'pointer',
                opacity: (loading || selected.size === 0) ? 0.6 : 1
              }}
              onMouseEnter={e => { if (!loading && selected.size > 0) (e.currentTarget.style.background = 'var(--primary-hover)') }}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
            >
              <IconPlus size={14} />
              {loading ? 'Đang thêm…' : 'Thêm vào phiếu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Device line row ───────────────────────────────────────────────────────────
const LINE_COL = '130px 1.5fr 1fr 1fr 110px'

function DeviceTable({
  lines,
  onReturn,
}: {
  lines: RequestDeviceLine[]
  onReturn(line: RequestDeviceLine): void
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--rad-lg)', overflow: 'hidden', marginTop: 18
    }}>
      {/* Header */}
      <div style={{
        display: 'grid', gridTemplateColumns: LINE_COL,
        padding: '0 18px', height: 44, alignItems: 'center',
        background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
        fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '.03em'
      }}>
        <div>SKU</div>
        <div>Tên thiết bị</div>
        <div>Loại</div>
        <div>Người nhận</div>
        <div style={{ textAlign: 'right' }}>Thao tác</div>
      </div>

      {lines.length === 0 && (
        <div style={{ padding: '20px 18px', fontSize: 13, color: 'var(--text-muted)' }}>
          Chưa có thiết bị nào trong phiếu này.
        </div>
      )}

      {lines.map(line => (
        <div
          key={line.allocationId}
          style={{
            display: 'grid', gridTemplateColumns: LINE_COL,
            padding: '0 18px', minHeight: 52, alignItems: 'center',
            borderBottom: '1px solid var(--border)', fontSize: 14,
            opacity: line.isReturned ? 0.55 : 1
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
          onMouseLeave={e => (e.currentTarget.style.background = '')}
        >
          <div style={{
            fontFamily: "'Consolas','SF Mono',monospace",
            fontSize: 12, fontWeight: 600, color: 'var(--text-muted)'
          }}>{line.deviceSku}</div>
          <div style={{ fontWeight: 600 }}>{line.deviceName}</div>
          <div style={{ color: 'var(--text-muted)' }}>{line.category}</div>
          <div style={{ color: 'var(--text-muted)' }}>{line.recipient || '—'}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {!line.isReturned && (
              <button
                onClick={() => onReturn(line)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  height: 30, padding: '0 11px',
                  border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                  background: 'var(--surface)', color: 'var(--text)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
              >
                <IconReturn size={13} />
                <span>Trả về</span>
              </button>
            )}
            {line.isReturned && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Đã trả</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RequestDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin, hasPermission } = useAuth()
  const queryClient = useQueryClient()

  const requestId = id ? Number(id) : null
  const { data, isLoading, error } = useRequest(requestId)

  const [returnTarget, setReturnTarget] = useState<{
    allocationId: number
    deviceName: string
    deviceSku: string
    recipient: string
  } | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)

  const returnMutation = useMutation({
    mutationFn: (args: ReturnDeviceArgs) => unwrap(api.requests.returnDevice(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request', requestId] })
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      queryClient.invalidateQueries({ queryKey: ['requests'] })
      setReturnTarget(null)
    }
  })

  const addMutation = useMutation({
    mutationFn: (args: AddToRequestArgs) => unwrap(api.requests.addDevices(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request', requestId] })
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      queryClient.invalidateQueries({ queryKey: ['requests'] })
      queryClient.invalidateQueries({ queryKey: ['requests', 'available-devices'] })
      setShowAddDialog(false)
    }
  })

  if (isLoading) {
    return <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 14 }}>Đang tải…</div>
  }
  if (error) {
    return <div style={{ padding: 24, color: '#dc2626', fontSize: 14 }}>{(error as Error).message}</div>
  }
  if (!data) return null

  const { bg, fg } = requestBadgeStyle(data.status)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Back */}
      <div
        onClick={() => navigate('/requests')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          fontSize: 13, fontWeight: 600, color: 'var(--text-muted)',
          cursor: 'pointer', marginBottom: 16
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        <IconBack size={16} />
        <span>Quay lại danh sách</span>
      </div>

      {/* Header card */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--rad-lg)', padding: '18px 22px'
      }}>
        {/* Top row: code + badge + print/add buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              fontSize: 22, fontWeight: 700, letterSpacing: '-.01em',
              fontFamily: "'Consolas','SF Mono',monospace", color: 'var(--primary)'
            }}>
              {data.code}
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '3px 10px', borderRadius: 999,
              fontSize: 12, fontWeight: 600,
              background: bg, color: fg
            }}>
              {REQUEST_STATUS_LABELS[data.status]}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={() => printRequest(data)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                height: 38, padding: '0 14px',
                border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                background: 'none', color: 'var(--text)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <IconPrint size={14} />
              In phiếu
            </button>
            {hasPermission('create_request') && (
              <button
                onClick={() => setShowAddDialog(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  height: 38, padding: '0 14px',
                  border: '2px dashed var(--primary)', borderRadius: 'var(--rad-sm)',
                  background: 'none', color: 'var(--primary)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-soft2, rgba(37,99,235,.06))')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <IconPlus size={14} />
                Thêm thiết bị
              </button>
            )}
          </div>
        </div>

        {/* Meta grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
          gap: '16px 12px', marginTop: 18, paddingTop: 16,
          borderTop: '1px solid var(--border)'
        }}>
          {[
            { label: 'Phòng ban', value: data.department || '—' },
            { label: 'Ngày lập', value: data.createdAt },
            { label: 'Số thiết bị', value: String(data.deviceCount) },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Notes */}
        {data.notes && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4 }}>Ghi chú</div>
            <div style={{ fontSize: 14, color: 'var(--text)' }}>{data.notes}</div>
          </div>
        )}
      </div>

      {/* Device table */}
      <DeviceTable
        lines={data.lines}
        onReturn={line => setReturnTarget({
          allocationId: line.allocationId,
          deviceName: line.deviceName,
          deviceSku: line.deviceSku,
          recipient: line.recipient,
        })}
      />

      {/* Return Dialog */}
      {returnTarget && (
        <ReturnDialog
          allocationId={returnTarget.allocationId}
          deviceName={returnTarget.deviceName}
          deviceSku={returnTarget.deviceSku}
          recipient={returnTarget.recipient}
          contextLabel={`Phiếu liên kết: ${data.code}`}
          onClose={() => setReturnTarget(null)}
          onConfirm={args => returnMutation.mutate(args)}
          loading={returnMutation.isPending}
        />
      )}

      {/* Add Device Dialog */}
      {showAddDialog && (
        <AddDeviceDialog
          requestDetail={data}
          onClose={() => setShowAddDialog(false)}
          onConfirm={args => addMutation.mutate(args)}
          loading={addMutation.isPending}
        />
      )}

      {/* Mutation error toasts */}
      {returnMutation.isError && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 200,
          background: '#dc2626', color: '#fff', padding: '12px 18px',
          borderRadius: 'var(--rad-md)', fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,.2)'
        }}>
          {(returnMutation.error as Error).message}
        </div>
      )}
      {addMutation.isError && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 200,
          background: '#dc2626', color: '#fff', padding: '12px 18px',
          borderRadius: 'var(--rad-md)', fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,.2)'
        }}>
          {(addMutation.error as Error).message}
        </div>
      )}
    </div>
  )
}
