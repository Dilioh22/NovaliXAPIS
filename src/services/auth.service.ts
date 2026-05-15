import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { signAccessToken, generateRefreshToken, refreshTokenExpiry } from '../utils/jwt';
import { NotFoundError, BusinessRuleError, UnauthorizedError } from '../middleware/error.middleware';

const prisma = new PrismaClient();

export const AuthService = {
  async login(email: string, password: string) {
    const user = await prisma.user.findFirst({
      where: { email, isActive: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      throw new UnauthorizedError('Credenciales inválidas.');

    const token = signAccessToken({ sub: user.id, email: user.email, role: user.role });
    const refresh = generateRefreshToken();

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refresh, refreshTokenExpiry: refreshTokenExpiry(), lastLoginAt: new Date() },
    });

    return {
      accessToken: token,
      refreshToken: refresh,
      expiresAt: new Date(Date.now() + 480 * 60 * 1000),
      user: mapUser(user),
    };
  },

  async refreshToken(token: string) {
    const user = await prisma.user.findFirst({
      where: { refreshToken: token, isActive: true },
    });
    if (!user || !user.refreshTokenExpiry || user.refreshTokenExpiry < new Date())
      throw new UnauthorizedError('Refresh token inválido o expirado.');

    const newAccess = signAccessToken({ sub: user.id, email: user.email, role: user.role });
    const newRefresh = generateRefreshToken();

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefresh, refreshTokenExpiry: refreshTokenExpiry() },
    });

    return { accessToken: newAccess, refreshToken: newRefresh, expiresAt: new Date(Date.now() + 480 * 60 * 1000), user: mapUser(user) };
  },

  async revokeToken(userId: number) {
    await prisma.user.update({ where: { id: userId }, data: { refreshToken: null, refreshTokenExpiry: null } });
  },

  async getCurrentUser(userId: number) {
    const user = await prisma.user.findFirst({ where: { id: userId, isActive: true } });
    if (!user) throw new NotFoundError('Usuario', userId);
    return mapUser(user);
  },

  async getAllUsers() {
    const users = await prisma.user.findMany({ where: { isActive: true }, orderBy: { firstName: 'asc' } });
    return users.map(mapUser);
  },

  async getUserById(id: number) {
    const user = await prisma.user.findFirst({ where: { id, isActive: true } });
    if (!user) throw new NotFoundError('Usuario', id);
    return mapUser(user);
  },

  async createUser(data: { email: string; password: string; firstName: string; lastName: string; role: string; pin?: string }) {
    const exists = await prisma.user.findFirst({ where: { email: data.email } });
    if (exists) throw new BusinessRuleError('Ya existe un usuario con ese email.');

    const hash = await bcrypt.hash(data.password, 11);
    const user = await prisma.user.create({
      data: { email: data.email, passwordHash: hash, firstName: data.firstName, lastName: data.lastName, role: data.role, pin: data.pin },
    });
    return mapUser(user);
  },

  async updateUser(id: number, data: { firstName?: string; lastName?: string; role?: string; pin?: string }) {
    await this.getUserById(id);
    const user = await prisma.user.update({ where: { id }, data: { ...data, updatedAt: new Date() } });
    return mapUser(user);
  },

  async resetPassword(id: number, newPassword: string) {
    await this.getUserById(id);
    const hash = await bcrypt.hash(newPassword, 11);
    await prisma.user.update({ where: { id }, data: { passwordHash: hash, updatedAt: new Date() } });
  },

  async toggleUserStatus(id: number) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('Usuario', id);
    const updated = await prisma.user.update({ where: { id }, data: { isActive: !user.isActive, updatedAt: new Date() } });
    return mapUser(updated);
  },
};

function mapUser(u: { id: number; email: string; firstName: string; lastName: string; role: string; pin: string | null; isActive: boolean; lastLoginAt: Date | null; createdAt: Date }) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    fullName: `${u.firstName} ${u.lastName}`,
    role: u.role,
    pin: u.pin,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}
