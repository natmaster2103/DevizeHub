import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useReactTable, getCoreRowModel, createColumnHelper,
  flexRender
} from '@tanstack/react-table'
import { useDevices } from '@/hooks/useDevices'
import { useAuth } from '@/context/AuthContext'
import { StatusBadge } from '@/components/StatusBadge'
import { STATUS_LABELS } from '@/lib/status'
import { IconScan, IconSearch, IconPlus, IconView, IconEdit, IconSwap } from '@/lib/icons'
import type { DeviceRow, DeviceStatus } from '@shared/ipc'

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
  const { isAdmin } = useAuth()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | DeviceStatus>('all')

  const { data, isLoading, error } = useDevices(filter, query)

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
    colHelper.accessor('category', {
      header: 'Loại',
      cell: info => <span style={{ color: 'var(--text-muted)' }}>{info.getValue()}</span>
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
          {isAdmin && (
            <>
              <button
                title="Sửa"
                onClick={() => { /* no-op M1 */ }}
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
              <button
                title="Đổi trạng thái"
                onClick={() => { /* no-op M1 */ }}
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
            </>
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
        {isAdmin && (
          <button
            onClick={() => { /* no-op M1 */ }}
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
            <span>Hiển thị {data?.devices.length ?? 0} / {data?.total ?? 0} thiết bị</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)', cursor: 'pointer'
              }}>‹</div>
              <div style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--primary)', background: 'var(--primary-soft)',
                color: 'var(--primary)', borderRadius: 'var(--rad-sm)', fontWeight: 600
              }}>1</div>
              <div style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)', cursor: 'pointer'
              }}>›</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
