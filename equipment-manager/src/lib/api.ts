import type { ApiResponse, Api } from '@shared/ipc'

// Lazy getter so module-level eval doesn't touch window.api (safe in test environments).
export const api: Api = new Proxy({} as Api, {
  get(_t, domain: string) {
    return new Proxy({}, {
      get(_t2, method: string) {
        return (...args: unknown[]) => (window.api as never as Record<string, Record<string, (...a: unknown[]) => unknown>>)[domain][method](...args)
      }
    })
  }
})

export async function unwrap<T>(p: Promise<ApiResponse<T>>): Promise<T> {
  const res = await p
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}
