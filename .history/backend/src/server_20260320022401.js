app.post('/api/ia/proactive', async (req, res) => {
  const { userId, userRole, pageKey } = req.body;
  try {
    if (!userId || userRole === 'BLOQUEADO' || !process.env.GEMINI_API_KEY) return res.json({ insight: null });
    const uid = parseInt(userId); let contextLines = [];
    
    if (pageKey === 'divergencias' || pageKey === 'dashboard') {
      const divs = await prisma.divergencia.findMany({ where: { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } }, orderBy: { createdAt: 'desc' }, take: 10 });
      if (divs.length > 0) {
        contextLines.push(`Problemas Críticos: ${divs.length} divergências.`);
        divs.forEach(d => contextLines.push(`- Anúncio ${d.mlItemId}: ${d.motivo} (Status atual: ${d.status})`));
      } else {
        contextLines.push('Logística operando com 100% de eficiência. Sem divergências.');
      }
    }
    
    if (contextLines.length === 0) return res.json({ insight: null });
    const context = contextLines.join('\n');
    
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({ 
      model: 'gemini-2.5-flash', 
      config: { temperature: 0.3, maxOutputTokens: 300 }, 
      contents: [{ 
        role: 'user', 
        parts: [{ text: `Você é o Analista Logístico Sênior do sistema.
DADOS REAIS DA OPERAÇÃO AGORA:
${context}

SUA TAREFA:
Gere UM único parágrafo muito curto (máximo de 20 palavras) alertando o dono do e-commerce sobre o que exige mais atenção imediata nos dados acima.
Foque na ação e no risco financeiro (cobranças do ML). Seja altamente profissional e direto.

REGRAS ABSOLUTAS:
1. NUNCA use "Olá", "Temos" ou saudações genéricas. Vá direto ao ponto.
2. Não divida em tópicos nem use quebras de linha.
3. Comece a frase com UM único emoji que represente o status (ex: ⚠️, 🚨, ✅, 📉).
4. Exemplo correto: "⚠️ 3 anúncios estão com divergência de peso; corrija imediatamente para evitar cobranças indevidas de frete do Mercado Livre."` 
        }] 
      }] 
    });
    
    // Remove as tags de negrito e qualquer "Olá" que a IA insistir em colocar
    let insight = response.text?.trim().replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    
    res.json({ insight });
  } catch (error) { 
    console.error('ERRO IA proativa:', error.message); 
    res.json({ insight: null }); 
  }
});