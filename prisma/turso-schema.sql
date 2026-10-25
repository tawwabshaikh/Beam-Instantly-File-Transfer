-- Run once in the Turso database SQL console to create the optional metadata table.
-- Live session state and file bytes are not stored in this database.
CREATE TABLE IF NOT EXISTS "TransferSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "fileCount" INTEGER NOT NULL DEFAULT 0,
  "totalBytes" INTEGER NOT NULL DEFAULT 0,
  "guestDevice" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL,
  "endedAt" DATETIME
);

CREATE UNIQUE INDEX IF NOT EXISTS "TransferSession_code_key"
  ON "TransferSession"("code");
CREATE INDEX IF NOT EXISTS "TransferSession_createdAt_idx"
  ON "TransferSession"("createdAt");
CREATE INDEX IF NOT EXISTS "TransferSession_status_idx"
  ON "TransferSession"("status");
