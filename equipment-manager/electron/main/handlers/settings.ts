import { eq } from 'drizzle-orm'
import { statSync } from 'fs'
import bcrypt from 'bcryptjs'
import type { AppDb } from '../db'
import { appUsers } from '../db/schema'
import { session } from '../session'
import type {
  ApiResponse,
  AppUserRow,
  SaveUserArgs,
  ChangePasswordArgs,
  DbInfoResult,
  Role,
} from '@shared/ipc'

function now() { return new Date().toISOString() }

export function makeSettingsHandlers(db: AppDb, dbPath: string) {
  return {
    async listUsers(): Promise<ApiResponse<AppUserRow[]>> {
      const rows = db.select().from(appUsers).all()
      return {
        ok: true,
        data: rows.map<AppUserRow>((u) => ({
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          role: u.role as Role,
          active: u.active === 1,
        })),
      }
    },

    async saveUser(args: SaveUserArgs): Promise<ApiResponse<AppUserRow>> {
      if (!args?.username?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Tên đăng nhập không được trống.' } }
      }
      if (!args?.displayName?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Họ tên không được trống.' } }
      }

      if (args.id) {
        const updates: Partial<typeof appUsers.$inferInsert> = {
          username: args.username.trim(),
          displayName: args.displayName.trim(),
          role: args.role,
          active: args.active ? 1 : 0,
        }
        if (args.password) {
          updates.passwordHash = await bcrypt.hash(args.password, 10)
        }
        db.update(appUsers).set(updates).where(eq(appUsers.id, args.id)).run()
        return {
          ok: true,
          data: { id: args.id, username: args.username.trim(), displayName: args.displayName.trim(), role: args.role, active: args.active },
        }
      }

      if (!args.password) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Mật khẩu không được trống khi tạo tài khoản mới.' } }
      }
      const hash = await bcrypt.hash(args.password, 10)
      const result = db.insert(appUsers)
        .values({
          username: args.username.trim(),
          displayName: args.displayName.trim(),
          role: args.role,
          passwordHash: hash,
          active: args.active ? 1 : 0,
          createdAt: now(),
        })
        .returning()
        .all()[0]
      return {
        ok: true,
        data: { id: result.id, username: result.username, displayName: result.displayName, role: result.role as Role, active: result.active === 1 },
      }
    },

    async changePassword(args: ChangePasswordArgs): Promise<ApiResponse<{ ok: true }>> {
      if (!session.current) {
        return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Chưa đăng nhập.' } }
      }
      if (!args?.currentPassword || !args?.newPassword) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Vui lòng điền đầy đủ thông tin.' } }
      }
      const user = db.select().from(appUsers).where(eq(appUsers.id, session.current.id)).all()[0]
      if (!user) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Tài khoản không tồn tại.' } }
      }
      const match = await bcrypt.compare(args.currentPassword, user.passwordHash)
      if (!match) {
        return { ok: false, error: { code: 'WRONG_PASSWORD', message: 'Mật khẩu hiện tại không đúng.' } }
      }
      const newHash = await bcrypt.hash(args.newPassword, 10)
      db.update(appUsers).set({ passwordHash: newHash }).where(eq(appUsers.id, user.id)).run()
      return { ok: true, data: { ok: true } }
    },

    async dbInfo(): Promise<ApiResponse<DbInfoResult>> {
      let sizeKb = 0
      let lastBackup: string | null = null
      try {
        const stat = statSync(dbPath)
        sizeKb = Math.round(stat.size / 1024)
        lastBackup = stat.mtime.toISOString()
      } catch { /* file not found in dev */ }
      return { ok: true, data: { path: dbPath, sizeKb, lastBackup } }
    },
  }
}
