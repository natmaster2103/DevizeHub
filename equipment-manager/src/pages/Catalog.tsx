import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { IconEdit, IconPlus } from '@/lib/icons'
import type { CategoryRow, DepartmentRow, GroupRow } from '@shared/ipc'

function useCatalog() {
  return useQuery({ queryKey: ['catalog'], queryFn: () => unwrap(api.catalog.list()) })
}

// ── shared icon button ────────────────────────────────────────────────────────
function IconBtn({ title, onClick, children }: { title: string; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
        background: 'none', cursor: 'pointer', color: 'var(--text-muted)'
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {children}
    </button>
  )
}

// ── trash icon ────────────────────────────────────────────────────────────────
function IconTrash({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}

// ── table wrapper ─────────────────────────────────────────────────────────────
function CatalogTable({ cols, children }: { cols: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--rad-lg)', overflow: 'hidden'
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: cols,
        padding: '0 16px', height: 42, alignItems: 'center',
        background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
        fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '.04em'
      }}>
        {children}
      </div>
    </div>
  )
}

// ── inline input ──────────────────────────────────────────────────────────────
function InlineInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        height: 32, padding: '0 10px', fontSize: 13,
        border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
        background: 'var(--surface)', color: 'var(--text)',
        outline: 'none', boxSizing: 'border-box', ...(props.style ?? {})
      }}
      onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
      onBlur={e => (e.target.style.borderColor = 'var(--border)')}
    />
  )
}

