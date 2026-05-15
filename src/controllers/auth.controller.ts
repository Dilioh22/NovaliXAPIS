import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { loginSchema, refreshTokenSchema, createUserSchema, updateUserSchema, resetPasswordSchema } from '../validators/schemas';

export const AuthController = {
  login: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      res.json(await AuthService.login(email, password));
    } catch (e) { next(e); }
  },

  refresh: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = refreshTokenSchema.parse(req.body);
      res.json(await AuthService.refreshToken(refreshToken));
    } catch (e) { next(e); }
  },

  logout: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await AuthService.revokeToken(req.user!.sub);
      res.status(204).send();
    } catch (e) { next(e); }
  },

  me: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await AuthService.getCurrentUser(req.user!.sub));
    } catch (e) { next(e); }
  },

  getAll: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await AuthService.getAllUsers()); } catch (e) { next(e); }
  },

  getById: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await AuthService.getUserById(+req.params['id']!)); } catch (e) { next(e); }
  },

  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createUserSchema.parse(req.body);
      res.status(201).json(await AuthService.createUser(data));
    } catch (e) { next(e); }
  },

  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = updateUserSchema.parse(req.body);
      res.json(await AuthService.updateUser(+req.params['id']!, data));
    } catch (e) { next(e); }
  },

  resetPassword: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { newPassword } = resetPasswordSchema.parse(req.body);
      await AuthService.resetPassword(+req.params['id']!, newPassword);
      res.status(204).send();
    } catch (e) { next(e); }
  },

  toggleStatus: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await AuthService.toggleUserStatus(+req.params['id']!)); } catch (e) { next(e); }
  },
};
