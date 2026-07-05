import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { IconEdit, IconPlus, IconTrash } from '@/lib/icons'
import type { AppUserRow, SaveUserArgs, Role, Permission } from '@shared/ipc'
import { ALL_PERMISSIONS } from '@shared/ipc'
import { ImportDevicesDialog } from '@/components/ImportDevicesDialog'

const PERMISSION_LABELS: Record<Permission, string> = {
  allocate: 'Cấp phát thiết bị',
  return_device: 'Thu hồi thiết bị',
  create_request: 'Tạo phiếu đề nghị',
  manage_requests: 'Sửa/Xoá phiếu đề nghị',
  edit_device: 'Sửa thông tin thiết bị',
  change_status: 'Đổi trạng thái thiết bị',
  delete_device: 'Xóa thiết bị',
  manage_catalog: 'Quản lý danh mục',
  manage_users: 'Quản lý tài khoản',
  reset_data: 'Làm mới dữ liệu',
  view_reports: 'Xem báo cáo',
}

// ── helpers ───────────────────────────────────────────────────────────────────
function useUsers() {
  return useQuery({ queryKey: ['settings', 'users'], queryFn: () => unwrap(api.settings.listUsers()) })
}
function useDbInfo() {
  return useQuery({ queryKey: ['settings', 'dbInfo'], queryFn: () => unwrap(api.settings.dbInfo()) })
}

const inputStyle: React.CSSProperties = {
  height: 38, padding: '0 11px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
  background: 'var(--surface)', color: 'var(--text)',
  outline: 'none', boxSizing: 'border-box', width: '100%'
}
const focusOn = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) =>
  (e.target.style.borderColor = 'var(--primary)')
const focusOff = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) =>
  (e.target.style.borderColor = 'var(--border)')

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--rad-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 700 }}>
        {title}
      </div>
      <div style={{ padding: '20px' }}>
        {children}
      </div>
    </div>
  )
}

