import { eq } from 'drizzle-orm'
import { statSync } from 'fs'
import bcrypt from 'bcryptjs'
import type { AppDb } from '../db'
import {
  appUsers,
  allocations,
  maintenanceLogs,
  requests,
  devices,
  employees,
  categories,
  departments,
  userPermissions,
  userGroups,
} from '../db/schema'
import { seedIfEmpty } from '../db/seed'
import { session } from '../session'
import type {
  ApiResponse,
  AppUserRow,
  SaveUserArgs,
  SaveUserPermissionsArgs,
  SaveUserGroupsArgs,
  ChangePasswordArgs,
  DbInfoResult,
  Role,
  Permission,
} from '@shared/ipc'

function now() { return new Date().toISOString() }

export function requirePermission(perm: Permission): ApiResponse<never> | null {
  if (!session.current?.permissions?.includes(perm)) {
    return { ok: false, error: { code: 'FORBIDDEN', message: 'Bạn không có quyền thực hiện thao tác này.' } }
  }
  return null
}

export function makeSettingsHandlers(db: AppDb, dbPath: string) {
  return {
    async listUsers(): Promise<ApiResponse<AppUserRow[]>> {
      const rows = db.select().from(appUsers).all()
      return {
        ok: true,
        data: rows.map<AppUserRow>((u) => {
          const perms = db.select({ permission: userPermissions.permission })
            .from(userPermissions)
            .where(eq(userPermissions.userId, u.id))
            .all()
            .map((p) => p.permission)
          const gids = db.select({ groupId: userGroups.groupId })
            .from(userGroups)
            .where(eq(userGroups.userId, u.id))
            .all()
            .map((g) => g.groupId)
          return {
            id: u.id, username: u.username, displayName: u.displayName,
            role: u.role as Role, active: u.active === 1,
            permissions: perms, groupIds: gids,
          }
        }),
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
          data: { id: args.id, username: args.username.trim(), displayName: args.displayName.trim(), role: args.role, active: args.active, permissions: [], groupIds: [] },
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
        data: { id: result.id, username: result.username, displayName: result.displayName, role: result.role as Role, active: result.active === 1, permissions: [], groupIds: [] },
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

    resetData(): ApiResponse<{ ok: true }> {
      const forbidden = requirePermission('reset_data')
      if (forbidden) return forbidden
      // Wipe all tables (children first to satisfy FK constraints), then reseed.
      db.transaction((tx) => {
        tx.delete(allocations).run()
        tx.delete(maintenanceLogs).run()
        tx.delete(requests).run()
        tx.delete(devices).run()
        tx.delete(employees).run()
        tx.delete(appUsers).run()
        tx.delete(categories).run()
        tx.delete(departments).run()
      })
      seedIfEmpty(db)
      return { ok: true, data: { ok: true } }
    },

    async saveUserPermissions(args: SaveUserPermissionsArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_users')
      if (forbidden) return forbidden
      if (!args?.userId) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'userId không hợp lệ.' } }
      }
      db.delete(userPermissions).where(eq(userPermissions.userId, args.userId)).run()
      for (const perm of (args.permissions ?? [])) {
        db.insert(userPermissions).values({ userId: args.userId, permission: perm }).run()
      }
      return { ok: true, data: { ok: true } }
    },

    async saveUserGroups(args: SaveUserGroupsArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_users')
      if (forbidden) return forbidden
      if (!args?.userId) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'userId không hợp lệ.' } }
      }
      db.delete(userGroups).where(eq(userGroups.userId, args.userId)).run()
      for (const gid of (args.groupIds ?? [])) {
        db.insert(userGroups).values({ userId: args.userId, groupId: gid }).run()
      }
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
