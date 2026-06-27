import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  useReactTable, getCoreRowModel, createColumnHelper, flexRender
} from '@tanstack/react-table'
import { useDevices } from '@/hooks/useDevices'
import { useAuth } from '@/context/AuthContext'
import { StatusBadge } from '@/components/StatusBadge'
import { STATUS_LABELS } from '@/lib/status'
import { IconScan, IconSearch, IconPlus, IconView, IconEdit, IconSwap, IconReturn } from '@/lib/icons'
import { DeviceFormDialog } from '@/components/DeviceFormDialog'
import { ChangeStatusDialog } from '@/components/ChangeStatusDialog'
import { ReturnDialog } from '@/components/ReturnDialog'
import { api, unwrap } from '@/lib/api'
import type { DeviceRow, DeviceStatus, ReturnDeviceArgs } from '@shared/ipc'

const FILTER_KEYS: Array<'all' | DeviceStatus> = [
  'all', 'available', 'allocated', 'maintenance', 'broken', 'decommissioned'
]

const FILTER_LABELS: Record<'all' | DeviceStatus, string> = {
  all: 'Tất cả',
  ...STATUS_LABELS
}

const colHelper = createColumnHelper<DeviceRow>()

export default function Devices() {
  const navigate = useNavigate()
  const { isAdmin, hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | DeviceStatus>('all')

  const [categoryFilter, setCategoryFilter] = useState<number | null>(null)
  const [groupId, setGroupId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  // Reset về trang 1 khi filter hoặc query thay đổi
  useEffect(() => { setPage(1) }, [filter, query, categoryFilter])
  // Reset groupId khi đổi loại
  useEffect(() => { setGroupId(null); setPage(1) }, [categoryFilter])

  const { data, isLoading, error } = useDevices(filter, query, page, PAGE_SIZE, categoryFilter, groupId)
  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE)

  const { data: catalogData } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => unwrap(api.catalog.list()),
  })
  const categories = catalogData?.categories ?? []
  const groupsForCategory = (catalogData?.groups ?? []).filter((g) => g.categoryId === categoryFilter)

  const [formDialog, setFormDialog] = useState<
    null | { mode: 'create' } | { mode: 'edit'; device: DeviceRow }
  >(null)
  const [statusDialog, setStatusDialog] = useState<DeviceRow | null>(null)
  const [returnDialog, setReturnDialog] = useState<DeviceRow | null>(null)

  const createMutation = useMutation({
    mutationFn: (args: Parameters<typeof api.devices.create>[0]) => unwrap(api.devices.create(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setFormDialog(null)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (args: Parameters<typeof api.devices.update>[0]) => unwrap(api.devices.update(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setFormDialog(null)
    },
  })

  const changeStatusMutation = useMutation({
    mutationFn: (args: Parameters<typeof api.devices.changeStatus>[0]) => unwrap(api.devices.changeStatus(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setStatusDialog(null)
    },
  })

  const returnMutation = useMutation({
    mutationFn: (args: ReturnDeviceArgs) => unwrap(api.requests.returnDevice(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['requests'] })
      setReturnDialog(null)
    },
  })

  const columns = [
    colHelper.accessor('sku', {
      header: 'SKU',
      cell: info => (
        <span style={{ fontFamily: "'Consolas','SF Mono',monospace", fontWeight: 600, fontSize: 13 }}>
          {info.getValue()}
        </span>
      )
    }),
    colHelper.accessor('name', {
      header: 'Tên thiết bị',
      cell: info => <span style={{ fontWeight: 600 }}>{info.getValue()}</span>
    }),
    colHelper.display({
      id: 'categoryGroup',
      header: 'Loại / Nhóm',
      cell: ({ row }) => (
        <div style={{ lineHeight: 1.3 }}>
          <div style={{ color: 'var(--text)', fontWeight: 500 }}>{row.original.category || '—'}</div>
          {row.original.group && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.original.group}</div>
          )}
        </div>
      )
    }),
    colHelper.accessor('status', {
      header: 'Trạng thái',
      cell: info => <StatusBadge status={info.getValue()} />
    }),
    colHelper.display({
      id: 'deptHolder',
      header: 'Phòng / Người giữ',
      cell: ({ row }) => (
        <div style={{ lineHeight: 1.3 }}>
          <div style={{ color: 'var(--text)', fontWeight: 500 }}>{row.original.department ?? '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.original.holder ?? '—'}</div>
        </div>
      )
    }),
    colHelper.display({
      id: 'actions',
      header: () => <span style={{ float: 'right' }}>Thao tác</span>,
      cell: ({ row }) => (
        <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
          <button
            title="Xem"
            onClick={() => navigate('/devices/' + row.original.sku)}
            style={{
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
              cursor: 'pointer', color: 'var(--text-muted)', background: 'none'
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <IconView size={15} />
          </button>
          {hasPermission('return_device') && row.original.status === 'allocated' && row.original.activeAllocationId != null && (
            <button
              title="Thu hồi"
              onClick={() => setReturnDialog(row.original)}
              style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                cursor: 'pointer', color: 'var(--text-muted)', background: 'none'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <IconReturn size={15} />
            </button>
          )}
          {hasPermission('edit_device') && (
            <button
              title="Sửa"
              onClick={() => setFormDialog({ mode: 'edit', device: row.original })}
              style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                cursor: 'pointer', color: 'var(--text-muted)', background: 'none'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <IconEdit size={15} />
            </button>
          )}
          {hasPermission('change_status') && (
            <button
              title="Đổi trạng thái"
              onClick={() => setStatusDialog(row.original)}
              style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                cursor: 'pointer', color: 'var(--text-muted)', background: 'none'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <IconSwap size={15} />
            </button>
          )}
        </div>
      )
    })
  ]

  const table = useReactTable({
    data: data?.devices ?? [],
    columns,
    getCoreRowModel: getCoreRowModel()
  })

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
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
            placeholder="Tìm theo SKU, tên, serial, người giữ — hoặc quét mã vạch…"
            style={{
              width: '100%', height: 40, padding: '0 40px 0 36px',
              border: '1px solid var(--border)', borderRadius: 'var(--rad-md)',
              background: 'var(--surface)', color: 'var(--text)',
              fontSize: 14, outline: 'none', boxSizing: 'border-box'
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
          <span style={{
            position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', display: 'flex', cursor: 'pointer'
          }} title="Quét mã vạch">
            <IconScan size={16} />
          </span>
        </div>
        <select
          value={categoryFilter ?? ''}
          onChange={e => setCategoryFilter(e.target.value ? Number(e.target.value) : null)}
          style={{
            height: 40, padding: '0 12px',
            border: '1px solid var(--border)', borderRadius: 'var(--rad-md)',
            background: 'var(--surface)', color: categoryFilter == null ? 'var(--text-muted)' : 'var(--text)',
            fontSize: 14, outline: 'none', cursor: 'pointer',
            appearance: 'auto' as React.CSSProperties['appearance'],
            minWidth: 140,
            boxSizing: 'border-box' as React.CSSProperties['boxSizing'],
          }}
        >
          <option value="">Tất cả loại</option>
          {(catalogData?.categories ?? []).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {categoryFilter != null && groupsForCategory.length > 0 && (
          <select
            value={groupId ?? ''}
            onChange={e => setGroupId(e.target.value ? Number(e.target.value) : null)}
            style={{
              height: 40, padding: '0 12px',
              border: '1px solid var(--border)', borderRadius: 'var(--rad-md)',
              background: 'var(--surface)', color: groupId == null ? 'var(--text-muted)' : 'var(--text)',
              fontSize: 14, outline: 'none', cursor: 'pointer',
              appearance: 'auto' as React.CSSProperties['appearance'],
              minWidth: 130,
              boxSizing: 'border-box' as React.CSSProperties['boxSizing'],
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <option value="">Tất cả nhóm</option>
            {groupsForCategory.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}
        {hasPermission('edit_device') && (
          <button
            onClick={() => setFormDialog({ mode: 'create' })}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              height: 40, padding: '0 16px', border: 'none',
              borderRadius: 'var(--rad-md)', background: 'var(--primary)',
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer'
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
          >
            <IconPlus size={16} />
            <span>Thêm thiết bị</span>
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTER_KEYS.map(key => {
          const isActive = filter === key
          const count = data?.counts.find(c => c.key === key)?.count ?? 0
          return (
            <div
              key={key}
              onClick={() => setFilter(key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
                background: isActive ? 'var(--primary)' : 'var(--surface-2)',
                color: isActive ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`
              }}
            >
              {FILTER_LABELS[key]}
              <span style={{ fontSize: 11, opacity: 0.75 }}>{count}</span>
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
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--rad-lg)', overflow: 'hidden' }}>
          {/* Header */}
          {table.getHeaderGroups().map(hg => (
            <div
              key={hg.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1.6fr 1.1fr 150px 1.2fr 130px',
                padding: '0 18px', height: 44, alignItems: 'center',
                background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
                fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '.03em'
              }}
            >
              {hg.headers.map(header => (
                <div key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </div>
              ))}
            </div>
          ))}

          {/* Rows */}
          {table.getRowModel().rows.map(row => (
            <div
              key={row.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1.6fr 1.1fr 150px 1.2fr 130px',
                padding: '0 18px', minHeight: 52, alignItems: 'center',
                borderBottom: '1px solid var(--border)', fontSize: 14
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              {row.getVisibleCells().map(cell => (
                <div key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          ))}

          {/* Footer */}
          <div style={{
            padding: '12px 18px', fontSize: 13, color: 'var(--text-muted)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span>
              Trang {page}/{totalPages || 1} · {data?.total ?? 0} thiết bị
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                  background: 'none', cursor: page === 1 ? 'default' : 'pointer',
                  color: page === 1 ? 'var(--text-muted)' : 'var(--text)',
                }}
              >‹</button>
              <div style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--primary)', background: 'var(--primary-soft)',
                color: 'var(--primary)', borderRadius: 'var(--rad-sm)', fontWeight: 600,
                fontSize: 13,
              }}>{page}</div>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{
                  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                  background: 'none', cursor: page >= totalPages ? 'default' : 'pointer',
                  color: page >= totalPages ? 'var(--text-muted)' : 'var(--text)',
                }}
              >›</button>
            </div>
          </div>
        </div>
      )}
      {formDialog && (
        <DeviceFormDialog
          mode={formDialog.mode}
          initial={formDialog.mode === 'edit' ? {
            sku: formDialog.device.sku,
            name: formDialog.device.name,
            categoryId: formDialog.device.categoryId,
            serialNumber: formDialog.device.serialNumber,
            notes: formDialog.device.notes,
            groupId: formDialog.device.groupId,
          } : undefined}
          categories={categories}
          groups={catalogData?.groups ?? []}
          loading={formDialog.mode === 'create' ? createMutation.isPending : updateMutation.isPending}
          error={formDialog.mode === 'create'
            ? (createMutation.isError ? (createMutation.error as Error).message : '')
            : (updateMutation.isError ? (updateMutation.error as Error).message : '')}
          onClose={() => {
            setFormDialog(null)
            createMutation.reset()
            updateMutation.reset()
          }}
          onSubmit={args => {
            if (formDialog.mode === 'create') createMutation.mutate(args)
            else updateMutation.mutate(args)
          }}
        />
      )}
      {statusDialog && (
        <ChangeStatusDialog
          sku={statusDialog.sku}
          deviceName={statusDialog.name}
          currentStatus={statusDialog.status}
          isAllocated={statusDialog.status === 'allocated'}
          loading={changeStatusMutation.isPending}
          error={changeStatusMutation.isError ? (changeStatusMutation.error as Error).message : ''}
          onClose={() => { setStatusDialog(null); changeStatusMutation.reset() }}
          onConfirm={args => changeStatusMutation.mutate(args)}
        />
      )}
      {returnDialog && returnDialog.activeAllocationId != null && (
        <ReturnDialog
          allocationId={returnDialog.activeAllocationId}
          deviceName={returnDialog.name}
          deviceSku={returnDialog.sku}
          recipient={returnDialog.holder ?? '—'}
          contextLabel={`Phòng ban: ${returnDialog.department ?? '—'}`}
          onClose={() => { setReturnDialog(null); returnMutation.reset() }}
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
    </div>
  )
}
