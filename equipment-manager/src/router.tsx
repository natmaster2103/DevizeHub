import { createHashRouter } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import Dashboard from '@/pages/Dashboard'
import Devices from '@/pages/Devices'
import DeviceDetail from '@/pages/DeviceDetail'
import Requests from '@/pages/Requests'
import RequestDetail from '@/pages/RequestDetail'
import Allocate from '@/pages/Allocate'
import Reports from '@/pages/Reports'
import Catalog from '@/pages/Catalog'
import Settings from '@/pages/Settings'

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'devices', element: <Devices /> },
      { path: 'devices/:sku', element: <DeviceDetail /> },
      { path: 'requests', element: <Requests /> },
      { path: 'requests/:id', element: <RequestDetail /> },
      { path: 'allocate', element: <Allocate /> },
      { path: 'reports', element: <Reports /> },
      { path: 'catalog', element: <Catalog /> },
      { path: 'settings', element: <Settings /> }
    ]
  }
])
