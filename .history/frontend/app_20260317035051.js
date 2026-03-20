// Constante para definir a URL da nossa API (Backend)
const API_BASE_URL = 'http://localhost:3000';

const terminal = document.getElementById('terminal');
const progressBar = document.getElementById('progress-bar');
const timeLeftDisplay = document.getElementById('time-left');
const startBtn = document.getElementById('start-bot');
const divTableBody = document.querySelector('#div-table tbody');

function logTerminal(message, type) {
  const span = document.createElement('span');
  span.className = `log ${type}`;
  span.textContent = `> ${message}`;
  terminal.appendChild(span);
  terminal.scrollTop = terminal.scrollHeight; // Auto-scroll
}

startBtn.addEventListener('click', () => {
  terminal.innerHTML = ''; 
  progressBar.style.width = '0%';
  progressBar.textContent = '0%';
  startBtn.disabled = true;

  // Agora aponta para o endereço completo do Backend
  const eventSource = new EventSource(`${API_BASE_URL}/api/bot/stream`);

  eventSource.onmessage = function(event) {
    const data = JSON.parse(event.data);
    if (data.msg) logTerminal(data.msg, data.type);

    if (data.type === 'progress') {
      progressBar.style.width = `${data.percent}%`;
      progressBar.textContent = `${data.percent}%`;
      timeLeftDisplay.textContent = `Tempo estimado: ${data.timeLeft}`;
    }

    if (data.type === 'done') {
      progressBar.style.width = '100%';
      progressBar.textContent = '100%';
      timeLeftDisplay.textContent = 'Finalizado.';
      eventSource.close();
      startBtn.disabled = false;
      loadDivergences();
    }
  };

  eventSource.onerror = function(err) {
    logTerminal('Conexão perdida com o bot API.', 'error');
    eventSource.close();
    startBtn.disabled = false;
  };
});

async function loadDivergences() {
  try {
    // Faz a requisição de busca (fetch) no servidor Node.js
    const res = await fetch(`${API_BASE_URL}/api/divergencias`);
    const data = await res.json();
    
    divTableBody.innerHTML = '';
    data.forEach(div => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${div.mlItemId}</td>
        <td>${div.motivo}</td>
        <td><a href="${div.link}" target="_blank" class="link-btn">Ver Anúncio</a></td>
      `;
      divTableBody.appendChild(tr);
    });
  } catch (error) {
    console.error("Erro ao carregar divergências:", error);
    logTerminal('Erro ao conectar ao banco de dados para buscar divergências.', 'error');
  }
}

document.getElementById('refresh-div').addEventListener('click', loadDivergences);

// Carrega lista inicial
loadDivergences();