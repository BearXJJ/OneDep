CREATE TYPE "DepositionMethod" AS ENUM ('XRAY');
CREATE TYPE "DepositionStatus" AS ENUM ('DRAFT', 'SUBMITTED');
CREATE TYPE "DepositionFileKind" AS ENUM ('COORDINATE', 'STRUCTURE_FACTOR');

CREATE TABLE "Deposition" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "method" "DepositionMethod" NOT NULL DEFAULT 'XRAY',
    "status" "DepositionStatus" NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "submitterId" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DepositionFile" (
    "id" SERIAL NOT NULL,
    "depositionId" INTEGER NOT NULL,
    "kind" "DepositionFileKind" NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositionFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Deposition_code_key" ON "Deposition"("code");
CREATE INDEX "Deposition_submitterId_updatedAt_idx" ON "Deposition"("submitterId", "updatedAt");
CREATE UNIQUE INDEX "DepositionFile_depositionId_kind_key" ON "DepositionFile"("depositionId", "kind");

ALTER TABLE "Deposition"
ADD CONSTRAINT "Deposition_submitterId_fkey"
FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepositionFile"
ADD CONSTRAINT "DepositionFile_depositionId_fkey"
FOREIGN KEY ("depositionId") REFERENCES "Deposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
