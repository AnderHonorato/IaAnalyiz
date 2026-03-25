-- CreateTable
CREATE TABLE "IaConhecimento" (
    "id" SERIAL NOT NULL,
    "categoria" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "confianca" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "fonte" TEXT NOT NULL DEFAULT 'sistema',
    "usos" INTEGER NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IaConhecimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IaAprendizado" (
    "id" SERIAL NOT NULL,
    "pergunta" TEXT NOT NULL,
    "respostaTentativa" TEXT NOT NULL,
    "respostaFinal" TEXT NOT NULL,
    "aprovada" BOOLEAN NOT NULL,
    "confianca" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "motivo" TEXT,
    "usuarioId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IaAprendizado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IaEstudoTerminal" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "resumo" TEXT NOT NULL,
    "detalhes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IaEstudoTerminal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IaConhecimento_categoria_idx" ON "IaConhecimento"("categoria");

-- CreateIndex
CREATE INDEX "IaConhecimento_confianca_idx" ON "IaConhecimento"("confianca");

-- CreateIndex
CREATE UNIQUE INDEX "IaConhecimento_categoria_chave_key" ON "IaConhecimento"("categoria", "chave");

-- CreateIndex
CREATE INDEX "IaAprendizado_aprovada_idx" ON "IaAprendizado"("aprovada");

-- CreateIndex
CREATE INDEX "IaAprendizado_usuarioId_idx" ON "IaAprendizado"("usuarioId");

-- CreateIndex
CREATE INDEX "IaAprendizado_createdAt_idx" ON "IaAprendizado"("createdAt");

-- CreateIndex
CREATE INDEX "IaEstudoTerminal_tipo_idx" ON "IaEstudoTerminal"("tipo");

-- CreateIndex
CREATE INDEX "IaEstudoTerminal_createdAt_idx" ON "IaEstudoTerminal"("createdAt");
