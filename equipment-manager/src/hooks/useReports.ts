import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import type { ReportArgs } from '@shared/ipc'

export function useReports(args: ReportArgs) {
  return useQuery({
    queryKey: ['reports', args.from, args.to],
    queryFn: () => unwrap(api.reports.summary(args)),
  })
}
