import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { useDevice } from '@/hooks/useDevice'
import { useAuth } from '@/context/AuthContext'
import { StatusBadge } from '@/components/StatusBadge'
import { IconBox, IconBack, IconSwap, IconEdit, IconCheck, IconDown, IconWrench } from '@/lib/icons'
import { DeviceFormDialog } from '@/components/DeviceFormDialog'
import { ChangeStatusDialog } from '@/components/ChangeStatusDialog'
import { api, unwrap } from '@/lib/api'
import type { DeviceHistoryEntry } from '@shared/ipc'

type HistType = DeviceHistoryEntry['type']

const HIST_STYLE: Record<HistType, { color: string; tint: string }> = {
  allocate:    { color: '#2563eb', tint: 'rgba(37,99,235,.14)' },
  return:      { color: '#16a34a', tint: 'rgba(22,163,74,.14)' },
  maintenance: { color: '#ca8a04', tint: 'rgba(202,138,4,.18)' },
  create:      { color: '#64748b', tint: 'rgba(100,116,139,.18)' }
}

function HistIcon({ type }: { type: HistType }) {
  const size = 18
  if (type === 'allocate')    return <IconCheck size={size} />
  if (type === 'return')      return <IconDown size={size} />
  if (type === 'maintenance') return <IconWrench size={size} />
  return <IconBox size={size} />
}

type Tab = 'info' | 'history'

export default function DeviceDetail() {
  const { sku } = useParams<{ sku: string }>()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [showFormDialog, setShowFormDialog] = useState(false)
  const [showStatusDialog, setShowStatusDialog] = useState(false)

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

  const tabStyle = (t: Tab) => ({
    padding: '10px 2px', marginRight: 22, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', borderBottom: `2px solid ${tab === t ? 'var(--primary)' : 'transparent'}`,
    color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
    marginBottom: -1
  })

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
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

        {isAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
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
          borderRadius: 'var(--rad-lg)', padding: '24px 24px 8px'
        }}>
          {history.map((entry, idx) => {
            const { color, tint } = HIST_STYLE[entry.type]
            const isLast = idx === history.length - 1
            return (
              <div key={idx} style={{ display: 'flex', gap: 14, paddingBottom: 20, position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: 34, height: 34, flexShrink: 0, borderRadius: 'var(--rad-md)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: tint, color, zIndex: 1
                  }}>
                    <HistIcon type={entry.type} />
                  </div>
                  {!isLast && (
                    <div style={{ flex: 1, width: 2, background: 'var(--border)', marginTop: 4 }} />
                  )}
                </div>
                <div style={{ paddingTop: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{entry.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{entry.sub}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{entry.date}</div>
                </div>
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
          }}
          categories={categories}
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
    </div>
  )
}
