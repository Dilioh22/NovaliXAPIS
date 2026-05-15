import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { logger } from './utils/logger';
import router from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { initSocket } from './socket/orderHub';
import { runSeeder } from './seed/seeder';

const app = express();
const server = http.createServer(app);
initSocket(server);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (origin.endsWith('.vercel.app') || env.cors.origins.includes(origin)) {
      return cb(null, true);
    }
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(helmet());
app.use(morgan('combined', {
  stream: { write: (msg: string) => logger.http(msg.trim()) },
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'NovaliX API', ts: new Date() }));
app.use('/api', router);
app.use(notFoundHandler);
app.use(errorHandler);

// Solo iniciar servidor en local, no en Vercel
if (!process.env.VERCEL) {
  const start = async () => {
    try {
      if (env.nodeEnv !== 'test') await runSeeder();
    } catch (err) {
      logger.warn('Seeder skipped or failed (non-fatal)');
    }
    server.listen(env.port, () => {
      logger.info(`NovaliX API running on port ${env.port} [${env.nodeEnv}]`);
      logger.info(`Health: http://localhost:${env.port}/health`);
    });
  };
  start();
}

export default app;
