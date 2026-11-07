ALTER TYPE "DepositionFileKind" ADD VALUE 'EM_MAP';
ALTER TYPE "DepositionFileKind" ADD VALUE 'EM_HALF_MAP';
ALTER TYPE "DepositionFileKind" ADD VALUE 'EM_IMAGE';
ALTER TABLE "Deposition" ADD COLUMN "profile" TEXT, ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "answers" JSONB NOT NULL DEFAULT '{}', ADD COLUMN "origins" JSONB NOT NULL DEFAULT '[]', ADD COLUMN "checks" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "DepositionFile" ADD COLUMN "slot" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "parseState" TEXT NOT NULL DEFAULT 'pending',
 ADD COLUMN "parseError" TEXT, ADD COLUMN "parseResult" JSONB NOT NULL DEFAULT '{}';
DROP INDEX "DepositionFile_depositionId_kind_key";
CREATE UNIQUE INDEX "DepositionFile_depositionId_kind_slot_revision_key" ON "DepositionFile"("depositionId","kind","slot","revision");
CREATE INDEX "DepositionFile_depositionId_active_idx" ON "DepositionFile"("depositionId","active");
CREATE TABLE "Submission" ("id" TEXT PRIMARY KEY, "depositionId" INTEGER NOT NULL UNIQUE REFERENCES "Deposition"("id"),
 "snapshot" JSONB NOT NULL, "exportName" TEXT NOT NULL, "checksum" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
