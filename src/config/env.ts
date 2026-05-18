import dotenv from 'dotenv';
dotenv.config();

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters long.');
}

export const env = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwt: {
    secret: jwtSecret,
    issuer: process.env.JWT_ISSUER ?? 'NovaliX.API',
    audience: process.env.JWT_AUDIENCE ?? 'NovaliX.Client',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '60m',
    refreshExpiresDays: parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? '7', 10),
  },
  cors: {
    origins: (process.env.CORS_ORIGINS ?? 'http://localhost:4200').split(','),
  },
  isDev: (process.env.NODE_ENV ?? 'development') === 'development',
};
