-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "geminiAtivo" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ChatDocument" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "language" TEXT,
    "content" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatDocument_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ChatDocument" ADD CONSTRAINT "ChatDocument_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
