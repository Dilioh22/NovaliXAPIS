import { Request, Response, NextFunction } from 'express';
import { CashRegisterService } from '../services/cashregister.service';
import { openSessionSchema, closeSessionSchema } from '../validators/schemas';

export const CashRegisterController = {
  getAll: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await CashRegisterService.getAllCashRegisters()); } catch (e) { next(e); }
  },
  getMySession: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await CashRegisterService.getMyActiveSession(req.user!.sub)); } catch (e) { next(e); }
  },
  getHistory: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await CashRegisterService.getSessionHistory()); } catch (e) { next(e); }
  },
  getSessionById: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await CashRegisterService.getSessionById(+req.params['id']!)); } catch (e) { next(e); }
  },
  openSession: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = openSessionSchema.parse(req.body);
      res.status(201).json(await CashRegisterService.openSession(req.user!.sub, data));
    } catch (e) { next(e); }
  },
  closeSession: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = closeSessionSchema.parse(req.body);
      res.json(await CashRegisterService.closeSession(+req.params['id']!, req.user!.sub, data));
    } catch (e) { next(e); }
  },
};
