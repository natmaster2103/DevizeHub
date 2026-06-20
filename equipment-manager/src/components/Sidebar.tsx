import { NavLink } from 'react-router-dom'
import { useUi } from '@/context/UiContext'
import {
  IconDashboard, IconDevices, IconRequests, IconAllocate,
  IconReports, IconCatalog, IconSettings,
  IconChevronsLeft, IconChevronsRight
} from '@/lib/icons'

const NAV = [
  { to: '/', label: 'Tổng quan', icon: IconDashboard },
  { to: '/devices', label: 'Thiết bị', icon: IconDevices },
  { to: '/requests', label: 'Phiếu đề nghị', icon: IconRequests },
  { to: '/allocate', label: 'Cấp phát lẻ', icon: IconAllocate },
  { to: '/reports', label: 'Báo cáo', icon: IconReports },
  { to: '/catalog', label: 'Danh mục', icon: IconCatalog },
  { to: '/settings', label: 'Cài đặt', icon: IconSettings }
]

export function Sidebar() {
  const { collapsed, toggleSidebar } = useUi()
  const width = collapsed ? 68 : 232

  return (
    <aside style={{
      width, flexShrink: 0, height: '100vh', position: 'sticky', top: 0,
      background: 'var(--sidebar)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', transition: 'width 200ms ease', overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        height: 56, display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 16px', borderBottom: '1px solid var(--border)',
        overflow: 'hidden', whiteSpace: 'nowrap', flexShrink: 0
      }}>
        <div style={{
          width: 32, height: 32, flexShrink: 0, borderRadius: 'var(--rad-sm)',
          background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </div>
        {!collapsed && (
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.01em' }}>EquipHub</div>
        )}
      </div>

      {/* Nav */}
      <nav style={{
        flex: 1, padding: '10px', display: 'flex', flexDirection: 'column',
        gap: 3, overflowY: 'auto'
      }}>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            title={collapsed ? label : undefined}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px',
              borderRadius: 'var(--rad-sm)', cursor: 'pointer',
              textDecoration: 'none', fontSize: 13, fontWeight: 500,
              whiteSpace: 'nowrap', overflow: 'hidden',
              background: isActive ? 'var(--primary-tint)' : 'transparent',
              color: isActive ? 'var(--primary)' : 'var(--text)',
              transition: 'background 150ms'
            })}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement
              if (!el.style.background.includes('primary-tint')) {
                el.style.background = 'var(--hoverbg)'
              }
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement
              // restore: NavLink already sets background via style prop, but we need to let React re-render
              // workaround: remove inline override so style prop takes over
              el.style.background = ''
            }}
          >
            <span style={{ width: 20, height: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={18} />
            </span>
            {!collapsed && <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div style={{ padding: 10, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button
          onClick={toggleSidebar}
          title={collapsed ? 'Mở rộng' : 'Thu gọn'}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px',
            borderRadius: 'var(--rad-sm)', cursor: 'pointer', background: 'none', border: 'none',
            color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
            width: '100%'
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <span style={{ width: 20, height: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {collapsed ? <IconChevronsRight size={18} /> : <IconChevronsLeft size={18} />}
          </span>
          {!collapsed && <span>Thu gọn</span>}
        </button>
      </div>
    </aside>
  )
}
