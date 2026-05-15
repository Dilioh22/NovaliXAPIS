import { Request, Response, NextFunction } from 'express';
import { OrderService } from '../services/order.service';
import { createOrderSchema, addOrderItemSchema, updateOrderSchema, updateOrderStatusSchema } from '../validators/schemas';

export const OrderController = {
  getAll: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await OrderService.getAllOrders(req.query['status'] as string)); } catch (e) { next(e); }
  },
  getActive: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await OrderService.getActiveOrders()); } catch (e) { next(e); }
  },
  getKitchen: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await OrderService.getActiveOrdersForKitchen()); } catch (e) { next(e); }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await OrderService.getOrderById(+req.params['id']!)); } catch (e) { next(e); }
  },
  getByTable: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await OrderService.getOrderByTable(+req.params['tableId']!)); } catch (e) { next(e); }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createOrderSchema.parse(req.body);
      res.status(201).json(await OrderService.createOrder(req.user!.sub, data as Parameters<typeof OrderService.createOrder>[1]));
    } catch (e) { next(e); }
  },
  addItem: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = addOrderItemSchema.parse(req.body);
      res.json(await OrderService.addItemToOrder(+req.params['id']!, item as Parameters<typeof OrderService.addItemToOrder>[1]));
    } catch (e) { next(e); }
  },
  removeItem: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await OrderService.removeOrderItem(+req.params['id']!, +req.params['itemId']!)); } catch (e) { next(e); }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await OrderService.updateOrder(+req.params['id']!, updateOrderSchema.parse(req.body))); } catch (e) { next(e); }
  },
  updateStatus: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = updateOrderStatusSchema.parse(req.body);
      res.json(await OrderService.updateOrderStatus(+req.params['id']!, status));
    } catch (e) { next(e); }
  },
  sendToKitchen: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await OrderService.sendToKitchen(+req.params['id']!)); } catch (e) { next(e); }
  },
  markItemReady: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await OrderService.markOrderItemReady(+req.params['id']!, +req.params['itemId']!)); } catch (e) { next(e); }
  },
  cancel: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await OrderService.cancelOrder(+req.params['id']!)); } catch (e) { next(e); }
  },
};
