// backend/src/routes/iaRoutes.js — v5: pageBaseUrl, todos os tipos de arquivo

import express from 'express';
import { prisma } from '../prisma.js';
import { buildAnswer, buildAnswerStream, analyzeImage, buildResumoPrompt } from '../iaService.js';
import {
  processarMensagemComAprendizado, analisarSistemaAutonomamente, buscarEstudosRecentes,
  getEstatisticasAprendizado, buscarConhecimento, buscarTodoConhecimento, salvarConhecimento,
  registrarEstudo, validarRespostaComGemini,
} from '../ia/brain/iaBrain.js';

const router = express.Router();

// ─── Catálogo de tabelas ───────────────────────────────────────────────────────
const DATA_CATALOG = {
  produtos:               { label:'Catálogo de Produtos',        desc:'Produtos com SKU, nome, peso, preço, kit, ID ML.' },
  divergencias:           { label:'Divergências de Peso/Frete',  desc:'Anúncios ML com peso divergente.' },
  divergencias_stats:     { label:'Estatísticas de Divergências',desc:'Totais agrupados por status.' },
  usuarios:               { label:'Usuários do Sistema',         desc:'Usuários com nome, email, cargo.', privileged:true },
  precificacao_historico: { label:'Histórico de Preços',         desc:'Alterações de preço em anúncios ML.' },
  agendador:              { label:'Agendador de Varredura',      desc:'Config da varredura automática.' },
  ml_token:               { label:'Status da Conexão ML',        desc:'Status OAuth: nickname, validade.' },
  sessao_stats:           { label:'Sessões de Usuários',         desc:'Usuários online e total.' },
  ia_brain:               { label:'Conhecimento da IA',          desc:'Fatos aprendidos pela IA.' },
};

function keywordRoute(msg) {
  const t=[];
  if(/divergen|peso|frete|anuncio|auditoria|reincidente|pendente|corrigido/i.test(msg))t.push('divergencias','divergencias_stats');
  if(/produto|sku|catálogo|kit/i.test(msg))t.push('produtos');
  if(/usuário|usuario|acesso|bloqueio|role/i.test(msg))t.push('usuarios');
  if(/preço|preco|precific/i.test(msg))t.push('precificacao_historico');
  if(/agendador|varredura|automático/i.test(msg))t.push('agendador');
  if(/conectado|conexão|token.*ml|conta.*ml/i.test(msg))t.push('ml_token');
  if(/online|ativo|sessão|quantos/i.test(msg))t.push('sessao_stats');
  if(/aprend|conhec|memória/i.test(msg))t.push('ia_brain');
  return { relevante:t.length>0, tabelas:[...new Set(t)].slice(0,5), raciocinio:'keyword_fallback' };
}

async function geminiRouter(catalogoStr, userMessage) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey:process.env.GEMINI_API_KEY });
  const sys = 'Você é um classificador de intenção. Responda EXCLUSIVAMENTE com JSON puro. Formato: {"relevante":true,"tabelas":["nome"],"raciocinio":"frase"}';
  const prompt = `TABELAS:\n${catalogoStr}\n\nMENSAGEM: ${userMessage}\n\nJSON:`;
  try {
    const r = await ai.models.generateContent({ model:'gemini-2.5-flash-lite-preview-06-17', config:{temperature:0,maxOutputTokens:200,thinkingConfig:{thinkingBudget:0},systemInstruction:sys}, contents:[{role:'user',parts:[{text:prompt}]}] });
    return (r.text||'').trim();
  } catch {
    const r = await ai.models.generateContent({ model:'gemini-2.5-flash', config:{temperature:0,maxOutputTokens:200,systemInstruction:sys}, contents:[{role:'user',parts:[{text:prompt}]}] });
    return (r.text||'').trim();
  }
}

