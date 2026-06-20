import { createHashRouter } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import Dashboard from '@/pages/Dashboard'
import Devices from '@/pages/Devices'
import DeviceDetail from '@/pages/DeviceDetail'
import { Placeholder } from '@/components/Placeholder'

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'devices', element: <Devices /> },
      { path: 'devices/:sku', element: <DeviceDetail /> },
      { path: 'requests', element: <Placeholder title="Phiếu đề nghị" /> },
      { path: 'allocate', element: <Placeholder title="Cấp phát lẻ" /> },
      { path: 'reports', element: <Placeholder title="Báo cáo" /> },
      { path: 'catalog', element: <Placeholder title="Danh mục" /> },
      { path: 'settings', element: <Placeholder title="Cài đặt" /> }
    ]
  }
])