// ── Categories tab (master-detail) ───────────────────────────────────────────
function CategoriesTab({ rows, groups, isAdmin }: { rows: CategoryRow[]; groups: GroupRow[]; isAdmin: boolean }) {
  const qc = useQueryClient()
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editMin, setEditMin] = useState(0)
  const [newName, setNewName] = useState('')
  const [newMin, setNewMin] = useState(0)
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null)

  // Group editing state
  const [editGroupId, setEditGroupId] = useState<number | null>(null)
  const [editGroupName, setEditGroupName] = useState('')
  const [newGroupName, setNewGroupName] = useState('')

  const saveCatMut = useMutation({
    mutationFn: (args: { id?: number; name: string; minStock: number }) =>
      unwrap(api.catalog.saveCategory(args)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog'] }); setEditId(null); setNewName(''); setNewMin(0) },
  })
  const delCatMut = useMutation({
    mutationFn: (id: number) => unwrap(api.catalog.deleteCategory({ id })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog'] }); setSelectedCatId(null) },
    onError: (e: Error) => alert(e.message),
  })
  const saveGroupMut = useMutation({
    mutationFn: (args: { id?: number; name: string; categoryId: number }) =>
      unwrap(api.catalog.saveGroup(args)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog'] }); setEditGroupId(null); setNewGroupName('') },
    onError: (e: Error) => alert(e.message),
  })
  const delGroupMut = useMutation({
    mutationFn: (id: number) => unwrap(api.catalog.deleteGroup({ id })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog'] }),
    onError: (e: Error) => alert(e.message),
  })

  const selectedGroups = selectedCatId != null ? groups.filter((g) => g.categoryId === selectedCatId) : []

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* ── Left: categories ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--rad-lg)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 100px 88px' : '1fr 100px', padding: '0 16px', height: 42, alignItems: 'center', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          <div>Tên loại</div>
          <div>Tồn kho tối thiểu</div>
          {isAdmin && <div />}
        </div>

        {rows.map(row => (
          <div key={row.id}
            onClick={() => setSelectedCatId(row.id === selectedCatId ? null : row.id)}
            style={{
              display: 'grid', gridTemplateColumns: isAdmin ? '1fr 100px 88px' : '1fr 100px',
              padding: '0 16px', minHeight: 48, alignItems: 'center',
              borderBottom: '1px solid var(--border)', fontSize: 14, cursor: 'pointer',
              background: selectedCatId === row.id ? 'var(--primary-soft)' : '',
            }}
            onMouseEnter={e => { if (selectedCatId !== row.id) e.currentTarget.style.background = 'var(--hoverbg)' }}
            onMouseLeave={e => { if (selectedCatId !== row.id) e.currentTarget.style.background = '' }}
          >
            {editId === row.id ? (
              <>
                <InlineInput value={editName} onChange={e => setEditName(e.target.value)} onClick={e => e.stopPropagation()} style={{ width: '90%' }} />
                <InlineInput type="number" value={editMin} onChange={e => setEditMin(Number(e.target.value))} onClick={e => e.stopPropagation()} style={{ width: 72 }} />
                <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => saveCatMut.mutate({ id: row.id, name: editName, minStock: editMin })} style={{ height: 28, padding: '0 10px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 'var(--rad-sm)', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>Lưu</button>
                  <button onClick={() => setEditId(null)} style={{ height: 28, padding: '0 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Hủy</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 500, color: selectedCatId === row.id ? 'var(--primary)' : 'var(--text)' }}>{row.name}</div>
                <div style={{ color: 'var(--text-muted)' }}>{row.minStock}</div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                    <IconBtn title="Sửa" onClick={() => { setEditId(row.id); setEditName(row.name); setEditMin(row.minStock) }}><IconEdit size={13} /></IconBtn>
                    <IconBtn title="Xóa" onClick={() => delCatMut.mutate(row.id)}><IconTrash size={13} /></IconBtn>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {isAdmin && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 88px', padding: '10px 16px', alignItems: 'center', gap: 8, background: 'var(--surface-2)' }}>
            <InlineInput value={newName} onChange={e => setNewName(e.target.value)} placeholder="Tên loại thiết bị mới" style={{ width: '90%' }} />
            <InlineInput type="number" value={newMin} onChange={e => setNewMin(Number(e.target.value))} style={{ width: 72 }} />
            <button onClick={() => { if (newName.trim()) saveCatMut.mutate({ name: newName, minStock: newMin }) }} style={{ height: 32, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', borderRadius: 'var(--rad-sm)', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <IconPlus size={13} />Thêm
            </button>
          </div>
        )}
      </div>

      {/* ── Right: groups ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--rad-lg)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 60px' : '1fr', padding: '0 16px', height: 42, alignItems: 'center', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          <div>
            {selectedCatId != null
              ? `Nhóm — ${rows.find((r) => r.id === selectedCatId)?.name ?? ''}`
              : 'Nhóm'}
          </div>
          {isAdmin && selectedCatId != null && <div />}
        </div>

        {selectedCatId == null ? (
          <div style={{ padding: '32px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
            Chọn một loại thiết bị để xem nhóm
          </div>
        ) : (
          <>
            {selectedGroups.map(grp => (
              <div key={grp.id} style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 60px' : '1fr', padding: '0 16px', minHeight: 48, alignItems: 'center', borderBottom: '1px solid var(--border)', fontSize: 14 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                {editGroupId === grp.id ? (
                  <>
                    <InlineInput value={editGroupName} onChange={e => setEditGroupName(e.target.value)} style={{ width: '90%' }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => saveGroupMut.mutate({ id: grp.id, name: editGroupName, categoryId: selectedCatId })} style={{ height: 28, padding: '0 10px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 'var(--rad-sm)', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>Lưu</button>
                      <button onClick={() => setEditGroupId(null)} style={{ height: 28, padding: '0 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Hủy</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 500 }}>{grp.name}</div>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <IconBtn title="Sửa" onClick={() => { setEditGroupId(grp.id); setEditGroupName(grp.name) }}><IconEdit size={13} /></IconBtn>
                        <IconBtn title="Xóa" onClick={() => delGroupMut.mutate(grp.id)}><IconTrash size={13} /></IconBtn>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {selectedGroups.length === 0 && (
              <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: 13 }}>Chưa có nhóm nào.</div>
            )}

            {isAdmin && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px', padding: '10px 16px', alignItems: 'center', gap: 8, background: 'var(--surface-2)' }}>
                <InlineInput value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Tên nhóm mới" style={{ width: '90%' }} />
                <button onClick={() => { if (newGroupName.trim()) saveGroupMut.mutate({ name: newGroupName, categoryId: selectedCatId }) }} style={{ height: 32, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', borderRadius: 'var(--rad-sm)', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <IconPlus size={13} />Thêm
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Departments tab ───────────────────────────────────────────────────────────
function DepartmentsTab({ rows, isAdmin }: { rows: DepartmentRow[]; isAdmin: boolean }) {
  const qc = useQueryClient()
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [newName, setNewName] = useState('')

  const saveMut = useMutation({
    mutationFn: (args: { id?: number; name: string }) => unwrap(api.catalog.saveDepartment(args)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog'] }); setEditId(null); setNewName('') },
  })
  const delMut = useMutation({
    mutationFn: (id: number) => unwrap(api.catalog.deleteDepartment({ id })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog'] }),
  })

  const COL = isAdmin ? '1fr 88px' : '1fr'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--rad-lg)', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: COL, padding: '0 16px', height: 42, alignItems: 'center', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        <div>Tên phòng ban</div>
        {isAdmin && <div />}
      </div>

      {rows.map(row => (
        <div key={row.id} style={{ display: 'grid', gridTemplateColumns: COL, padding: '0 16px', minHeight: 48, alignItems: 'center', borderBottom: '1px solid var(--border)', fontSize: 14 }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
          onMouseLeave={e => (e.currentTarget.style.background = '')}
        >
          {editId === row.id ? (
            <>
              <InlineInput value={editName} onChange={e => setEditName(e.target.value)} style={{ width: '80%' }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => saveMut.mutate({ id: row.id, name: editName })} style={{ height: 28, padding: '0 10px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 'var(--rad-sm)', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>Lưu</button>
                <button onClick={() => setEditId(null)} style={{ height: 28, padding: '0 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Hủy</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 500 }}>{row.name}</div>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <IconBtn title="Sửa" onClick={() => { setEditId(row.id); setEditName(row.name) }}><IconEdit size={13} /></IconBtn>
                  <IconBtn title="Xóa" onClick={() => delMut.mutate(row.id)}><IconTrash size={13} /></IconBtn>
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {isAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: COL, padding: '10px 16px', alignItems: 'center', gap: 8, background: 'var(--surface-2)' }}>
          <InlineInput value={newName} onChange={e => setNewName(e.target.value)} placeholder="Tên phòng ban mới" style={{ width: '80%' }} />
          <button onClick={() => { if (newName.trim()) saveMut.mutate({ name: newName }) }} style={{ height: 32, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', borderRadius: 'var(--rad-sm)', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <IconPlus size={13} />Thêm
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
type Tab = 'categories' | 'departments'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'categories', label: 'Loại thiết bị' },
  { key: 'departments', label: 'Phòng ban' },
]

export default function Catalog() {
  const { isAdmin, hasPermission } = useAuth()
  const canManage = hasPermission('manage_catalog')
  const { data, isLoading, error } = useCatalog()
  const [tab, setTab] = useState<Tab>('categories')

  if (isLoading) return <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 14 }}>Đang tải…</div>
  if (error) return <div style={{ padding: 24, color: '#dc2626', fontSize: 14 }}>{(error as Error).message}</div>

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Segmented tabs */}
      <div style={{
        display: 'inline-flex', background: 'var(--surface-2)',
        border: '1px solid var(--border)', borderRadius: 'var(--rad-md)',
        padding: 3, gap: 2, marginBottom: 20
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              height: 34, padding: '0 18px', borderRadius: 'var(--rad-sm)',
              border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: tab === t.key ? 'var(--surface)' : 'none',
              color: tab === t.key ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,.12)' : 'none'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'categories' && (
        <CategoriesTab rows={data?.categories ?? []} groups={data?.groups ?? []} isAdmin={canManage} />
      )}
      {tab === 'departments' && (
        <DepartmentsTab rows={data?.departments ?? []} isAdmin={canManage} />
      )}
    </div>
  )
}
