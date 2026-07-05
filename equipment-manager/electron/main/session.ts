import type { SessionUser } from '@shared/ipc'
export const session: { current: SessionUser | null } = { current: null }
