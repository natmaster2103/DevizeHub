import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'

export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => unwrap(api.dashboard.summary()) })
}