// ── User edit modal ───────────────────────────────────────────────────────────
function UserModal({ user, onClose }: { user: AppUserRow | null; onClose(): void }) {
  const qc = useQueryClient()
  const { user: currentUser } = useAuth()
  const currentUserId = currentUser?.id
  const isNew = !user
  const [username, setUsername] = useState(user?.username ?? '')
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [role, setRole] = useState<Role>(user?.role ?? 'staff')
  const [active, setActive] = useState(user?.active ?? true)
  const [password, setPassword] = useState('')
  const [selectedPerms, setSelectedPerms] = useState<Permission[]>((user?.permissions ?? []) as Permission[])
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>(user?.groupIds ?? [])
  const [err, setErr] = useState('')

  const { data: catalogData } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => unwrap(api.catalog.list()),
  })
  const availableGroups = catalogData?.groups ?? []

  const permMut = useMutation({
    mutationFn: (args: { userId: number; permissions: Permission[] }) =>
      unwrap(api.settings.saveUserPermissions(args)),
  })
  const groupMut = useMutation({
    mutationFn: (args: { userId: number; groupIds: number[] }) =>
      unwrap(api.settings.saveUserGroups(args)),
  })

  const mut = useMutation({
    mutationFn: (args: SaveUserArgs) => unwrap(api.settings.saveUser(args)),
    onSuccess: async (saved) => {
      await permMut.mutateAsync({ userId: saved.id, permissions: selectedPerms })
      await groupMut.mutateAsync({ userId: saved.id, groupIds: selectedGroupIds })
      qc.invalidateQueries({ queryKey: ['settings', 'users'] })
      onClose()
    },
    onError: (e) => setErr((e as Error).message),
  })

  function save() {
    setErr('')
    if (!username.trim() || !displayName.trim()) { setErr('Vui lòng điền đầy đủ thông tin.'); return }
    if (isNew && !password) { setErr('Mật khẩu bắt buộc khi tạo tài khoản mới.'); return }
    mut.mutate({ id: user?.id, username: username.trim(), displayName: displayName.trim(), role, active, password: password || undefined })
  }

  const isSaving = mut.isPending || permMut.isPending || groupMut.isPending

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 560, maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--surface)', borderRadius: 'var(--rad-lg)',
        boxShadow: '0 20px 60px rgba(0,0,0,.35)', padding: 24,
        display: 'flex', flexDirection: 'column', gap: 16
      }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          {isNew ? 'Thêm tài khoản' : 'Chỉnh sửa tài khoản'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
              Tên đăng nhập <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input value={username} onChange={e => setUsername(e.target.value)} style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
              Họ tên <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Vai trò</label>
            <select value={role} onChange={e => setRole(e.target.value as Role)} style={{ ...inputStyle, appearance: 'auto' as any }} onFocus={focusOn} onBlur={focusOff}>
              <option value="staff">Nhân viên (staff)</option>
              <option value="admin">Quản trị (admin)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
              Mật khẩu {isNew && <span style={{ color: '#dc2626' }}>*</span>}
              {!isNew && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}> (để trống = không đổi)</span>}
            </label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={isNew ? '' : '••••••••'} style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
          Tài khoản đang hoạt động
        </label>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Quyền hạn
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {ALL_PERMISSIONS.map(perm => {
              const isSelfLocked = !isNew && user?.id === currentUserId && (perm === 'manage_users' || perm === 'reset_data')
              return (
                <label key={perm} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isSelfLocked ? 'not-allowed' : 'pointer', fontSize: 13, opacity: isSelfLocked ? 0.5 : 1 }}>
                  <input
                    type="checkbox"
                    checked={selectedPerms.includes(perm)}
                    disabled={isSelfLocked}
                    onChange={e => {
                      if (e.target.checked) setSelectedPerms(prev => [...prev, perm])
                      else setSelectedPerms(prev => prev.filter(p => p !== perm))
                    }}
                  />
                  {PERMISSION_LABELS[perm]}
                </label>
              )
            })}
          </div>
        </div>

        {availableGroups.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Nhóm phụ trách
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {availableGroups.map(g => (
                <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)', background: selectedGroupIds.includes(g.id) ? 'var(--primary-soft)' : 'var(--surface)' }}>
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.includes(g.id)}
                    onChange={e => {
                      if (e.target.checked) setSelectedGroupIds(prev => [...prev, g.id])
                      else setSelectedGroupIds(prev => prev.filter(id => id !== g.id))
                    }}
                  />
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, marginRight: 2 }}>{g.categoryName}</span>
                  {g.name}
                </label>
              ))}
            </div>
          </div>
        )}

        {err && <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ height: 38, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Hủy</button>
          <button onClick={save} disabled={isSaving} style={{ height: 38, padding: '0 18px', border: 'none', borderRadius: 'var(--rad-sm)', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.7 : 1 }}>
            {isSaving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── User management table ─────────────────────────────────────────────────────
function UsersSection() {
  const { data, isLoading } = useUsers()
  const qc = useQueryClient()
  const { user: currentUser } = useAuth()
  const [editing, setEditing] = useState<AppUserRow | null | 'new'>(null)
  const [deleting, setDeleting] = useState<AppUserRow | null>(null)
  const [deleteErr, setDeleteErr] = useState('')

  const deleteMut = useMutation({
    mutationFn: (id: number) => unwrap(api.settings.deleteUser({ id })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'users'] })
      setDeleting(null)
      setDeleteErr('')
    },
    onError: (e) => setDeleteErr((e as Error).message),
  })

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Quản lý tài khoản đăng nhập hệ thống</div>
        <button
          onClick={() => setEditing('new')}
          style={{
            height: 34, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6,
            border: 'none', borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
            color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}
        >
          <IconPlus size={13} />Thêm tài khoản
        </button>
      </div>

      {isLoading && <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Đang tải…</div>}

      {!isLoading && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--rad-md)', overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 100px 80px 36px 36px',
            padding: '0 14px', height: 38, alignItems: 'center',
            background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
            fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '.04em'
          }}>
            <div>Tên đăng nhập</div>
            <div>Họ tên</div>
            <div>Vai trò</div>
            <div>Trạng thái</div>
            <div />
            <div />
          </div>
          {(data ?? []).map(u => {
            const isSelf = u.id === currentUser?.id
            return (
              <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 80px 36px 36px', padding: '0 14px', minHeight: 46, alignItems: 'center', borderBottom: '1px solid var(--border)', fontSize: 14 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <div style={{ fontFamily: "'Consolas',monospace", fontSize: 13 }}>{u.username}</div>
                <div style={{ fontWeight: 500 }}>{u.displayName}</div>
                <div>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                    fontSize: 11, fontWeight: 700, letterSpacing: '.03em',
                    ...(u.role === 'admin'
                      ? { background: 'rgba(124,58,237,.12)', color: '#7c3aed' }
                      : { background: 'var(--surface-2)', color: 'var(--text-muted)' })
                  }}>
                    {u.role === 'admin' ? 'Admin' : 'Staff'}
                  </span>
                </div>
                <div>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                    fontSize: 11, fontWeight: 700,
                    ...(u.active
                      ? { background: 'rgba(22,163,74,.1)', color: '#16a34a' }
                      : { background: 'rgba(107,114,128,.1)', color: 'var(--text-muted)' })
                  }}>
                    {u.active ? 'Hoạt động' : 'Đã khóa'}
                  </span>
                </div>
                <button
                  title="Chỉnh sửa"
                  onClick={() => setEditing(u)}
                  style={{
                    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                    background: 'none', cursor: 'pointer', color: 'var(--text-muted)'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  <IconEdit size={13} />
                </button>
                <button
                  title={isSelf ? 'Không thể xóa tài khoản đang đăng nhập' : 'Xóa tài khoản'}
                  disabled={isSelf}
                  onClick={() => { setDeleteErr(''); setDeleting(u) }}
                  style={{
                    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                    background: 'none', cursor: isSelf ? 'not-allowed' : 'pointer',
                    color: 'var(--text-muted)', opacity: isSelf ? 0.35 : 1
                  }}
                  onMouseEnter={e => { if (!isSelf) { e.currentTarget.style.borderColor = '#dc2626'; e.currentTarget.style.color = '#dc2626' } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  <IconTrash size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {editing !== null && (
        <UserModal
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting !== null && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget && !deleteMut.isPending) { setDeleting(null); setDeleteErr('') } }}
        >
          <div style={{ width: 420, background: 'var(--surface)', borderRadius: 'var(--rad-lg)', boxShadow: '0 20px 60px rgba(0,0,0,.35)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Xác nhận xóa tài khoản</div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
              Bạn có chắc muốn xóa tài khoản <b>{deleting.displayName}</b> ({deleting.username})? Hành động này <b>không thể hoàn tác</b>.
            </div>
            {deleteErr && <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>{deleteErr}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
              <button onClick={() => { setDeleting(null); setDeleteErr('') }} disabled={deleteMut.isPending} style={{ height: 38, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: deleteMut.isPending ? 'not-allowed' : 'pointer' }}>Hủy</button>
              <button onClick={() => deleteMut.mutate(deleting.id)} disabled={deleteMut.isPending} style={{ height: 38, padding: '0 18px', border: 'none', borderRadius: 'var(--rad-sm)', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: deleteMut.isPending ? 'not-allowed' : 'pointer', opacity: deleteMut.isPending ? 0.7 : 1 }}>
                {deleteMut.isPending ? 'Đang xóa…' : 'Xóa tài khoản'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Change password section ───────────────────────────────────────────────────
function ChangePasswordSection() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)

  const mut = useMutation({
    mutationFn: () => unwrap(api.settings.changePassword({ currentPassword: current, newPassword: next })),
    onSuccess: () => { setOk(true); setCurrent(''); setNext(''); setConfirm('') },
    onError: (e) => setErr((e as Error).message),
  })

  function submit() {
    setErr(''); setOk(false)
    if (!current || !next) { setErr('Vui lòng điền đầy đủ.'); return }
    if (next !== confirm) { setErr('Mật khẩu mới không khớp.'); return }
    if (next.length < 6) { setErr('Mật khẩu tối thiểu 6 ký tự.'); return }
    mut.mutate()
  }

  const PwField = ({ label, value, onChange }: { label: string; value: string; onChange(v: string): void }) => (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>{label}</label>
      <input type="password" value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, maxWidth: 340 }} onFocus={focusOn} onBlur={focusOff} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PwField label="Mật khẩu hiện tại" value={current} onChange={setCurrent} />
      <PwField label="Mật khẩu mới" value={next} onChange={setNext} />
      <PwField label="Xác nhận mật khẩu mới" value={confirm} onChange={setConfirm} />
      {err && <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>{err}</div>}
      {ok && <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>Đổi mật khẩu thành công!</div>}
      <div>
        <button
          onClick={submit}
          disabled={mut.isPending}
          style={{
            height: 38, padding: '0 18px', border: 'none',
            borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: mut.isPending ? 'not-allowed' : 'pointer', opacity: mut.isPending ? 0.7 : 1
          }}
        >
          {mut.isPending ? 'Đang lưu…' : 'Đổi mật khẩu'}
        </button>
      </div>
    </div>
  )
}

// ── DB info section ───────────────────────────────────────────────────────────
function DbInfoSection() {
  const { data } = useDbInfo()

  function fmtBackup(iso: string | null | undefined): string {
    if (!iso) return '—'
    const d = new Date(iso)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`
  }

  function copyPath() {
    if (data?.path) navigator.clipboard.writeText(data.path).catch(() => {})
  }

  const sizeMb = data ? (data.sizeKb / 1024).toFixed(1) + ' MB' : '—'

  const rowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', fontSize: 13,
    padding: '9px 0', borderTop: '1px solid var(--border)'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          readOnly
          value={data?.path ?? '—'}
          style={{
            flex: 1, height: 38, padding: '0 10px',
            border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
            background: 'var(--surface-2)', color: 'var(--text-muted)',
            fontSize: 13, fontFamily: "'Consolas',monospace", outline: 'none'
          }}
        />
        <button
          onClick={copyPath}
          title="Sao chép đường dẫn"
          style={{
            height: 38, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6,
            border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
            background: 'var(--surface)', color: 'var(--text)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
        >
          Sao chép
        </button>
      </div>
      <div style={rowStyle}>
        <span style={{ color: 'var(--text-muted)' }}>Dung lượng</span>
        <span style={{ fontWeight: 600 }}>{sizeMb}</span>
      </div>
      <div style={rowStyle}>
        <span style={{ color: 'var(--text-muted)' }}>Sao lưu gần nhất</span>
        <span style={{ fontWeight: 600 }}>{fmtBackup(data?.lastBackup)}</span>
      </div>
      <div style={rowStyle}>
        <span style={{ color: 'var(--text-muted)' }}>Chế độ</span>
        <span style={{ fontWeight: 600, color: '#16a34a' }}>Ngoại tuyến</span>
      </div>
    </div>
  )
}

// ── Auto-logout section (admin only) ──────────────────────────────────────────
function useAutoLogoutConfig() {
  return useQuery({ queryKey: ['settings', 'autoLogout'], queryFn: () => unwrap(api.settings.getAutoLogoutConfig()) })
}

function AutoLogoutSection() {
  const { data } = useAutoLogoutConfig()
  const qc = useQueryClient()
  const [enabled, setEnabled] = useState(false)
  const [time, setTime] = useState('07:30')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled)
      setTime(data.time)
    }
  }, [data])

  const mut = useMutation({
    mutationFn: () => unwrap(api.settings.saveAutoLogoutConfig({ enabled, time })),
    onSuccess: () => {
      setOk(true)
      setErr('')
      qc.invalidateQueries({ queryKey: ['settings', 'autoLogout'] })
    },
    onError: (e) => { setErr((e as Error).message); setOk(false) },
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Toàn bộ tài khoản đang đăng nhập sẽ tự động đăng xuất vào giờ này mỗi ngày.
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => { setEnabled(e.target.checked); setOk(false) }}
        />
        Bật tự động đăng xuất theo giờ
      </label>
      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Giờ đăng xuất</label>
        <input
          type="time"
          value={time}
          disabled={!enabled}
          onChange={e => { setTime(e.target.value); setOk(false) }}
          style={{ ...inputStyle, maxWidth: 160, opacity: enabled ? 1 : 0.5 }}
          onFocus={focusOn}
          onBlur={focusOff}
        />
      </div>
      {err && <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>{err}</div>}
      {ok && <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>Đã lưu cấu hình!</div>}
      <div>
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          style={{
            height: 38, padding: '0 18px', border: 'none',
            borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: mut.isPending ? 'not-allowed' : 'pointer', opacity: mut.isPending ? 0.7 : 1
          }}
        >
          {mut.isPending ? 'Đang lưu…' : 'Lưu'}
        </button>
      </div>
    </div>
  )
}

// ── Reset data section (admin only) ───────────────────────────────────────────
function ResetDataSection() {
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)

  const mut = useMutation({
    mutationFn: () => unwrap(api.settings.resetData()),
    onSuccess: () => {
      setConfirming(false)
      setDone(true)
      qc.invalidateQueries()
    },
  })

  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Làm mới dữ liệu</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Xóa toàn bộ dữ liệu hiện tại và khôi phục về dữ liệu mẫu mặc định.
          </div>
        </div>
        <button
          onClick={() => { setDone(false); setConfirming(true) }}
          style={{
            height: 38, padding: '0 16px', border: '1px solid #dc2626',
            borderRadius: 'var(--rad-sm)', background: 'none', color: '#dc2626',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'
          }}
        >
          Làm mới dữ liệu
        </button>
      </div>

      {done && (
        <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, marginTop: 12 }}>
          Đã làm mới dữ liệu thành công!
        </div>
      )}

      {confirming && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget && !mut.isPending) setConfirming(false) }}
        >
          <div style={{ width: 440, background: 'var(--surface)', borderRadius: 'var(--rad-lg)', boxShadow: '0 20px 60px rgba(0,0,0,.35)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Xác nhận làm mới dữ liệu</div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
              Toàn bộ thiết bị, phiếu, cấp phát và tài khoản sẽ bị <b>xóa vĩnh viễn</b> và thay bằng dữ liệu mẫu mặc định. Hành động này <b>không thể hoàn tác</b>.
            </div>
            {mut.isError && (
              <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>{(mut.error as Error).message}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setConfirming(false)} disabled={mut.isPending} style={{ height: 38, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: mut.isPending ? 'not-allowed' : 'pointer' }}>Hủy</button>
              <button onClick={() => mut.mutate()} disabled={mut.isPending} style={{ height: 38, padding: '0 18px', border: 'none', borderRadius: 'var(--rad-sm)', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: mut.isPending ? 'not-allowed' : 'pointer', opacity: mut.isPending ? 0.7 : 1 }}>
                {mut.isPending ? 'Đang làm mới…' : 'Xóa & làm mới'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Batch import section ──────────────────────────────────────────────────────
function ImportSection() {
  const qc = useQueryClient()
  const [showDialog, setShowDialog] = useState(false)

  function handleImported() {
    qc.invalidateQueries({ queryKey: ['devices'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    setShowDialog(false)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Nhập thiết bị hàng loạt</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Tải template Excel, điền thông tin và nhập nhiều thiết bị cùng lúc.
          </div>
        </div>
        <button
          onClick={() => setShowDialog(true)}
          style={{
            height: 36, padding: '0 14px',
            border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
            background: 'none', color: 'var(--text)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
        >
          ↑ Nhập Excel / CSV
        </button>
      </div>
      {showDialog && (
        <ImportDevicesDialog
          onClose={() => setShowDialog(false)}
          onImported={handleImported}
        />
      )}
    </>
  )
}

// ── Main Settings page ────────────────────────────────────────────────────────
export default function Settings() {
  const { isAdmin } = useAuth()

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {isAdmin && (
        <SectionCard title="Quản lý tài khoản">
          <UsersSection />
        </SectionCard>
      )}

      {isAdmin && (
        <SectionCard title="Tự động đăng xuất">
          <AutoLogoutSection />
        </SectionCard>
      )}

      <SectionCard title="Đổi mật khẩu">
        <ChangePasswordSection />
      </SectionCard>

      {isAdmin && (
        <SectionCard title="Cơ sở dữ liệu">
          <DbInfoSection />
          <ResetDataSection />
        </SectionCard>
      )}

      {isAdmin && (
        <SectionCard title="Nhập dữ liệu">
          <ImportSection />
        </SectionCard>
      )}
    </div>
  )
}