function parseRouterJson(raw) {
  if(!raw)throw new Error('vazio');
  const s=raw.indexOf('{'),e=raw.lastIndexOf('}');
  if(s===-1||e===-1)throw new Error('sem {}');
  const p=JSON.parse(raw.slice(s,e+1).replace(/,\s*([\}\]])/g,'$1').replace(/(['"])?([a-zA-Z_][a-zA-Z0-9_]*)(['"])?:/g,'"$2":').replace(/:\s*'([^']*)'/g,':"$1"'));
  return{relevante:Boolean(p.relevante),tabelas:Array.isArray(p.tabelas)?p.tabelas.slice(0,5):[],raciocinio:String(p.raciocinio||'')};
}

async function routeDataNeeded(userMessage, userRole) {
  const isPriv = userRole==='OWNER'||userRole==='ADMIN';
  const cat = Object.entries(DATA_CATALOG).filter(([,v])=>!v.privileged||isPriv).map(([k,v])=>`- ${k}: ${v.label}. ${v.desc}`).join('\n');
  try { const raw=await geminiRouter(cat,userMessage); return parseRouterJson(raw); }
  catch { return keywordRoute(userMessage); }
}

async function fetchSelectedData(tabelas, userId, userRole) {
  const uid=parseInt(userId), data={};
  await Promise.all(tabelas.map(async t => {
    try {
      switch(t) {
        case 'produtos': data.produtos=await prisma.produto.findMany({where:{usuarioId:uid},orderBy:{id:'desc'}}); break;
        case 'divergencias': data.divergencias=await prisma.divergencia.findMany({where:{usuarioId:uid},orderBy:{createdAt:'desc'}}); break;
        case 'divergencias_stats': {
          const [p,r,c,i,pe]=await Promise.all([
            prisma.divergencia.count({where:{usuarioId:uid,status:'PENDENTE'}}),
            prisma.divergencia.count({where:{usuarioId:uid,status:'REINCIDENTE'}}),
            prisma.divergencia.count({where:{usuarioId:uid,status:'CORRIGIDO'}}),
            prisma.divergencia.count({where:{usuarioId:uid,status:'IGNORADO'}}),
            prisma.divergencia.count({where:{usuarioId:uid,status:'PENDENTE_ENVIO'}}),
          ]);
          data.divergencias_stats={pendente:p,reincidente:r,corrigido:c,ignorado:i,pendenteEnvio:pe,total:p+r+c+i+pe};
          break;
        }
        case 'usuarios':
          if(userRole==='OWNER'||userRole==='ADMIN') data.usuarios=await prisma.usuario.findMany({orderBy:{createdAt:'desc'},select:{id:true,nome:true,email:true,role:true,solicitouDesbloqueio:true,verificado:true,createdAt:true}});
          break;
        case 'precificacao_historico': data.precificacao_historico=await prisma.precificacaoHistorico.findMany({where:{usuarioId:uid},orderBy:{criadoEm:'desc'},take:50}).catch(()=>[]); break;
        case 'agendador': data.agendador=await prisma.agendadorConfig.findUnique({where:{usuarioId:uid}}); break;
        case 'ml_token': data.ml_token=await prisma.mlToken.findUnique({where:{usuarioId:uid},select:{nickname:true,expiresAt:true,mlUserId:true}}); break;
        case 'sessao_stats': {
          const t30=new Date(Date.now()-30*60*1000);
          const [a,tot,u]=await Promise.all([
            prisma.sessaoUsuario.count({where:{ativo:true,entradaEm:{gte:t30}}}).catch(()=>0),
            prisma.sessaoUsuario.count().catch(()=>0),
            prisma.sessaoUsuario.groupBy({by:['usuarioId'],_count:true}).catch(()=>[]),
          ]);
          data.sessao_stats={ativos:a,totalSessoes:tot,totalUsuariosUnicos:u.length};
          break;
        }
        case 'ia_brain': data.ia_brain=await buscarTodoConhecimento(25); break;
      }
    } catch(e) { console.warn(`[Fetch] "${t}":`, e.message); }
  }));
  return data;
}

function formatDataBlock(data) {
  if(!data||!Object.keys(data).length)return null;
  const lines=['=== DADOS DO BANCO ===',''];
  for(const[key,value]of Object.entries(data)){
    lines.push(`--- ${DATA_CATALOG[key]?.label||key} ---`);
    if(Array.isArray(value)){lines.push(`(${value.length} registros)`);value.forEach((row,i)=>lines.push(`[${i+1}] ${JSON.stringify(row)}`));}
    else if(value&&typeof value==='object') lines.push(JSON.stringify(value,null,2));
    else lines.push(String(value??'sem dados'));
    lines.push('');
  }
  lines.push('=== FIM ===');
  return lines.join('\n');
}

async function buildBaseContext(userId, userRole, dataBlock, pageBaseUrl) {
  const uid=parseInt(userId);
  let totalProdutos=0,totalDivergencias=0,usuarioAtual=null,pendentes=[];
  try {
    [totalProdutos,totalDivergencias,usuarioAtual,pendentes]=await Promise.all([
      prisma.produto.count({where:{usuarioId:uid}}),
      prisma.divergencia.count({where:{usuarioId:uid,status:{in:['PENDENTE','REINCIDENTE']}}}),
      prisma.usuario.findUnique({where:{id:uid},select:{id:true,nome:true,role:true}}).catch(()=>null),
      (userRole==='OWNER'||userRole==='ADMIN')
        ?prisma.usuario.findMany({where:{solicitouDesbloqueio:true,role:'BLOQUEADO'},select:{id:true,nome:true,email:true}})
        :Promise.resolve([]),
    ]);
  } catch {}
  return { totalProdutos, totalDivergencias, userRole, usuarioAtual, pendentes, dataBlock, pageBaseUrl };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSÕES
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/api/chat/sessions/:userId', async(req,res)=>{
  try{res.json(await prisma.chatSession.findMany({where:{usuarioId:parseInt(req.params.userId)},orderBy:{updatedAt:'desc'},select:{id:true,titulo:true,createdAt:true,updatedAt:true}}));}
  catch{res.status(500).json({error:'Erro ao listar sessões.'});}
});

router.post('/api/chat/sessions', async(req,res)=>{
  try{res.status(201).json(await prisma.chatSession.create({data:{usuarioId:parseInt(req.body.userId),titulo:req.body.titulo||'Nova conversa'}}));}
  catch{res.status(500).json({error:'Erro ao criar sessão.'});}
});

router.delete('/api/chat/sessions/:id', async(req,res)=>{
  try{await prisma.chatSession.delete({where:{id:parseInt(req.params.id)}});res.json({ok:true});}
  catch{res.status(500).json({error:'Erro ao excluir sessão.'});}
});

router.get('/api/chat/sessions/:id/messages', async(req,res)=>{
  try{
    res.json(await prisma.chatMessage.findMany({
      where:{sessionId:parseInt(req.params.id)},orderBy:{createdAt:'asc'},
      select:{id:true,role:true,content:true,imageBase64:true,imageDesc:true,createdAt:true},
    }));
  } catch{res.status(500).json({error:'Erro ao buscar mensagens.'});}
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT SSE — /api/ia/chat/stream
// ─────────────────────────────────────────────────────────────────────────────
// SSE events: reasoning_start | reasoning_chunk | reasoning_end | step | step_done | tool_result | done | error
// Novo campo: pageBaseUrl — URL base do frontend para lerPagina()
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/api/ia/chat/stream', async(req,res)=>{
  const {
    message, sessionId, userRole, userId,
    imageBase64, imageMimeType, imageName, imageOnly,
    extraImages=[], files=[], attachmentMeta=[],
    pageUrl, pageBaseUrl,
  } = req.body;

  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache');
  res.setHeader('Connection','keep-alive');
  res.setHeader('X-Accel-Buffering','no');
  res.flushHeaders();

  const send=(event,data)=>{try{res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);}catch{}};

  try {
    if(userRole==='BLOQUEADO'){send('done',{reply:'🔒 Seu perfil está bloqueado.',sources:[]});return res.end();}
    if(!process.env.GEMINI_API_KEY){send('error',{message:'Chave de API ausente.'});return res.end();}

    // ── Sessão ────────────────────────────────────────────────────────────────
    let session=sessionId?await prisma.chatSession.findUnique({where:{id:parseInt(sessionId)}}):null;
    if(!session)session=await prisma.chatSession.create({data:{usuarioId:parseInt(userId),titulo:'Nova conversa'}});

    // ── Persiste mensagem do usuário ─────────────────────────────────────────
    const MAX_PREVIEW_SIZE=8*1024*1024;
    const attachDescArr = attachmentMeta.length>0
      ? attachmentMeta.map(a=>{
          const isMainImg=a.group==='image'&&imageName&&a.name===imageName;
          const needsPreview=(a.group==='audio'||(a.group==='image'&&!isMainImg));
          return{mimeType:a.mimeType,name:a.name,group:a.group,sizeBytes:a.sizeBytes,...(needsPreview&&a.preview&&a.preview.length<MAX_PREVIEW_SIZE?{preview:a.preview}:{})};
        })
      : null;

    await prisma.chatMessage.create({
      data:{
        sessionId:session.id, role:'user', content:message||'',
        imageBase64:imageBase64||null,
        imageDesc:attachDescArr?JSON.stringify(attachDescArr):null,
      },
    });

    // ── Título ────────────────────────────────────────────────────────────────
    if(message&&message.length>3){
      const count=await prisma.chatMessage.count({where:{sessionId:session.id}});
      if(count<=2)await prisma.chatSession.update({where:{id:session.id},data:{titulo:message.substring(0,50)+(message.length>50?'...:':'')}});
    }

    // ── Histórico ─────────────────────────────────────────────────────────────
    const dbMsgs=await prisma.chatMessage.findMany({where:{sessionId:session.id},orderBy:{createdAt:'asc'},take:40,select:{role:true,content:true,imageDesc:true}});
    const historyRaw=dbMsgs.map(m=>({role:m.role,content:m.content||(m.imageDesc?'[arquivo]':'')}));

    // ── Dados do banco ────────────────────────────────────────────────────────
    let dataBlock=null;
    if(!imageOnly&&message?.trim().length>2){
      const route=await routeDataNeeded(message,userRole);
      if(route.relevante&&route.tabelas.length>0){
        const dados=await fetchSelectedData(route.tabelas,userId,userRole);
        dataBlock=formatDataBlock(dados);
      }
    }

    // ── Contexto base — inclui pageBaseUrl para lerPagina ─────────────────────
    const actualPageBaseUrl = pageBaseUrl || 'http://localhost:5173';
    const context=await buildBaseContext(userId,userRole,dataBlock,actualPageBaseUrl);
    const startTime=Date.now();

    // ── Imagem principal ──────────────────────────────────────────────────────
    if(imageBase64){
      context.imageBase64=imageBase64;context.imageMimeType=imageMimeType||'image/jpeg';
      const desc=await analyzeImage(imageBase64,imageMimeType||'image/jpeg',message||'');
      if(desc)context.imageContext=desc;
    }

    // ── Arquivos extras (todos os tipos) ──────────────────────────────────────
    // CORREÇÃO: inclui TODOS os tipos, não só imagens
    const allFiles=[
      ...extraImages.map(f=>({...f,group:'image'})),
      ...files,  // PDF, Excel, TXT, áudio, imagens extras
    ];
    context.files=allFiles;

    const msgEfetiva=imageOnly
      ?(context.imageContext?`Usuário enviou imagem. Conteúdo: ${context.imageContext}`:'Usuário enviou imagem')
      :(message||'[arquivo enviado]');

    // ── buildAnswerStream ─────────────────────────────────────────────────────
    const{reply,sources,reasoning,toolsExecutadas}=await buildAnswerStream(
      msgEfetiva, historyRaw, context,
      (stepEvent)=>{
        switch(stepEvent.type){
          case 'reasoning_start':  send('reasoning_start',{}); break;
          case 'reasoning_chunk':  send('reasoning_chunk',{text:stepEvent.text}); break;
          case 'reasoning_end':    send('reasoning_end',  {fullText:stepEvent.fullText}); break;
          case 'step':             send('step',           {msg:stepEvent.msg,tool:stepEvent.tool,isHeader:stepEvent.isHeader||false}); break;
          case 'step_done':        send('step_done',      {stepIndex:stepEvent.stepIndex}); break;
          case 'tool_result':      send('tool_result',    {tool:stepEvent.tool,ok:stepEvent.ok,msg:stepEvent.msg}); break;
          default: break;
        }
      }
    );

    const durationMs=Date.now()-startTime;

    // ── Salva resposta ────────────────────────────────────────────────────────
    await prisma.chatMessage.create({data:{sessionId:session.id,role:'ia',content:reply}});

    // Aprendizado em background
    processarMensagemComAprendizado({
      mensagem:message,userRole,userId,imageBase64,imageMimeType,
      imageOnly:!!imageOnly,historyRaw,dataBlock,
    }).catch(()=>{});

    send('done',{reply,sources,sessionId:session.id,reasoning,toolsExecutadas,durationMs});
    res.end();

  } catch(error){
    console.error('[IA Chat Stream]',error);
    send('error',{message:'Erro interno. Tente novamente.'});
    res.end();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT JSON (fallback)
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/api/ia/chat', async(req,res)=>{
  const{message,sessionId,userRole,userId,imageBase64,imageMimeType,imageOnly}=req.body;
  try{
    if(userRole==='BLOQUEADO')return res.json({reply:'🔒 Seu perfil está bloqueado.',sources:[]});
    if(!process.env.GEMINI_API_KEY)return res.status(500).json({reply:'⚠️ Chave de API ausente.',sources:[]});
    let session=sessionId?await prisma.chatSession.findUnique({where:{id:parseInt(sessionId)}}):null;
    if(!session)session=await prisma.chatSession.create({data:{usuarioId:parseInt(userId),titulo:'Nova conversa'}});
    await prisma.chatMessage.create({data:{sessionId:session.id,role:'user',content:message||'',imageBase64:imageBase64||null}});
    if(message&&message.length>3){const c=await prisma.chatMessage.count({where:{sessionId:session.id}});if(c<=2)await prisma.chatSession.update({where:{id:session.id},data:{titulo:message.substring(0,50)+(message.length>50?'...':'')}});}
    const dbMsgs=await prisma.chatMessage.findMany({where:{sessionId:session.id},orderBy:{createdAt:'asc'},take:40,select:{role:true,content:true,imageDesc:true}});
    const historyRaw=dbMsgs.map(m=>({role:m.role,content:m.content||(m.imageDesc?'[arquivo]':'')}));
    let dataBlock=null;
    if(!imageOnly&&message?.trim().length>2){const r=await routeDataNeeded(message,userRole);if(r.relevante&&r.tabelas.length>0){const d=await fetchSelectedData(r.tabelas,userId,userRole);dataBlock=formatDataBlock(d);}}
    const{reply,sources}=await processarMensagemComAprendizado({mensagem:message,userRole,userId,imageBase64,imageMimeType,imageOnly:!!imageOnly,historyRaw,dataBlock});
    await prisma.chatMessage.create({data:{sessionId:session.id,role:'ia',content:reply}});
    res.json({reply,sessionId:session.id,sources});
  }catch(error){console.error('[IA Chat]',error);res.status(500).json({reply:'⚠️ Erro interno.',sources:[]});}
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESUMO
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/api/ia/summary', async(req,res)=>{
  const{userId,dados}=req.body;
  try{
    const{GoogleGenAI}=await import('@google/genai');
    const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});const uid=parseInt(userId);
    const[sDiv,totalProd,totalAvisos,ag]=await Promise.all([
      prisma.divergencia.groupBy({by:['status'],where:{usuarioId:uid},_count:true}),
      prisma.produto.count({where:{usuarioId:uid}}),
      prisma.avisoML.count({where:{usuarioId:uid,resolvido:false}}).catch(()=>0),
      prisma.agendadorConfig.findUnique({where:{usuarioId:uid}}).catch(()=>null),
    ]);
    const sMap=Object.fromEntries(sDiv.map(s=>[s.status,s._count]));
    const conhec=await buscarConhecimento('metricas_divergencias',5);
    const brain=conhec.map(k=>k.valor).join('\n');
    const dadosStr=`${typeof dados==='string'?dados:JSON.stringify(dados)}\n\nDADOS:\n- Produtos: ${totalProd}\n- PENDENTE: ${sMap.PENDENTE||0}\n- REINCIDENTE: ${sMap.REINCIDENTE||0}\n- CORRIGIDO: ${sMap.CORRIGIDO||0}\n- Avisos ML: ${totalAvisos}\n- Agendador: ${ag?.ativo?`ATIVO (${ag.intervalo}min)`:'INATIVO'}\n\nIA:\n${brain||'(analisando...)'}`;
    const response=await ai.models.generateContent({model:'gemini-2.5-flash',config:{temperature:0.4,maxOutputTokens:2500},contents:[{role:'user',parts:[{text:buildResumoPrompt(dadosStr)}]}]});
    const conteudo=(response.text||'').trim().replace(/^(conforme solicitado|aqui está|claro[,!]|segue)[^\n<]*[\n<]/im,'').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\*([^*\n<]+)\*/g,'<b>$1</b>').replace(/^#{1,6}\s+/gm,'').replace(/^-\s+/gm,'• ').trim();
    await prisma.resumoIA.create({data:{usuarioId:uid,conteudo}});
    await salvarConhecimento({categoria:'resumo_executivo',chave:`resumo_${new Date().toISOString().slice(0,10)}`,valor:conteudo.replace(/<[^>]+>/g,'').substring(0,600),confianca:0.88,fonte:'resumo_gerado'});
    res.json({conteudo});
  }catch(e){console.error('[Summary]',e);res.status(500).json({error:'Erro ao gerar resumo.'});}
});

