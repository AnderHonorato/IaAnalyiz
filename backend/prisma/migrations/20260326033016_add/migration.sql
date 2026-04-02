-- CreateTable
CREATE TABLE "FeedbackIA" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "isPositive" BOOLEAN NOT NULL,
    "comentario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackIA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedbackIA_usuarioId_idx" ON "FeedbackIA"("usuarioId");

-- AddForeignKey
ALTER TABLE "FeedbackIA" ADD CONSTRAINT "FeedbackIA_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
