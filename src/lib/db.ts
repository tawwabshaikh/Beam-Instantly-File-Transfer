import { createClient } from '@libsql/client'
import { randomUUID } from 'node:crypto'

const globalForTurso = globalThis as typeof globalThis & {
  tursoClient?: ReturnType<typeof createClient>
}

function getTursoClient() {
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  if (!url || !authToken) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured')
  }

  return (globalForTurso.tursoClient ??= createClient({ url, authToken }))
}

export async function recordTransferSession(input: {
  code: string
  tokenHash: string
  fileCount: number
  totalBytes: number
  expiresAt: Date
}) {
  await getTursoClient().execute({
    sql: `INSERT INTO "TransferSession"
      ("id", "code", "tokenHash", "status", "fileCount", "totalBytes", "createdAt", "expiresAt")
      VALUES (?, ?, ?, 'active', ?, ?, CURRENT_TIMESTAMP, ?)`,
    args: [randomUUID(), input.code, input.tokenHash, input.fileCount, input.totalBytes, input.expiresAt.toISOString()],
  })
}

export async function markTransferSessionConnected(code: string) {
  await getTursoClient().execute({
    sql: `UPDATE "TransferSession" SET "status" = 'connected'
      WHERE "code" = ? AND "status" = 'active'`,
    args: [code],
  })
}

export async function markTransferSessionEnded(code: string, tokenHash: string) {
  await getTursoClient().execute({
    sql: `UPDATE "TransferSession" SET "status" = 'ended', "endedAt" = CURRENT_TIMESTAMP
      WHERE "code" = ? AND "tokenHash" = ?`,
    args: [code, tokenHash],
  })
}
