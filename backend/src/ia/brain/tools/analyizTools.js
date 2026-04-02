// backend/src/ia/tools/analyizTools.js
export const analyizTools = [{
  functionDeclarations: [
    {
      name: "buscarDadosDoSistema",
      description: "Busca informações atualizadas do banco de dados do usuário. Use esta função SEMPRE que o usuário fizer perguntas sobre seus próprios produtos, fornecedores, histórico de pesquisas, dashboard ou métricas.",
      parameters: {
        type: "OBJECT",
        properties: {
          modulo: {
            type: "STRING",
            description: "O módulo do sistema que deve ser consultado. Valores permitidos: 'produtos', 'fornecedores', 'dashboard', 'historico_pesquisas', 'taxas'."
          },
          termoBusca: {
            type: "STRING",
            description: "Um termo de busca opcional caso o usuário queira algo específico (ex: 'celular', 'fornecedor X'). Deixe vazio para trazer tudo."
          }
        },
        required: ["modulo"]
      }
    }
  ]
}];