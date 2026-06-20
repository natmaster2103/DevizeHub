import type { ApiResponse, Api } from '@shared/ipc'

// Lazy getters — window.api is only read when a method is called, not at module load.
export const api: Api = {
  get auth() { return window.api.auth },
  get devices() { return window.api.devices },
  get dashboard() { return window.api.dashboard },
}

export async function unwrap<T>(p: Promise<ApiResponse<T>>): Promise<T> {
  const res = await p
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}
