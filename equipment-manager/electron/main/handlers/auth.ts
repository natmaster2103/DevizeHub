import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import type { AppDb } from '../db'
import { appUsers } from '../db/schema'
import { session } from '../session'
import type { LoginArgs, ApiResponse, LoginResult, SessionUser } from '@shared/ipc'

const BAD_CREDS = { code: 'BAD_CREDENTIALS', message: 'Tên đăng nhập hoặc mật khẩu không đúng.' }

export function makeAuthHandlers(db: AppDb) {
  return {
    async login(args: LoginArgs): Promise<ApiResponse<LoginResult>> {
      const row = db.select().from(appUsers).where(eq(appUsers.username, args.username)).all()[0]
      if (!row || !bcrypt.compareSync(args.password, row.passwordHash)) {
        return { ok: false, error: BAD_CREDS }
      }
      if (row.active === 0) {
        return { ok: false, error: { code: 'ACCOUNT_DISABLED', message: 'Tài khoản đã bị khóa.' } }
      }
      const user: SessionUser = { id: row.id, username: row.username, role: row.role, displayName: row.displayName }
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
