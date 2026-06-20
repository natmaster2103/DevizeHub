import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface UiCtx { dark: boolean; collapsed: boolean; toggleTheme(): void; toggleSidebar(): void }
const Ctx = createContext<UiCtx | null>(null)

function read(key: string, def: boolean) {
  const v = localStorage.getItem(key); return v == null ? def : v === '1'
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => read('equiphub.dark', false))
  const [collapsed, setCollapsed] = useState(() => read('equiphub.collapsed', false))
  useEffect(() => { localStorage.setItem('equiphub.dark', dark ? '1' : '0') }, [dark])
  useEffect(() => { localStorage.setItem('equiphub.collapsed', collapsed ? '1' : '0') }, [collapsed])
  return (
    <Ctx.Provider value={{ dark, collapsed, toggleTheme: () => setDark((v) => !v), toggleSidebar: () => setCollapsed((v) => !v) }}>
      {children}
    </Ctx.Provider>
  )
}
export function useUi() { const c = useContext(Ctx); if (!c) throw new Error('useUi outside provider'); return c }
