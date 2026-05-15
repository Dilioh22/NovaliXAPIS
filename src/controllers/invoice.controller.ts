import { Request, Response, NextFunction } from 'express';
import { InvoiceService } from '../services/invoice.service';
import { generateInvoiceSchema } from '../validators/schemas';

export const InvoiceController = {
  getAll: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await InvoiceService.getInvoices(req.query['from'] as string, req.query['to'] as string)); } catch (e) { next(e); }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await InvoiceService.getInvoiceById(+req.params['id']!)); } catch (e) { next(e); }
  },
  getByOrder: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await InvoiceService.getInvoiceByOrder(+req.params['orderId']!)); } catch (e) { next(e); }
  },
  generate: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await InvoiceService.generateInvoice(generateInvoiceSchema.parse(req.body))); } catch (e) { next(e); }
  },
  void: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await InvoiceService.voidInvoice(+req.params['id']!)); } catch (e) { next(e); }
  },
};
