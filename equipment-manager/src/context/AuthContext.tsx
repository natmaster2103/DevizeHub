import { createContext, useContext, useState, type ReactNode } from 'react'
import { api, unwrap } from '@/lib/api'
import type { SessionUser, Role, LoginArgs, Permission } from '@shared/ipc'

interface AuthCtx {
  user: SessionUser | null
  role: Role
  isAdmin: boolean
  permissions: string[]
  groupIds: number[]
  hasPermission(key: Permission): boolean
  login(args: LoginArgs): Promise<void>
  logout(): Promise<void>
  toggleRole(): void
}
const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [roleOverride, setRoleOverride] = useState<Role | null>(null)
  const role: Role = roleOverride ?? user?.role ?? 'staff'
  const permissions = user?.permissions ?? []
  const groupIds = user?.groupIds ?? []
  // Admin role always has full access, regardless of explicit permission rows.
  const hasPermission = (key: Permission) => role === 'admin' || permissions.includes(key)

  async function login(args: LoginArgs) {
    const res = await unwrap(api.auth.login(args))
    setUser(res.user); setRoleOverride(null)
  }
  async function logout() {
    try {
      const res = await api.auth.logout()
      if (!res.ok) console.error('Logout IPC failed:', res.error)
    } finally {
      setUser(null)
      setRoleOverride(null)
    }
  }
  function toggleRole() { setRoleOverride((r) => (role === 'admin' ? 'staff' : 'admin')) }

  return (
    <Ctx.Provider value={{ user, role, isAdmin: role === 'admin', permissions, groupIds, hasPermission, login, logout, toggleRole }}>
      {children}
    </Ctx.Provider>
  )
}
export function useAuth() { const c = useContext(Ctx); if (!c) throw new Error('useAuth outside provider'); return c }
