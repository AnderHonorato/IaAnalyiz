// Constante para definir a URL da nossa API (Backend)
const API_BASE_URL = 'http://localhost:3000';

// Inicializa os ícones do Lucide
lucide.createIcons();

// Elementos da Interface
const terminal = document.getElementById('terminal');
const progressBar = document.getElementById('progress-bar');
const timeLeftDisplay = document.getElementById('time-left');
const startBtn = document.getElementById('start-bot');
const divTableBody = document.querySelector('#div-table tbody');

// Lógica de Controle de Zoom
let currentZoom = 1.0;
const rootElement = document.getElementById('app-wrapper');
const zoomText = document.getElementById('zoom-level-text');

document.getElementById('btn-zoom-in').addEventListener('click', () => {
  if (currentZoom < 1.5) currentZoom += 0.1;
  updateZoom();
});

document.getElementById('btn-zoom-out').addEventListener('click', () => {
  if (currentZoom > 0.6) currentZoom -= 0.1;
  updateZoom();
});

function updateZoom() {
  // Atualiza a variável CSS que controla a escala geral do layout
  rootElement.style.setProperty('--zoom-level', currentZoom);
  zoomText.textContent = `${Math.round(currentZoom * 100)}%`;
}

// Lógica do Terminal
function logTerminal(message, type) {
  const span = document.createElement('span');
  span.className = `log ${type}`;
  span.textContent = `> ${message}`;
  terminal.appendChild(span);
  terminal.scrollTop = terminal.scrollHeight; // Auto-scroll
}

// Iniciar Bot (SSE)
startBtn.addEventListener('click', () => {
  terminal.innerHTML = ''; 
  progressBar.style.width = '0%';
  timeLeftDisplay.textContent = 'Calculando tempo...';
  
  // Muda botão para estado carregando
  startBtn.disabled = true;
  startBtn.innerHTML = `<i data-lucide="loader-2" class="lucide-spin"></i> Processando...`;
  lucide.createIcons(); // Recarrega o ícone animado

  const eventSource = new EventSource(`${API_BASE_URL}/api/bot/stream`);

  eventSource.onmessage = function(event) {
    const data = JSON.parse(event.data);
    if (data.msg) logTerminal(data.msg, data.type);

    if (data.type === 'progress') {
      progressBar.style.width = `${data.percent}%`;
      timeLeftDisplay.textContent = data.timeLeft;
    }

    if (data.type === 'done') {
      progressBar.style.width = '100%';
      timeLeftDisplay.textContent = 'Finalizado.';
      eventSource.close();
      
      // Restaura botão
      startBtn.disabled = false;
      startBtn.innerHTML = `<i data-lucide="play-circle"></i> Iniciar Varredura em Lote`;
      lucide.createIcons();
      
      loadDivergences();
    }
  };

  eventSource.onerror = function(err) {
    logTerminal('Conexão perdida com o bot API.', 'error');
    eventSource.close();
    startBtn.disabled = false;
    startBtn.innerHTML = `<i data-lucide="play-circle"></i> Tentar Novamente`;
    lucide.createIcons();
  };
});

// Busca Divergências
async function loadDivergences() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/divergencias`);
    const data = await res.json();
    
    divTableBody.innerHTML = '';
    
    if (data.length === 0) {
      divTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: #a7f3d080;">Nenhuma divergência encontrada. Tudo certo!</td></tr>`;
      return;
    }

    data.forEach(div => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: monospace; font-weight: bold;">${div.mlItemId}</td>
        <td>${div.motivo}</td>
        <td>
          <a href="${div.link}" target="_blank" class="link-btn">
             Ver Anúncio <i data-lucide="external-link" style="width: 12px; height: 12px;"></i>
          </a>
        </td>
      `;
      divTableBody.appendChild(tr);
    });
    
    lucide.createIcons(); // Carrega ícones inseridos dinamicamente
  } catch (error) {
    console.error("Erro ao carregar divergências:", error);
    logTerminal('Erro ao conectar ao banco de dados para buscar divergências.', 'error');
  }
}

document.getElementById('refresh-div').addEventListener('click', () => {
  const icon = document.querySelector('#refresh-div i');
  icon.classList.add('lucide-spin'); // Adiciona animação de giro
  setTimeout(() => icon.classList.remove('lucide-spin'), 1000);
  loadDivergences();
});

// Adiciona classe de giro para o ícone de loader (CSS manual no JS)
const style = document.createElement('style');
style.innerHTML = `@keyframes spin { 100% { transform: rotate(360deg); } } .lucide-spin { animation: spin 1s linear infinite; }`;
document.head.appendChild(style);

// Carrega lista inicial
loadDivergences();