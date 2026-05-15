import { Request, Response, NextFunction } from 'express';
import { ReportService } from '../services/report.service';

export const ReportController = {
  getSalesReport: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const from = req.query['from'] as string ?? new Date(Date.now() - 30 * 86400000).toISOString();
      const to   = req.query['to']   as string ?? new Date().toISOString();
      res.json(await ReportService.getSalesReport(from, to));
    } catch (e) { next(e); }
  },
  getToday: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await ReportService.getDailySalesReport()); } catch (e) { next(e); }
  },
  getTopProducts: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await ReportService.getTopProducts(+(req.query['limit'] ?? 10))); } catch (e) { next(e); }
  },
};
