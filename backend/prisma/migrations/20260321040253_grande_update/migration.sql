-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "avatar" TEXT,
    "verificado" BOOLEAN NOT NULL DEFAULT false,
    "codigoVerificacao" TEXT,
    "codigoRecuperacao" TEXT,
    "role" TEXT NOT NULL DEFAULT 'BLOQUEADO',
    "solicitouDesbloqueio" BOOLEAN NOT NULL DEFAULT false,
    "tema" TEXT NOT NULL DEFAULT 'dark',
    "exclusaoPendente" BOOLEAN NOT NULL DEFAULT false,
    "exclusaoCodigoHash" TEXT,
    "exclusaoSolicitadaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL DEFAULT 'Nova conversa',
    "usuarioId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageBase64" TEXT,
    "imageDesc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "preco" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pesoGramas" INTEGER NOT NULL DEFAULT 0,
    "alturaCm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "larguraCm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "comprimentoCm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "eKit" BOOLEAN NOT NULL DEFAULT false,
    "mlItemId" TEXT,
    "categoria" TEXT,
    "plataforma" TEXT NOT NULL DEFAULT 'Mercado Livre',
    "status" TEXT NOT NULL DEFAULT 'active',
    "thumbnail" TEXT,
    "ean" TEXT,
    "marca" TEXT,
    "modelo" TEXT,
    "condicao" TEXT DEFAULT 'Novo',

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitItem" (
    "id" SERIAL NOT NULL,
    "kitId" INTEGER NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL,

    CONSTRAINT "KitItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Divergencia" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "mlItemId" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "pesoMl" INTEGER NOT NULL DEFAULT 0,
    "pesoLocal" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "resolvido" BOOLEAN NOT NULL DEFAULT false,
    "corrigidoViaApi" BOOLEAN NOT NULL DEFAULT false,
    "corrigidoManual" BOOLEAN NOT NULL DEFAULT false,
    "plataforma" TEXT NOT NULL DEFAULT 'Mercado Livre',
    "titulo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Divergencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DivergenciaHistorico" (
    "id" SERIAL NOT NULL,
    "divergenciaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "acao" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "detalhes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DivergenciaHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvisoML" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "mlItemId" TEXT NOT NULL,
    "titulo" TEXT,
    "thumbnail" TEXT,
    "tipoAviso" TEXT NOT NULL DEFAULT 'DIMENSOES_INCORRETAS',
    "mensagem" TEXT NOT NULL,
    "severidade" TEXT NOT NULL DEFAULT 'ALTO',
    "resolvido" BOOLEAN NOT NULL DEFAULT false,
    "resolvidoEm" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvisoML_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MlToken" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "mlUserId" TEXT NOT NULL DEFAULT '',
    "nickname" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MlToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendadorConfig" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "intervalo" INTEGER NOT NULL DEFAULT 360,
    "ultimaExecucao" TIMESTAMP(3),
    "proximaExecucao" TIMESTAMP(3),

    CONSTRAINT "AgendadorConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumoIA" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "conteudo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumoIA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecificacaoHistorico" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "mlItemId" TEXT NOT NULL,
    "preco" DOUBLE PRECISION NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "titulo" TEXT NOT NULL DEFAULT '',
    "categoriaId" TEXT NOT NULL DEFAULT '',
    "atualizadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecificacaoHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MlCategoria" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "MlCategoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Produto_usuarioId_sku_key" ON "Produto"("usuarioId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "AvisoML_usuarioId_mlItemId_tipoAviso_key" ON "AvisoML"("usuarioId", "mlItemId", "tipoAviso");

-- CreateIndex
CREATE UNIQUE INDEX "MlToken_usuarioId_key" ON "MlToken"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "AgendadorConfig_usuarioId_key" ON "AgendadorConfig"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "MlCategoria_usuarioId_categoriaId_key" ON "MlCategoria"("usuarioId", "categoriaId");

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitItem" ADD CONSTRAINT "KitItem_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitItem" ADD CONSTRAINT "KitItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Divergencia" ADD CONSTRAINT "Divergencia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DivergenciaHistorico" ADD CONSTRAINT "DivergenciaHistorico_divergenciaId_fkey" FOREIGN KEY ("divergenciaId") REFERENCES "Divergencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DivergenciaHistorico" ADD CONSTRAINT "DivergenciaHistorico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvisoML" ADD CONSTRAINT "AvisoML_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MlToken" ADD CONSTRAINT "MlToken_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendadorConfig" ADD CONSTRAINT "AgendadorConfig_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumoIA" ADD CONSTRAINT "ResumoIA_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecificacaoHistorico" ADD CONSTRAINT "PrecificacaoHistorico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MlCategoria" ADD CONSTRAINT "MlCategoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
