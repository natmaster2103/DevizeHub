import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { useDevice } from '@/hooks/useDevice'
import { useAuth } from '@/context/AuthContext'
import { StatusBadge } from '@/components/StatusBadge'
import { IconBox, IconBack, IconSwap, IconEdit, IconReturn, IconClock, IconChevronDown } from '@/lib/icons'
import { DeviceFormDialog } from '@/components/DeviceFormDialog'
import { ChangeStatusDialog } from '@/components/ChangeStatusDialog'
import { ReturnDialog } from '@/components/ReturnDialog'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { api, unwrap } from '@/lib/api'
import type { DeviceHistoryEntry, ReturnDeviceArgs } from '@shared/ipc'

type HistType = DeviceHistoryEntry['type']

const HIST_STYLE: Record<HistType, { color: string }> = {
  allocate: { color: '#2563eb' },
  return: { color: '#16a34a' },
  maintenance: { color: '#ca8a04' },
  create: { color: '#64748b' }
}

type Tab = 'info' | 'history'

export default function DeviceDetail() {
  const { sku } = useParams<{ sku: string }>()
  const navigate = useNavigate()
  const { isAdmin, hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const [showFormDialog, setShowFormDialog] = useState(false)
  const [showStatusDialog, setShowStatusDialog] = useState(false)
  const [showReturnDialog, setShowReturnDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set())
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: catalogData } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => unwrap(api.catalog.list()),
    enabled: showFormDialog,
  })
  const categories = catalogData?.categories ?? []

  const updateMutation = useMutation({
    mutationFn: (args: Parameters<typeof api.devices.update>[0]) => unwrap(api.devices.update(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', sku] })
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setShowFormDialog(false)
    },
  })

  const changeStatusMutation = useMutation({
    mutationFn: (args: Parameters<typeof api.devices.changeStatus>[0]) => unwrap(api.devices.changeStatus(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', sku] })
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setShowStatusDialog(false)
    },
  })

  const returnMutation = useMutation({
    mutationFn: (args: ReturnDeviceArgs) => unwrap(api.requests.returnDevice(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', sku] })
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['requests'] })
      setShowReturnDialog(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => unwrap(api.devices.delete({ sku: sku! })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      navigate('/devices')
    },
  })

  const { data, isLoading, error } = useDevice(sku!)
  const [tab, setTab] = useState<Tab>('info')

  if (isLoading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 14 }}>Đang tải…</div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 24, color: '#dc2626', fontSize: 14 }}>{(error as Error).message}</div>
    )
  }

  if (!data) return null

  const { device, info, history } = data

  // DD/MM/YYYY → YYYY-MM-DD để so sánh với <input type="date">
  const toISO = (d: string) => { const [dd, mm, yyyy] = d.split('/'); return `${yyyy}-${mm}-${dd}` }
  const isFiltered = dateFrom !== '' || dateTo !== ''
  const filteredHistory = history.filter(e => {
    const iso = toISO(e.date)
    if (dateFrom && iso < dateFrom) return false
    if (dateTo && iso > dateTo) return false
    return true
  })

  const groups = filteredHistory.reduce<{ date: string; entries: typeof history }[]>((acc, entry) => {
    const last = acc[acc.length - 1]
    if (last?.date === entry.date) last.entries.push(entry)
    else acc.push({ date: entry.date, entries: [entry] })
    return acc
  }, [])

  const toggleDate = (date: string) => {
    setCollapsedDates(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  const tabStyle = (t: Tab) => ({
    padding: '10px 2px', marginRight: 22, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', borderBottom: `2px solid ${tab === t ? 'var(--primary)' : 'transparent'}`,
    color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
    marginBottom: -1
  })

  return (
    <div style={{ maxWidth: tab === 'history' ? 1280 : 1000, margin: '0 auto', transition: 'max-width .2s' }}>
      {/* Back link */}
      <div
        onClick={() => navigate('/devices')}
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

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 16, marginBottom: 20
      }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 13,
            background: 'var(--primary-soft)', color: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <IconBox size={28} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.01em' }}>{device.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5 }}>
              <span style={{ fontFamily: "'Consolas',monospace", fontSize: 13, color: 'var(--text-muted)' }}>
                {device.sku}
              </span>
              <StatusBadge status={device.status} />
            </div>
          </div>
        </div>

        {(hasPermission('return_device') || hasPermission('change_status') || hasPermission('edit_device') || hasPermission('delete_device')) && (
          <div style={{ display: 'flex', gap: 8 }}>
            {device.status === 'allocated' && device.activeAllocationId != null && hasPermission('return_device') && (
              <button
                onClick={() => setShowReturnDialog(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 38, padding: '0 14px',
                  border: '1px solid var(--border)', borderRadius: 'var(--rad-md)',
                  background: 'var(--surface)', color: 'var(--text)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
              >
                <IconReturn size={15} />
                <span>Thu hồi</span>
              </button>
            )}
            {hasPermission('change_status') && (
              <button
                onClick={() => setShowStatusDialog(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 38, padding: '0 14px',
                  border: '1px solid var(--border)', borderRadius: 'var(--rad-md)',
                  background: 'var(--surface)', color: 'var(--text)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
              >
                <IconSwap size={15} />
                <span>Đổi trạng thái</span>
              </button>
            )}
            {hasPermission('edit_device') && (
              <button
                onClick={() => setShowFormDialog(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 38, padding: '0 14px', border: 'none',
                  borderRadius: 'var(--rad-md)', background: 'var(--primary)',
                  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
              >
                <IconEdit size={15} />
                <span>Chỉnh sửa</span>
              </button>
            )}
            {hasPermission('delete_device') && (
              <button
                onClick={() => setShowDeleteDialog(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 38, padding: '0 14px',
                  border: '1px solid #dc2626', borderRadius: 'var(--rad-md)',
                  background: 'var(--surface)', color: '#dc2626',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,38,38,.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
              >
                <span>Xoá</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <div onClick={() => setTab('info')} style={tabStyle('info')}>Thông tin</div>
        <div onClick={() => setTab('history')} style={tabStyle('history')}>Lịch sử</div>
      </div>

      {/* Info tab */}
      {tab === 'info' && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--rad-lg)', padding: '8px 24px'
        }}>
          {info.map((field, idx) => {
            const isStatus = field.isStatus === true
            return (
              <div key={idx} style={{
                display: 'grid', gridTemplateColumns: '200px 1fr',
                gap: 16, padding: '14px 0',
                borderBottom: idx < info.length - 1 ? '1px solid var(--border)' : 'none',
                alignItems: 'center'
              }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{field.key}</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  {isStatus
                    ? <StatusBadge status={device.status} />
                    : field.value
                  }
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--rad-lg)', padding: '16px 24px'
        }}>
          {/* Date filter toolbar */}
          {history.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid var(--border)'
            }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)' }}>Lọc theo ngày</span>
              <input
                type="date" value={dateFrom} max={dateTo || undefined}
                onChange={e => setDateFrom(e.target.value)}
                style={{
                  height: 32, padding: '0 8px', fontSize: 13,
                  border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                  background: 'var(--surface)', color: 'var(--text)'
                }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>→</span>
              <input
                type="date" value={dateTo} min={dateFrom || undefined}
                onChange={e => setDateTo(e.target.value)}
                style={{
                  height: 32, padding: '0 8px', fontSize: 13,
                  border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                  background: 'var(--surface)', color: 'var(--text)'
                }}
              />
              {isFiltered && (
                <>
                  <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                    {filteredHistory.length} sự kiện
                  </span>
                  <button
                    onClick={() => { setDateFrom(''); setDateTo('') }}
                    style={{
                      height: 32, padding: '0 12px', fontSize: 12.5, fontWeight: 600,
                      border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                      background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer'
                    }}
                  >
                    Xoá lọc
                  </button>
                </>
              )}
            </div>
          )}

          {history.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 8, padding: '32px 0', color: 'var(--text-muted)'
            }}>
              <IconClock size={32} />
              <span style={{ fontSize: 14 }}>Chưa có lịch sử</span>
            </div>
          ) : groups.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 8, padding: '32px 0', color: 'var(--text-muted)'
            }}>
              <IconClock size={32} />
              <span style={{ fontSize: 14 }}>Không có lịch sử trong khoảng đã chọn</span>
            </div>
          ) : groups.map(group => {
            const isCollapsed = collapsedDates.has(group.date)
            return (
              <div key={group.date} style={{ marginBottom: 18 }}>
                {/* Day header */}
                <div
                  onClick={() => toggleDate(group.date)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    cursor: 'pointer', padding: '6px 0', marginBottom: isCollapsed ? 0 : 12,
                    userSelect: 'none'
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {group.date}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: 999, padding: '1px 8px'
                  }}>
                    {group.entries.length}
                  </span>
                  <div style={{
                    color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                    transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s'
                  }}>
                    <IconChevronDown size={13} />
                  </div>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>

                {/* Entries — compact text log, in columns to fill the width */}
                {!isCollapsed && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                    columnGap: 28, rowGap: 2
                  }}>
                    {group.entries.map((entry, idx) => {
                      const { color } = HIST_STYLE[entry.type]
                      return (
                        <div key={idx} style={{
                          display: 'flex', gap: 10, alignItems: 'baseline',
                          padding: '7px 0', borderBottom: '1px dashed var(--border)'
                        }}>
                          {/* time */}
                          <span style={{
                            fontFamily: "'Consolas',monospace", fontSize: 12,
                            color: 'var(--text-muted)', flexShrink: 0, width: 38, textAlign: 'right'
                          }}>
                            {entry.time}
                          </span>
                          {/* colored type dot */}
                          <span style={{
                            width: 7, height: 7, borderRadius: '50%', background: color,
                            flexShrink: 0, alignSelf: 'center'
                          }} />
                          {/* title + flow + inline detail */}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color }}>{entry.title}</span>
                            {entry.flow && (
                              <span style={{ fontSize: 12.5, color: 'var(--text)', marginLeft: 8 }}>
                                <span style={{ fontWeight: 600 }}>{entry.flow.from}</span>
                                <span style={{ color, margin: '0 7px', fontWeight: 700 }}>→</span>
                                <span style={{ fontWeight: 600 }}>{entry.flow.to}</span>
                              </span>
                            )}
                            {entry.detail.length > 0 && (
                              <span style={{ fontSize: 12.5, color: 'var(--text)', marginLeft: 10 }}>
                                {entry.detail.map((d, i) => (
                                  <span key={i}>
                                    {i > 0 && <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>·</span>}
                                    {i === 0 && entry.flow && <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>·</span>}
                                    {d.value}
                                  </span>
                                ))}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showFormDialog && data && (
        <DeviceFormDialog
          mode="edit"
          initial={{
            sku: data.device.sku,
            name: data.device.name,
            categoryId: data.device.categoryId,
            serialNumber: data.device.serialNumber,
            notes: data.device.notes,
            groupId: data.device.groupId,
          }}
          categories={categories}
          groups={catalogData?.groups ?? []}
          loading={updateMutation.isPending}
          error={updateMutation.isError ? (updateMutation.error as Error).message : ''}
          onClose={() => { setShowFormDialog(false); updateMutation.reset() }}
          onSubmit={args => updateMutation.mutate(args)}
        />
      )}
      {showStatusDialog && data && (
        <ChangeStatusDialog
          sku={data.device.sku}
          deviceName={data.device.name}
          currentStatus={data.device.status}
          isAllocated={data.device.status === 'allocated'}
          loading={changeStatusMutation.isPending}
          error={changeStatusMutation.isError ? (changeStatusMutation.error as Error).message : ''}
          onClose={() => { setShowStatusDialog(false); changeStatusMutation.reset() }}
          onConfirm={args => changeStatusMutation.mutate(args)}
        />
      )}
      {showReturnDialog && data && data.device.activeAllocationId != null && (
        <ReturnDialog
          allocationId={data.device.activeAllocationId}
          deviceName={data.device.name}
          deviceSku={data.device.sku}
          recipient={data.device.holder ?? '—'}
          contextLabel={`Phòng ban: ${data.device.department ?? '—'}`}
          onClose={() => { setShowReturnDialog(false); returnMutation.reset() }}
          onConfirm={args => returnMutation.mutate(args)}
          loading={returnMutation.isPending}
        />
      )}
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
      {showDeleteDialog && data && (
        <ConfirmDeleteDialog
          deviceName={data.device.name}
          deviceSku={data.device.sku}
          loading={deleteMutation.isPending}
          error={deleteMutation.isError ? (deleteMutation.error as Error).message : ''}
          onClose={() => { setShowDeleteDialog(false); deleteMutation.reset() }}
          onConfirm={() => deleteMutation.mutate()}
        />
      )}
    </div>
  )
}
