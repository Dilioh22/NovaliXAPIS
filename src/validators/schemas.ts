import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(['Admin', 'Cajero', 'Mesero', 'Cocinero']),
  pin: z.string().max(10).optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  role: z.enum(['Admin', 'Cajero', 'Mesero', 'Cocinero']).optional(),
  pin: z.string().max(10).optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(6),
});

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  displayOrder: z.number().int().default(0),
  iconName: z.string().max(100).optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createProductModifierSchema = z.object({
  name: z.string().min(1).max(100),
  priceAdjustment: z.number().default(0),
});

export const createProductSchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  price: z.number().positive(),
  imageUrl: z.string().max(500).optional(),
  preparationTime: z.number().int().optional(),
  isAvailable: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
  modifiers: z.array(createProductModifierSchema).optional(),
});

export const updateProductSchema = createProductSchema.omit({ modifiers: true }).partial();

export const createTableZoneSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const createTableSchema = z.object({
  zoneId: z.number().int().positive(),
  number: z.number().int().positive(),
  capacity: z.number().int().positive().default(4),
  positionX: z.number().int().optional(),
  positionY: z.number().int().optional(),
  shape: z.string().max(50).default('rectangle'),
});

export const updateTableSchema = createTableSchema.partial();

export const updateTableStatusSchema = z.object({
  status: z.enum(['Libre', 'Ocupada', 'Reservada', 'CuentaPedida', 'Mantenimiento']),
});

export const addOrderItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(100),
  modifierIds: z.array(z.number().int().positive()).optional(),
  notes: z.string().optional(),
});

export const createOrderSchema = z.object({
  tableId: z.number().int().positive().optional(),
  orderType: z.enum(['DineIn', 'TakeOut', 'Delivery']).default('DineIn'),
  notes: z.string().optional(),
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(50).optional(),
  items: z.array(addOrderItemSchema).min(1),
});

export const updateOrderSchema = z.object({
  notes: z.string().optional(),
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(50).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  discountAmount: z.number().min(0).optional(),
  tipAmount: z.number().min(0).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['Pendiente', 'EnPreparacion', 'Listo', 'Entregado', 'Pagado', 'Cancelado']),
});

export const cancelOrderSchema = z.object({
  reason: z.string().optional(),
});

export const processPaymentSchema = z.object({
  orderId: z.number().int().positive(),
  paymentMethodCode: z.string().min(1),
  amount: z.number().positive(),
  receivedAmount: z.number().positive().optional(),
  reference: z.string().optional(),
  cashSessionId: z.number().int().positive().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
});

export const openSessionSchema = z.object({
  cashRegisterId: z.number().int().positive(),
  openingAmount: z.number().min(0),
  notes: z.string().optional(),
});

export const closeSessionSchema = z.object({
  closingAmount: z.number().min(0),
  notes: z.string().optional(),
});

export const createReservationSchema = z.object({
  tableId: z.number().int().positive(),
  customerName: z.string().min(1).max(200),
  customerPhone: z.string().max(50).optional(),
  partySize: z.number().int().min(1).max(50).default(1),
  reservationDate: z.string().datetime(),
  notes: z.string().max(500).optional(),
});

export const updateReservationSchema = createReservationSchema.partial();

export const updateReservationStatusSchema = z.object({
  status: z.enum(['Pendiente', 'Confirmada', 'Cancelada', 'NoShow', 'Completada']),
});

export const generateInvoiceSchema = z.object({
  orderId: z.number().int().positive(),
  customerRTN: z.string().max(50).optional(),
  customerName: z.string().max(200).optional(),
  exemptAmount: z.number().min(0).default(0),
});

export function validate<T>(schema: z.ZodSchema<T>) {
  return (data: unknown): T => schema.parse(data);
}
