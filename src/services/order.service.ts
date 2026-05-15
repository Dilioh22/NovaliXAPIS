import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, BusinessRuleError } from '../middleware/error.middleware';
import { generateOrderNumber } from '../utils/orderNumber';
import { getIO } from '../socket/orderHub';

const prisma = new PrismaClient();

const orderInclude = {
  table: { include: { zone: true } },
  waiter: true,
  items: {
    where: { isActive: true },
    include: { product: true, modifiers: true },
  },
  payments: { where: { isActive: true }, include: { paymentMethod: true } },
};

function calcTotals(items: { unitPrice: Prisma.Decimal; quantity: number; modifiers: { priceAdjustment: Prisma.Decimal }[] }[], discountPercent = 0, discountAmount = 0, tipAmount = 0, taxRate = 0.15) {
  const subtotal = items.reduce((sum, item) => {
    const modTotal = item.modifiers.reduce((s, m) => s + Number(m.priceAdjustment), 0);
    return sum + (Number(item.unitPrice) + modTotal) * item.quantity;
  }, 0);

  const discount = discountPercent > 0 ? subtotal * (discountPercent / 100) : discountAmount;
  const taxable = subtotal - discount;
  const tax = taxable * taxRate;
  const total = taxable + tax + tipAmount;

  return { subtotal, taxAmount: tax, discountAmount: discount, total };
}

