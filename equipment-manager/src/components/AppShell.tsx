import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Tổng quan', subtitle: 'Thống kê tổng hợp' },
  '/devices': { title: 'Thiết bị', subtitle: 'Quản lý thiết bị' },
  '/requests': { title: 'Phiếu đề nghị', subtitle: 'Quản lý phiếu đề nghị' },
  '/allocate': { title: 'Cấp phát lẻ', subtitle: 'Cấp phát thiết bị đơn lẻ' },
  '/reports': { title: 'Báo cáo', subtitle: 'Thống kê và báo cáo' },
  '/catalog': { title: 'Danh mục', subtitle: 'Danh mục thiết bị' },
  '/settings': { title: 'Cài đặt', subtitle: 'Cấu hình hệ thống' }
}

function usePageMeta() {
  const { pathname } = useLocation()
  // Match /devices/:sku
  if (pathname.startsWith('/devices/')) {
    return { title: 'Chi tiết thiết bị', subtitle: pathname.replace('/devices/', '') }
  }
  return TITLES[pathname] ?? { title: pathname, subtitle: '' }
}

export function AppShell() {
  const { title, subtitle } = usePageMeta()
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <Topbar title={title} subtitle={subtitle} />
        <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
