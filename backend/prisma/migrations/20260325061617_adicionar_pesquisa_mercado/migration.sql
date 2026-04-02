-- CreateTable
CREATE TABLE "PesquisaMercadoIA" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "mlbIds" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudoHtml" TEXT NOT NULL,
    "precoMedio" DOUBLE PRECISION,
    "melhorPreco" DOUBLE PRECISION,
    "oportunidade" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PesquisaMercadoIA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PesquisaMercadoIA_usuarioId_idx" ON "PesquisaMercadoIA"("usuarioId");

-- AddForeignKey
ALTER TABLE "PesquisaMercadoIA" ADD CONSTRAINT "PesquisaMercadoIA_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
