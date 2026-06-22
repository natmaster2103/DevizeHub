import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'

export function useRequests(query: string) {
  return useQuery({
    queryKey: ['requests', query],
    queryFn: () => unwrap(api.requests.list({ query }))
  })
}
