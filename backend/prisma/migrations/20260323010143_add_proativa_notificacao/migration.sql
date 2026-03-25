-- CreateTable
CREATE TABLE "ProativaNotificacao" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "resumoBotao" TEXT NOT NULL,
    "fullInsight" TEXT NOT NULL,
    "contextoHash" TEXT NOT NULL,
    "exibidaBotao" BOOLEAN NOT NULL DEFAULT false,
    "vistaNoChat" BOOLEAN NOT NULL DEFAULT false,
    "vistaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProativaNotificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProativaNotificacao_usuarioId_vistaNoChat_idx" ON "ProativaNotificacao"("usuarioId", "vistaNoChat");

-- CreateIndex
CREATE INDEX "ProativaNotificacao_usuarioId_createdAt_idx" ON "ProativaNotificacao"("usuarioId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProativaNotificacao" ADD CONSTRAINT "ProativaNotificacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
