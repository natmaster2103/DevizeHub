import { copyFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { extname, join } from 'path'
import { eq, sql } from 'drizzle-orm'
import type { AppDb } from '../db'
import { categories, departments, employees, deviceGroups, devices, groupFieldTemplates, groupFieldValues } from '../db/schema'
import { requirePermission } from './settings'
import type {
  ApiResponse,
  CatalogListResult,
  CategoryRow,
  DepartmentRow,
  EmployeeRow,
  GroupRow,
  SaveCategoryArgs,
  SaveDepartmentArgs,
  SaveEmployeeArgs,
  SaveGroupArgs,
  DeleteEntityArgs,
  GroupFieldTemplate,
  GroupDetailResult,
  SaveGroupTemplateArgs,
  SaveGroupDetailArgs,
} from '@shared/ipc'

function now() { return new Date().toISOString() }

export function makeCatalogHandlers(db: AppDb, userDataPath?: string) {
  return {
    async list(): Promise<ApiResponse<CatalogListResult>> {
      const cats = db.select().from(categories).all()
      const depts = db.select().from(departments).all()
      const emps = db
        .select({
          id: employees.id,
          name: employees.name,
          employeeCode: employees.employeeCode,
          departmentId: employees.departmentId,
          departmentName: departments.name,
        })
        .from(employees)
        .leftJoin(departments, eq(employees.departmentId, departments.id))
        .all()
      const grps = db
        .select({
          id: deviceGroups.id,
          name: deviceGroups.name,
          categoryId: deviceGroups.categoryId,
          thumbnailPath: deviceGroups.thumbnailPath,
          categoryName: categories.name,
        })
        .from(deviceGroups)
        .leftJoin(categories, eq(deviceGroups.categoryId, categories.id))
        .all()

      return {
        ok: true,
        data: {
          categories: cats.map<CategoryRow>((c) => ({ id: c.id, name: c.name, minStock: c.minStock })),
          departments: depts.map<DepartmentRow>((d) => ({ id: d.id, name: d.name })),
          employees: emps.map<EmployeeRow>((e) => ({
            id: e.id,
            name: e.name,
            employeeCode: e.employeeCode,
            departmentId: e.departmentId ?? null,
            departmentName: e.departmentName ?? '',
          })),
          groups: grps.map<GroupRow>((g) => ({
            id: g.id,
            name: g.name,
            categoryId: g.categoryId ?? 0,
            categoryName: g.categoryName ?? '',
            thumbnailPath: g.thumbnailPath ?? null,
          })),
        },
      }
    },

    async saveCategory(args: SaveCategoryArgs): Promise<ApiResponse<CategoryRow>> {
      const forbidden = requirePermission('manage_catalog')
      if (forbidden) return forbidden
      if (!args?.name?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Tên loại không được trống.' } }
      }
      if (args.id) {
        db.update(categories)
          .set({ name: args.name.trim(), minStock: args.minStock ?? 0 })
          .where(eq(categories.id, args.id))
          .run()
        return { ok: true, data: { id: args.id, name: args.name.trim(), minStock: args.minStock ?? 0 } }
      }
      const result = db.insert(categories)
        .values({ name: args.name.trim(), minStock: args.minStock ?? 0, createdAt: now() })
        .returning()
        .all()[0]
      return { ok: true, data: { id: result.id, name: result.name, minStock: result.minStock } }
    },

    async deleteCategory(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_catalog')
      if (forbidden) return forbidden
      const hasGroups = db.select({ id: deviceGroups.id })
        .from(deviceGroups)
        .where(eq(deviceGroups.categoryId, args.id))
        .all()
      if (hasGroups.length > 0) {
        return {
          ok: false,
          error: { code: 'CONFLICT', message: 'Vui lòng xóa hoặc chuyển nhóm trước.' },
        }
      }
      db.delete(categories).where(eq(categories.id, args.id)).run()
      return { ok: true, data: { ok: true } }
    },

    async saveDepartment(args: SaveDepartmentArgs): Promise<ApiResponse<DepartmentRow>> {
      const forbidden = requirePermission('manage_catalog')
      if (forbidden) return forbidden
      if (!args?.name?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Tên phòng ban không được trống.' } }
      }
      if (args.id) {
        db.update(departments).set({ name: args.name.trim() }).where(eq(departments.id, args.id)).run()
        return { ok: true, data: { id: args.id, name: args.name.trim() } }
      }
      const result = db.insert(departments)
        .values({ name: args.name.trim(), createdAt: now() })
        .returning()
        .all()[0]
      return { ok: true, data: { id: result.id, name: result.name } }
    },

    async deleteDepartment(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_catalog')
      if (forbidden) return forbidden
      db.delete(departments).where(eq(departments.id, args.id)).run()
      return { ok: true, data: { ok: true } }
    },

    async saveEmployee(args: SaveEmployeeArgs): Promise<ApiResponse<EmployeeRow>> {
      const forbidden = requirePermission('manage_catalog')
      if (forbidden) return forbidden
      if (!args?.name?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Tên nhân viên không được trống.' } }
      }
      if (!args?.employeeCode?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Mã nhân viên không được trống.' } }
      }
      const deptName = args.departmentId
        ? (db.select({ name: departments.name }).from(departments).where(eq(departments.id, args.departmentId)).all()[0]?.name ?? '')
        : ''

      if (args.id) {
        db.update(employees)
          .set({ name: args.name.trim(), employeeCode: args.employeeCode.trim(), departmentId: args.departmentId ?? null })
          .where(eq(employees.id, args.id))
          .run()
        return { ok: true, data: { id: args.id, name: args.name.trim(), employeeCode: args.employeeCode.trim(), departmentId: args.departmentId ?? null, departmentName: deptName } }
      }
      const result = db.insert(employees)
        .values({ name: args.name.trim(), employeeCode: args.employeeCode.trim(), departmentId: args.departmentId ?? null, createdAt: now() })
        .returning()
        .all()[0]
      return { ok: true, data: { id: result.id, name: result.name, employeeCode: result.employeeCode, departmentId: result.departmentId ?? null, departmentName: deptName } }
    },

    async deleteEmployee(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_catalog')
      if (forbidden) return forbidden
      db.delete(employees).where(eq(employees.id, args.id)).run()
      return { ok: true, data: { ok: true } }
    },

    async saveGroup(args: SaveGroupArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_catalog')
      if (forbidden) return forbidden
      if (!args?.name?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Tên nhóm không được trống.' } }
      }
      if (args.id) {
        db.update(deviceGroups)
          .set({ name: args.name.trim(), categoryId: args.categoryId })
          .where(eq(deviceGroups.id, args.id))
          .run()
      } else {
        db.insert(deviceGroups)
          .values({ name: args.name.trim(), categoryId: args.categoryId, createdAt: now() })
          .run()
      }
      return { ok: true, data: { ok: true } }
    },

    async deleteGroup(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_catalog')
      if (forbidden) return forbidden
      const group = db.select({ thumbnailPath: deviceGroups.thumbnailPath })
        .from(deviceGroups).where(eq(deviceGroups.id, args.id)).all()[0]
      db.update(devices).set({ groupId: null }).where(eq(devices.groupId, args.id)).run()
      db.delete(deviceGroups).where(eq(deviceGroups.id, args.id)).run()
      if (group?.thumbnailPath) {
        try { unlinkSync(group.thumbnailPath) } catch {}
      }
      return { ok: true, data: { ok: true } }
    },

    async listGroupTemplates(): Promise<ApiResponse<{ templates: GroupFieldTemplate[] }>> {
      const rows = db.select().from(groupFieldTemplates).orderBy(groupFieldTemplates.displayOrder).all()
      return {
        ok: true,
        data: {
          templates: rows.map(r => ({ id: r.id, name: r.name, displayOrder: r.displayOrder })),
        },
      }
    },

    async saveGroupTemplate(args: SaveGroupTemplateArgs): Promise<ApiResponse<GroupFieldTemplate>> {
      const forbidden = requirePermission('manage_catalog')
      if (forbidden) return forbidden
      if (!args?.name?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Tên trường không được để trống.' } }
      }
      if (args.id) {
        db.update(groupFieldTemplates)
          .set({ name: args.name.trim(), displayOrder: args.displayOrder ?? 0 })
          .where(eq(groupFieldTemplates.id, args.id))
          .run()
        return { ok: true, data: { id: args.id, name: args.name.trim(), displayOrder: args.displayOrder ?? 0 } }
      }
      const result = db.insert(groupFieldTemplates)
        .values({ name: args.name.trim(), displayOrder: args.displayOrder ?? 0, createdAt: now() })
        .returning()
        .all()[0]
      return { ok: true, data: { id: result.id, name: result.name, displayOrder: result.displayOrder } }
    },

    async deleteGroupTemplate(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_catalog')
      if (forbidden) return forbidden
      db.delete(groupFieldTemplates).where(eq(groupFieldTemplates.id, args.id)).run()
      return { ok: true, data: { ok: true } }
    },

    async getGroupDetail(args: { groupId: number }): Promise<ApiResponse<GroupDetailResult>> {
      const group = db.select({ thumbnailPath: deviceGroups.thumbnailPath })
        .from(deviceGroups).where(eq(deviceGroups.id, args.groupId)).all()[0]
      if (!group) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy nhóm.' } }
      }
      const values = db
        .select({
          templateId: groupFieldValues.templateId,
          name: groupFieldTemplates.name,
          value: groupFieldValues.value,
        })
        .from(groupFieldValues)
        .innerJoin(groupFieldTemplates, eq(groupFieldValues.templateId, groupFieldTemplates.id))
        .where(eq(groupFieldValues.groupId, args.groupId))
        .all()
      return {
        ok: true,
        data: {
          thumbnailPath: group.thumbnailPath ?? null,
          fields: values.map(v => ({ templateId: v.templateId, name: v.name, value: v.value })),
        },
      }
    },

    async saveGroupDetail(args: SaveGroupDetailArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_catalog')
      if (forbidden) return forbidden
      const group = db.select({ thumbnailPath: deviceGroups.thumbnailPath })
        .from(deviceGroups).where(eq(deviceGroups.id, args.groupId)).all()[0]
      if (!group) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy nhóm.' } }
      }

      if (args.thumbnailSourcePath === '') {
        if (group.thumbnailPath) { try { unlinkSync(group.thumbnailPath) } catch {} }
        db.update(deviceGroups).set({ thumbnailPath: null }).where(eq(deviceGroups.id, args.groupId)).run()
      } else if (args.thumbnailSourcePath !== null && userDataPath) {
        const thumbDir = join(userDataPath, 'thumbnails')
        if (!existsSync(thumbDir)) mkdirSync(thumbDir, { recursive: true })
        const ext = extname(args.thumbnailSourcePath)
        const destPath = join(thumbDir, `${args.groupId}-${Date.now()}${ext}`)
        copyFileSync(args.thumbnailSourcePath, destPath)
        if (group.thumbnailPath) { try { unlinkSync(group.thumbnailPath) } catch {} }
        db.update(deviceGroups).set({ thumbnailPath: destPath }).where(eq(deviceGroups.id, args.groupId)).run()
      }

      for (const field of args.fields) {
        db.run(sql`
          INSERT INTO group_field_values (group_id, template_id, value)
          VALUES (${args.groupId}, ${field.templateId}, ${field.value})
          ON CONFLICT(group_id, template_id) DO UPDATE SET value = excluded.value
        `)
      }

      return { ok: true, data: { ok: true } }
    },
  }
}
