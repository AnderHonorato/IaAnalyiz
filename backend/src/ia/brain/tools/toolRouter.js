// backend/src/ia/tools/toolRouter.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function executarFerramenta(nomeFuncao, argumentos, userId) {
  if (nomeFuncao === 'buscarDadosDoSistema') {
    const { modulo, termoBusca } = argumentos;

    try {
      switch (modulo) {
        case 'historico_pesquisas':
          // Exemplo real usando o schema que você já tem
          const hist = await prisma.pesquisaHistorico.findMany({
            where: { usuarioId: parseInt(userId), excluido: false },
            take: termoBusca ? 50 : 10,
            orderBy: { updatedAt: 'desc' }
          });
          return { status: "sucesso", dados: hist };

        case 'produtos':
          // Exemplo hipotético de tabela de produtos
          // const produtos = await prisma.produto.findMany({ where: { usuarioId: parseInt(userId) }});
          return { status: "sucesso", dados: "Lista de produtos retornada (implementar Prisma)" };

        case 'fornecedores':
          // Exemplo hipotético
          return { status: "sucesso", dados: "Lista de fornecedores retornada (implementar Prisma)" };

        default:
          return { status: "erro", mensagem: `Módulo '${modulo}' desconhecido.` };
      }
    } catch (erro) {
      return { status: "erro", mensagem: erro.message };
    }
  }
  
  return { status: "erro", mensagem: "Função não encontrada." };
}