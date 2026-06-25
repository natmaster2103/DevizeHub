import { eq, and } from 'drizzle-orm'
import type { AppDb } from '../db'
import { categories, departments, employees, deviceGroups, devices } from '../db/schema'
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
} from '@shared/ipc'

function now() { return new Date().toISOString() }

export function makeCatalogHandlers(db: AppDb) {
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
          })),
        },
      }
    },

    async saveCategory(args: SaveCategoryArgs): Promise<ApiResponse<CategoryRow>> {
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
      db.delete(departments).where(eq(departments.id, args.id)).run()
      return { ok: true, data: { ok: true } }
    },

    async saveEmployee(args: SaveEmployeeArgs): Promise<ApiResponse<EmployeeRow>> {
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
      db.delete(employees).where(eq(employees.id, args.id)).run()
      return { ok: true, data: { ok: true } }
    },

    async saveGroup(args: SaveGroupArgs): Promise<ApiResponse<{ ok: true }>> {
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
      db.update(devices)
        .set({ groupId: null })
        .where(eq(devices.groupId, args.id))
        .run()
      db.delete(deviceGroups).where(eq(deviceGroups.id, args.id)).run()
      return { ok: true, data: { ok: true } }
    },
  }
}
