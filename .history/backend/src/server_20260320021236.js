import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { iniciarTodosAgendadores, verificarExclusoesAgendadas } from './services/jobs.js';

// Importação das rotas modulares
import authRoutes from './routes/authRoutes.js';
import catalogRoutes from './routes/catalogRoutes.js';
import mlRoutes from './routes/mlRoutes.js';
import iaRoutes from './routes/iaRoutes.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Mapeamento das Rotas
app.use(authRoutes);
app.use(catalogRoutes);
app.use(mlRoutes);
app.use(iaRoutes);

// Inicialização do Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
  
  // Restaura agendadores do robô ML
  await iniciarTodosAgendadores();

  // Inicia o Job de Exclusão de Contas (roda a cada hora)
  verificarExclusoesAgendadas();
  setInterval(verificarExclusoesAgendadas, 60 * 60 * 1000);
});