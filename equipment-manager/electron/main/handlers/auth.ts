import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import type { AppDb } from '../db'
import { appUsers, userPermissions, userGroups } from '../db/schema'
import { session } from '../session'
import type { LoginArgs, ApiResponse, LoginResult, SessionUser, Role } from '@shared/ipc'

const BAD_CREDS = { code: 'BAD_CREDENTIALS', message: 'Tên đăng nhập hoặc mật khẩu không đúng.' }

export function makeAuthHandlers(db: AppDb) {
  return {
    async login(args: LoginArgs): Promise<ApiResponse<LoginResult>> {
      if (!args?.username || !args?.password || typeof args.username !== 'string' || typeof args.password !== 'string') {
        return { ok: false, error: BAD_CREDS }
      }
      const row = db.select().from(appUsers).where(eq(appUsers.username, args.username)).all()[0]
      // Check existence first (no bcrypt if user unknown)
      if (!row) return { ok: false, error: BAD_CREDS }
      // Check active before running bcrypt (prevents timing oracle for disabled accounts)
      if (row.active === 0) return { ok: false, error: BAD_CREDS }
      // Now compare password
      if (!bcrypt.compareSync(args.password, row.passwordHash)) {
        return { ok: false, error: BAD_CREDS }
      }
      const perms = db.select({ permission: userPermissions.permission })
        .from(userPermissions)
        .where(eq(userPermissions.userId, row.id))
        .all()
        .map((p) => p.permission)

      const gids = db.select({ groupId: userGroups.groupId })
        .from(userGroups)
        .where(eq(userGroups.userId, row.id))
        .all()
        .map((g) => g.groupId)

      const user: SessionUser = {
        id: row.id, username: row.username, role: row.role as Role,
        displayName: row.displayName, permissions: perms, groupIds: gids,
      }
      session.current = user
      return { ok: true, data: { user } }
    },
    async me(): Promise<ApiResponse<SessionUser | null>> {
      return { ok: true, data: session.current }
    },
    async logout(): Promise<ApiResponse<{ ok: true }>> {
      session.current = null
      return { ok: true, data: { ok: true } }
    }
  }
}
