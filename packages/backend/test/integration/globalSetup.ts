import { execSync } from 'node:child_process'
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'

let container: StartedPostgreSqlContainer

export async function setup(): Promise<void> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  const databaseUrl = container.getConnectionUri()
  process.env.DATABASE_URL = databaseUrl

  const schemaPath = path.resolve(import.meta.dirname, '../../prisma/schema.prisma')
  execSync(`npx prisma migrate deploy --schema=${schemaPath}`, {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  })
}

export async function teardown(): Promise<void> {
  await container.stop()
}
