import { useAuth } from '@/context/AuthContext'
import { useUi } from '@/context/UiContext'
import { IconSun, IconMoon, IconLogout } from '@/lib/icons'
import { Timer } from './Timer'

interface TopbarProps {
  title: string
  subtitle: string
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const { user, isAdmin, logout } = useAuth()
  const { dark, toggleTheme } = useUi()

  const roleLabel = isAdmin ? 'Quản trị viên' : 'Nhân viên'

  const initials = user?.displayName
    ? user.displayName.split(' ').map(w => w[0]).slice(-2).join('').toUpperCase()
    : '?'

  return (
    <header style={{
      height: 56, flexShrink: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '0 22px',
      background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      position: 'sticky', top: 0, zIndex: 20
    }}>
      {/* Left: title + subtitle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: '-.01em', whiteSpace: 'nowrap' }}>
          {title}
        </h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{subtitle}</span>
      </div>

      {/* Right: controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

        {/* Live clock */}
        <Timer />

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 2px' }} />

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title="Đổi giao diện"
          style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
            cursor: 'pointer', color: 'var(--text-muted)', background: 'none'
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          {dark ? <IconSun size={17} /> : <IconMoon size={17} />}
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 2px' }} />

        {/* Avatar + name + role */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0
          }}>
            {initials}
          </div>
          <div style={{ lineHeight: 1.2, whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.displayName ?? ''}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{roleLabel}</div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={() => logout()}
          title="Đăng xuất"
          style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
            cursor: 'pointer', color: 'var(--text-muted)', background: 'none', marginLeft: 2
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--hoverbg)'; e.currentTarget.style.color = '#dc2626' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <IconLogout size={17} />
        </button>
      </div>
    </header>
  )
}
