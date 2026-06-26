import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import type { DeviceStatus } from '@shared/ipc'

export function useDevices(
  filter: 'all' | DeviceStatus,
  query: string,
  page = 1,
  pageSize = 20,
  categoryId?: number | null
) {
  return useQuery({
    queryKey: ['devices', filter, query, page, pageSize, categoryId ?? null],
    queryFn: () => unwrap(api.devices.list({ filter, query, page, pageSize, categoryId: categoryId ?? null })),
  })
}
