import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { dateKey, minutesSinceMidnight, parseTimeToMinutes, shouldTriggerLogout } from '@/lib/autoLogout'

const POLL_INTERVAL_MS = 20_000

export function useAutoLogoutWatcher(): void {
  const { user, logout, setAutoLogoutMessage } = useAuth()
  const dayState = useRef<{ date: string; handled: boolean } | null>(null)

  const { data: config } = useQuery({
    queryKey: ['settings', 'autoLogout'],
    queryFn: () => unwrap(api.settings.getAutoLogoutConfig()),
    enabled: !!user,
    refetchInterval: 60_000,
  })

  useEffect(() => {
    if (!user || !config?.enabled) return

    dayState.current = null
    const targetMinutes = parseTimeToMinutes(config.time)
    const configTime = config.time

    function tick() {
      const now = new Date()
      const today = dateKey(now)
      const nowMinutes = minutesSinceMidnight(now)

      if (dayState.current?.date !== today) {
        dayState.current = { date: today, handled: nowMinutes >= targetMinutes }
        return
      }
      if (shouldTriggerLogout(nowMinutes, targetMinutes, dayState.current.handled)) {
        dayState.current.handled = true
        logout()
        setAutoLogoutMessage(`Đã tự động đăng xuất lúc ${configTime} theo cấu hình hệ thống.`)
      }
    }

    tick()
    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [user, config?.enabled, config?.time, logout, setAutoLogoutMessage])
}
