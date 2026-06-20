import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import type { DeviceStatus } from '@shared/ipc'

export function useDevices(filter: 'all' | DeviceStatus, query: string) {
  return useQuery({
    queryKey: ['devices', filter, query],
    queryFn: () => unwrap(api.devices.list({ filter, query }))
  })
}