export const OrderService = {
  async getAllOrders(status?: string) {
    return prisma.order.findMany({
      where: { isActive: true, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: orderInclude,
    });
  },

  async getActiveOrders() {
    return prisma.order.findMany({
      where: { isActive: true, status: { notIn: ['Pagado', 'Cancelado'] } },
      orderBy: { createdAt: 'asc' },
      include: orderInclude,
    });
  },

  async getActiveOrdersForKitchen() {
    return prisma.order.findMany({
      where: { isActive: true, status: { in: ['Pendiente', 'EnPreparacion'] } },
      orderBy: { createdAt: 'asc' },
      include: orderInclude,
    });
  },

  async getOrderById(id: number) {
    const o = await prisma.order.findFirst({ where: { id, isActive: true }, include: orderInclude });
    if (!o) throw new NotFoundError('Orden', id);
    return o;
  },

  async getOrderByTable(tableId: number) {
    return prisma.order.findFirst({
      where: { tableId, isActive: true, status: { notIn: ['Pagado', 'Cancelado'] } },
      include: orderInclude,
    });
  },

  async createOrder(waiterId: number, data: {
    tableId?: number; orderType?: string; notes?: string;
    customerName?: string; customerPhone?: string;
    items: { productId: number; quantity: number; modifierIds?: number[]; notes?: string }[];
  }) {
    const orderNumber = await generateOrderNumber();

    const itemsData = await Promise.all(data.items.map(async (item) => {
      const product = await prisma.product.findFirst({ where: { id: item.productId, isActive: true, isAvailable: true } });
      if (!product) throw new NotFoundError('Producto', item.productId);

      const modifiers = item.modifierIds?.length
        ? await prisma.productModifier.findMany({ where: { id: { in: item.modifierIds }, isActive: true } })
        : [];

      const modTotal = modifiers.reduce((s, m) => s + Number(m.priceAdjustment), 0);
      const unitPrice = Number(product.price) + modTotal;
      const subtotal = unitPrice * item.quantity;

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        subtotal,
        notes: item.notes,
        modifiers: { create: modifiers.map(m => ({ productModifierId: m.id, name: m.name, priceAdjustment: m.priceAdjustment })) },
      };
    }));

    const subtotal = itemsData.reduce((s, i) => s + i.subtotal, 0);
    const taxRate = 0.15;
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        tableId: data.tableId,
        waiterId,
        orderType: data.orderType ?? 'DineIn',
        notes: data.notes,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        subtotal,
        taxRate,
        taxAmount,
        total,
        items: { create: itemsData },
      },
      include: orderInclude,
    });

    if (data.tableId) {
      await prisma.table.update({ where: { id: data.tableId }, data: { status: 'Ocupada', updatedAt: new Date() } });
    }

    getIO()?.to('kitchen').emit('order:new', order);
    getIO()?.to('tables').emit('table:updated', { tableId: data.tableId, status: 'Ocupada' });

    return order;
  },

  async addItemToOrder(orderId: number, item: { productId: number; quantity: number; modifierIds?: number[]; notes?: string }) {
    const order = await this.getOrderById(orderId);
    if (['Pagado', 'Cancelado'].includes(order.status)) throw new BusinessRuleError('No se puede modificar una orden cerrada.');

    const product = await prisma.product.findFirst({ where: { id: item.productId, isActive: true } });
    if (!product) throw new NotFoundError('Producto', item.productId);

    const modifiers = item.modifierIds?.length
      ? await prisma.productModifier.findMany({ where: { id: { in: item.modifierIds }, isActive: true } })
      : [];

    const unitPrice = Number(product.price) + modifiers.reduce((s, m) => s + Number(m.priceAdjustment), 0);
    const subtotal = unitPrice * item.quantity;

    await prisma.orderItem.create({
      data: {
        orderId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        subtotal,
        notes: item.notes,
        modifiers: { create: modifiers.map(m => ({ productModifierId: m.id, name: m.name, priceAdjustment: m.priceAdjustment })) },
      },
    });

    return this.recalcAndSave(orderId, Number(order.discountPercent), Number(order.discountAmount), Number(order.tipAmount));
  },

  async removeOrderItem(orderId: number, itemId: number) {
    const order = await this.getOrderById(orderId);
    if (['Pagado', 'Cancelado'].includes(order.status)) throw new BusinessRuleError('No se puede modificar una orden cerrada.');

    const item = await prisma.orderItem.findFirst({ where: { id: itemId, orderId, isActive: true } });
    if (!item) throw new NotFoundError('Item', itemId);

    await prisma.orderItem.update({ where: { id: itemId }, data: { isActive: false, updatedAt: new Date() } });
    return this.recalcAndSave(orderId, Number(order.discountPercent), Number(order.discountAmount), Number(order.tipAmount));
  },

  async updateOrder(id: number, data: { notes?: string; customerName?: string; customerPhone?: string; discountPercent?: number; discountAmount?: number; tipAmount?: number }) {
    const order = await this.getOrderById(id);
    if (['Pagado', 'Cancelado'].includes(order.status)) throw new BusinessRuleError('No se puede modificar una orden cerrada.');

    await prisma.order.update({ where: { id }, data: { ...data, updatedAt: new Date() } });
    return this.recalcAndSave(id, data.discountPercent ?? Number(order.discountPercent), data.discountAmount ?? Number(order.discountAmount), data.tipAmount ?? Number(order.tipAmount));
  },

  async sendToKitchen(orderId: number) {
    const order = await this.getOrderById(orderId);
    const now = new Date();

    await prisma.orderItem.updateMany({
      where: { orderId, status: 'Pendiente', isActive: true },
      data: { status: 'EnPreparacion', sentToKitchenAt: now },
    });

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: 'EnPreparacion', updatedAt: now },
      include: orderInclude,
    });

    getIO()?.to('kitchen').emit('order:updated', updated);
    return updated;
  },

  async markOrderItemReady(orderId: number, itemId: number) {
    await this.getOrderById(orderId);
    await prisma.orderItem.update({ where: { id: itemId }, data: { status: 'Listo', readyAt: new Date(), updatedAt: new Date() } });

    const pending = await prisma.orderItem.count({ where: { orderId, status: { not: 'Listo' }, isActive: true } });
    if (pending === 0) {
      await prisma.order.update({ where: { id: orderId }, data: { status: 'Listo', updatedAt: new Date() } });
    }

    const order = await this.getOrderById(orderId);
    getIO()?.to('waiter').emit('order:updated', order);
    getIO()?.to('kitchen').emit('order:updated', order);
    return order;
  },

  async updateOrderStatus(id: number, status: string) {
    await this.getOrderById(id);
    const updated = await prisma.order.update({ where: { id }, data: { status, updatedAt: new Date() }, include: orderInclude });
    getIO()?.emit('order:updated', updated);
    return updated;
  },

  async cancelOrder(id: number) {
    const order = await this.getOrderById(id);
    if (order.status === 'Pagado') throw new BusinessRuleError('No se puede cancelar una orden pagada.');

    const updated = await prisma.order.update({ where: { id }, data: { status: 'Cancelado', updatedAt: new Date() }, include: orderInclude });

    if (order.tableId) {
      await prisma.table.update({ where: { id: order.tableId }, data: { status: 'Libre', updatedAt: new Date() } });
      getIO()?.to('tables').emit('table:updated', { tableId: order.tableId, status: 'Libre' });
    }

    getIO()?.emit('order:updated', updated);
    return updated;
  },

  async recalcAndSave(orderId: number, discountPercent: number, discountAmount: number, tipAmount: number) {
    const items = await prisma.orderItem.findMany({ where: { orderId, isActive: true }, include: { modifiers: true } });
    const { subtotal, taxAmount, total } = calcTotals(items as never, discountPercent, discountAmount, tipAmount);

    return prisma.order.update({
      where: { id: orderId },
      data: { subtotal, taxAmount, discountPercent, discountAmount, tipAmount, total, updatedAt: new Date() },
      include: orderInclude,
    });
  },
};
