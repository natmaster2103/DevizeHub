import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { UiProvider, useUi } from '@/context/UiContext'
import { router } from '@/router'
import Login from '@/pages/Login'
import { useAutoLogoutWatcher } from '@/hooks/useAutoLogoutWatcher'

function Shell() {
  const { user } = useAuth()
  const { dark } = useUi()
  useAutoLogoutWatcher()
  return (
    <div className={`app-theme${dark ? ' dark' : ''}`}>
      {user ? <RouterProvider router={router} /> : <Login />}
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UiProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </UiProvider>
    </QueryClientProvider>
  )
}
