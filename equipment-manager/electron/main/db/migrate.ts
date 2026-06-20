import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'path'
import type { AppDb } from './index'

// In dev/test the migrations live in source; in a packaged build they are
// copied next to the compiled main bundle (configured in M6).
const MIGRATIONS_DIR = join(__dirname, 'migrations')
const SOURCE_DIR = join(process.cwd(), 'electron/main/db/migrations')

export function runMigrations(db: AppDb, dir?: string): void {
  const folder = dir ?? (require('fs').existsSync(MIGRATIONS_DIR) ? MIGRATIONS_DIR : SOURCE_DIR)
  migrate(db, { migrationsFolder: folder })
}
