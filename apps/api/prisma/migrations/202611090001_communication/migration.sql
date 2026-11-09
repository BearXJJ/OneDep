CREATE TABLE "DepositionMessage" (
 "id" SERIAL PRIMARY KEY, "depositionId" INTEGER NOT NULL, "authorId" INTEGER NOT NULL,
 "subject" TEXT NOT NULL, "body" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "DepositionMessage_depositionId_fkey" FOREIGN KEY ("depositionId") REFERENCES "Deposition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "DepositionMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "DepositionMessage_depositionId_createdAt_idx" ON "DepositionMessage"("depositionId", "createdAt");
