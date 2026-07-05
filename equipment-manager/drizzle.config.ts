import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './electron/main/db/schema.ts',
  out: './electron/main/db/migrations'
})
