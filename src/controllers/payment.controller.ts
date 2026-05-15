import { Request, Response, NextFunction } from 'express';
import { PaymentService } from '../services/payment.service';
import { processPaymentSchema } from '../validators/schemas';

export const PaymentController = {
  getMethods: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await PaymentService.getPaymentMethods()); } catch (e) { next(e); }
  },
  getByOrder: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await PaymentService.getPaymentsByOrder(+req.params['orderId']!)); } catch (e) { next(e); }
  },
  process: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = processPaymentSchema.parse(req.body);
      res.status(201).json(await PaymentService.processPayment(req.user!.sub, data));
    } catch (e) { next(e); }
  },
};
