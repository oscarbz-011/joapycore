-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterTable
ALTER TABLE "file_records" ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "visibility" "FileVisibility" NOT NULL DEFAULT 'PRIVATE';
