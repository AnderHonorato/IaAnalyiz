-- AlterTable
ALTER TABLE "IaAprendizado" ADD COLUMN     "embedding" DOUBLE PRECISION[];

-- AlterTable
ALTER TABLE "IaConhecimento" ADD COLUMN     "embedding" DOUBLE PRECISION[];

-- CreateTable
CREATE TABLE "PesquisaHistorico" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "mlbId" TEXT NOT NULL,
    "urlOriginal" TEXT NOT NULL,
    "titulo" TEXT,
    "thumbnail" TEXT,
    "preco" DOUBLE PRECISION,
    "dadosJson" TEXT,
    "erro" TEXT,
    "status" TEXT NOT NULL DEFAULT 'concluido',
    "arquivado" BOOLEAN NOT NULL DEFAULT false,
    "excluido" BOOLEAN NOT NULL DEFAULT false,
    "excluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesquisaHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PesquisaHistorico_usuarioId_idx" ON "PesquisaHistorico"("usuarioId");

-- CreateIndex
CREATE INDEX "PesquisaHistorico_arquivado_idx" ON "PesquisaHistorico"("arquivado");

-- CreateIndex
CREATE INDEX "PesquisaHistorico_excluido_idx" ON "PesquisaHistorico"("excluido");

-- CreateIndex
CREATE UNIQUE INDEX "PesquisaHistorico_usuarioId_mlbId_key" ON "PesquisaHistorico"("usuarioId", "mlbId");

-- AddForeignKey
ALTER TABLE "PesquisaHistorico" ADD CONSTRAINT "PesquisaHistorico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
