import { Request, Response, NextFunction } from 'express';
import { TableService } from '../services/table.service';
import { createTableZoneSchema, createTableSchema, updateTableSchema, updateTableStatusSchema } from '../validators/schemas';

export const TableController = {
  getZonesWithTables: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await TableService.getAllZonesWithTables()); } catch (e) { next(e); }
  },
  getZones: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await TableService.getAllZones()); } catch (e) { next(e); }
  },
  getTables: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await TableService.getAllTables()); } catch (e) { next(e); }
  },
  getTableById: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await TableService.getTableById(+req.params['id']!)); } catch (e) { next(e); }
  },
  createZone: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await TableService.createZone(createTableZoneSchema.parse(req.body))); } catch (e) { next(e); }
  },
  createTable: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await TableService.createTable(createTableSchema.parse(req.body))); } catch (e) { next(e); }
  },
  updateTable: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await TableService.updateTable(+req.params['id']!, updateTableSchema.parse(req.body))); } catch (e) { next(e); }
  },
  updateStatus: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = updateTableStatusSchema.parse(req.body);
      res.json(await TableService.updateTableStatus(+req.params['id']!, status));
    } catch (e) { next(e); }
  },
  deleteTable: async (req: Request, res: Response, next: NextFunction) => {
    try { await TableService.deleteTable(+req.params['id']!); res.status(204).send(); } catch (e) { next(e); }
  },
};
