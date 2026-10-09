-- Remove the retired message demonstration and its data.
DROP TABLE "Message";

CREATE TYPE "Role" AS ENUM ('SUBMITTER', 'REVIEWER', 'ADMIN');

-- Existing users predate authentication. An empty hash leaves them unable to sign in.
ALTER TABLE "User"
  ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "role" "Role" NOT NULL DEFAULT 'SUBMITTER';

ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP DEFAULT;
