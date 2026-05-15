import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  iss: string;
  aud: string;
}

export const signAccessToken = (payload: Omit<JwtPayload, 'iss' | 'aud'>): string =>
  jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn as jwt.SignOptions['expiresIn'],
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
  });

export const verifyAccessToken = (token: string): JwtPayload =>
  jwt.verify(token, env.jwt.secret, {
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
  }) as unknown as JwtPayload;

export const generateRefreshToken = (): string =>
  require('crypto').randomBytes(64).toString('hex');

export const refreshTokenExpiry = (): Date => {
  const d = new Date();
  d.setDate(d.getDate() + env.jwt.refreshExpiresDays);
  return d;
};
