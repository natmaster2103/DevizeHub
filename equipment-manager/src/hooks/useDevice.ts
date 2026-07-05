import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'

export function useDevice(sku: string) {
  return useQuery({ queryKey: ['device', sku], queryFn: () => unwrap(api.devices.get({ sku })) })
}