router.get('/api/ia/summary/history', async(req,res)=>{
  try{res.json(await prisma.resumoIA.findMany({where:{usuarioId:parseInt(req.query.userId)},orderBy:{createdAt:'desc'},take:10}));}
  catch{res.status(500).json({error:'Erro.'});}
});

// ═══════════════════════════════════════════════════════════════════════════════
// BRAIN API
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/api/ia/brain/stats',         async(req,res)=>{try{res.json(await getEstatisticasAprendizado());}catch{res.status(500).json({error:'Erro.'});}});
router.get('/api/ia/brain/estudos',       async(req,res)=>{try{const l=Math.min(parseInt(req.query.limite||'50'),100);res.json(await buscarEstudosRecentes(l));}catch{res.status(500).json({error:'Erro.'});}});
router.get('/api/ia/brain/conhecimentos', async(req,res)=>{try{res.json(await prisma.iaConhecimento.findMany({where:{confianca:{gte:0.4}},orderBy:[{confianca:'desc'},{usos:'desc'}],take:80}));}catch{res.status(500).json({error:'Erro.'});}});
router.get('/api/ia/brain/aprendizados',  async(req,res)=>{try{res.json(await prisma.iaAprendizado.findMany({orderBy:{createdAt:'desc'},take:50,select:{id:true,pergunta:true,aprovada:true,confianca:true,motivo:true,createdAt:true}}));}catch{res.status(500).json({error:'Erro.'});}});
router.post('/api/ia/brain/analisar',     async(req,res)=>{try{res.json(await analisarSistemaAutonomamente(req.body.userId||null));}catch{res.status(500).json({error:'Erro.'});}});

router.post('/api/ia/brain/conhecimento', async(req,res)=>{
  try{const{categoria,chave,valor,confianca=0.9}=req.body;if(!categoria||!chave||!valor)return res.status(400).json({error:'categoria, chave e valor são obrigatórios'});await salvarConhecimento({categoria,chave,valor,confianca,fonte:'manual_admin'});res.json({ok:true});}
  catch{res.status(500).json({error:'Erro.'});}
});

router.delete('/api/ia/brain/conhecimento/:id', async(req,res)=>{
  try{await prisma.iaConhecimento.delete({where:{id:parseInt(req.params.id)}});res.json({ok:true});}
  catch{res.status(500).json({error:'Erro.'});}
});

router.post('/api/ia/brain/validar', async(req,res)=>{
  try{const{pergunta,respostaTentativa,contexto,userId}=req.body;res.json(await validarRespostaComGemini({pergunta,respostaTentativa,contexto:contexto||'',userId}));}
  catch{res.status(500).json({error:'Erro.'});}
});

export default router;