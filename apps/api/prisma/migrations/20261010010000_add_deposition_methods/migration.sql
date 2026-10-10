ALTER TYPE "DepositionMethod" ADD VALUE IF NOT EXISTS 'EM';
ALTER TYPE "DepositionMethod" ADD VALUE IF NOT EXISTS 'NMR';
ALTER TYPE "DepositionMethod" ADD VALUE IF NOT EXISTS 'NEUTRON';
ALTER TYPE "DepositionMethod" ADD VALUE IF NOT EXISTS 'EC';
ALTER TYPE "DepositionMethod" ADD VALUE IF NOT EXISTS 'SSNMR';
ALTER TYPE "DepositionMethod" ADD VALUE IF NOT EXISTS 'FIBER';

ALTER TABLE "Deposition"
ADD COLUMN "methods" "DepositionMethod"[] NOT NULL DEFAULT ARRAY[]::"DepositionMethod"[],
ADD COLUMN "creation" JSONB NOT NULL DEFAULT '{}';

UPDATE "Deposition"
SET "methods" = ARRAY["method"]::"DepositionMethod"[]
WHERE cardinality("methods") = 0;
