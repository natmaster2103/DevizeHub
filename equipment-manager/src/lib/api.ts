import type { ApiResponse } from '@shared/ipc'
export const api = window.api

export async function unwrap<T>(p: Promise<ApiResponse<T>>): Promise<T> {
  const res = await p
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}
