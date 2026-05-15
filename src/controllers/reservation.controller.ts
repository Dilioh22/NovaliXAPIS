import { Request, Response, NextFunction } from 'express';
import { ReservationService } from '../services/reservation.service';
import { createReservationSchema, updateReservationSchema, updateReservationStatusSchema } from '../validators/schemas';

export const ReservationController = {
  getAll: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await ReservationService.getAll(req.query['date'] as string, req.query['status'] as string)); } catch (e) { next(e); }
  },
  getByTable: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await ReservationService.getByTable(+req.params['tableId']!)); } catch (e) { next(e); }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await ReservationService.getById(+req.params['id']!)); } catch (e) { next(e); }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await ReservationService.create(createReservationSchema.parse(req.body))); } catch (e) { next(e); }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await ReservationService.update(+req.params['id']!, updateReservationSchema.parse(req.body))); } catch (e) { next(e); }
  },
  updateStatus: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = updateReservationStatusSchema.parse(req.body);
      res.json(await ReservationService.updateStatus(+req.params['id']!, status));
    } catch (e) { next(e); }
  },
  delete: async (req: Request, res: Response, next: NextFunction) => {
    try { await ReservationService.delete(+req.params['id']!); res.status(204).send(); } catch (e) { next(e); }
  },
};
