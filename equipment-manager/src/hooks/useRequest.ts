import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'

export function useRequest(id: number | null) {
  return useQuery({
    queryKey: ['request', id],
    queryFn: () => unwrap(api.requests.get({ id: id! })),
    enabled: id != null
  })
}

export function useAvailableDevices(enabled: boolean) {
  return useQuery({
    queryKey: ['requests', 'available-devices'],
    queryFn: () => unwrap(api.requests.availableDevices()),
    enabled
  })
}
