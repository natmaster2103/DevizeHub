import { sqliteTable, integer, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  minStock: integer('min_stock').notNull().default(0),
  createdAt: text('created_at').notNull()
})

export const deviceGroups = sqliteTable('device_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  minStock: integer('min_stock').notNull().default(0),
  createdAt: text('created_at').notNull()
})

export const departments = sqliteTable('departments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull()
})

export const employees = sqliteTable('employees', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  employeeCode: text('employee_code').notNull(),
  departmentId: integer('department_id').references(() => departments.id),
  createdAt: text('created_at').notNull()
})

export const appUsers = sqliteTable('app_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'staff'] }).notNull(),
  displayName: text('display_name').notNull(),
  active: integer('active').notNull().default(1),
  createdAt: text('created_at').notNull()
})

export const userPermissions = sqliteTable('user_permissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  permission: text('permission').notNull(),
}, (t) => ({
  uniq: uniqueIndex('uq_user_perm').on(t.userId, t.permission),
}))

export const userGroups = sqliteTable('user_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  groupId: integer('group_id').notNull().references(() => deviceGroups.id, { onDelete: 'cascade' }),
}, (t) => ({
  uniq: uniqueIndex('uq_user_group').on(t.userId, t.groupId),
}))

export const devices = sqliteTable('devices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  serialNumber: text('serial_number'),
  status: text('status', {
    enum: ['available', 'allocated', 'maintenance', 'broken', 'decommissioned']
  }).notNull(),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  groupId: integer('group_id').references(() => deviceGroups.id),
})

export const requests = sqliteTable('requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  departmentId: integer('department_id').references(() => departments.id),
  employeeId: integer('employee_id').references(() => employees.id),
  createdBy: integer('created_by').references(() => appUsers.id),
  createdAt: text('created_at').notNull(),
  notes: text('notes')
})

export const allocations = sqliteTable('allocations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  requestId: integer('request_id').references(() => requests.id),
  deviceId: integer('device_id').references(() => devices.id).notNull(),
  employeeId: integer('employee_id').references(() => employees.id),
  departmentId: integer('department_id').references(() => departments.id),
  issuedBy: integer('issued_by').references(() => appUsers.id),
  issuedAt: text('issued_at').notNull(),
  dueDate: text('due_date'),
  returnedAt: text('returned_at'),
  conditionOut: text('condition_out'),
  conditionIn: text('condition_in'),
  notes: text('notes')
})

export const maintenanceLogs = sqliteTable('maintenance_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deviceId: integer('device_id').references(() => devices.id).notNull(),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  description: text('description'),
  performedBy: text('performed_by')
})

export const schema = {
  categories, deviceGroups, departments, employees, appUsers,
  userPermissions, userGroups,
  devices, requests, allocations, maintenanceLogs
}

export type Category = typeof categories.$inferSelect
export type DeviceGroup = typeof deviceGroups.$inferSelect
export type Department = typeof departments.$inferSelect
export type Employee = typeof employees.$inferSelect
export type AppUser = typeof appUsers.$inferSelect
export type Device = typeof devices.$inferSelect
export type RequestRow = typeof requests.$inferSelect
export type Allocation = typeof allocations.$inferSelect
export type MaintenanceLog = typeof maintenanceLogs.$inferSelect
export type DeviceStatus = Device['status']
export type UserPermission = typeof userPermissions.$inferSelect
export type UserGroup = typeof userGroups.$inferSelect
