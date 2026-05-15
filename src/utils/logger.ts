import winston from 'winston';
import path from 'path';
import fs from 'fs';

const isVercel = !!process.env.VERCEL;

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, stack }) =>
        stack ? `${timestamp} [${level}] ${message}\n${stack}` : `${timestamp} [${level}] ${message}`,
      ),
    ),
  }),
];
// Solo escribir archivos en desarrollo local
if (!isVercel) {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'novalix-error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(logsDir, `novalix-${new Date().toISOString().slice(0, 10)}.log`),
    }),
  );
}

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports,
});
