import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, BusinessRuleError } from '../middleware/error.middleware';
import { generateOrderNumber } from '../utils/orderNumber';
import { getIO } from '../socket/orderHub';

const orderInclude = {
  table: { include: { zone: true } },
  waiter: true,
  items: {
    where: { isActive: true },
    include: { product: true, modifiers: true },
  },
  payments: { where: { isActive: true }, include: { paymentMethod: true } },
};

function mapOrder(order: any): any {
  if (!order) return order;
  return {
    ...order,
    waiterName: order.waiter ? `${order.waiter.firstName} ${order.waiter.lastName}`.trim() : '',
    tableNumber: order.table?.number ?? null,
    subtotal: Number(order.subtotal),
    taxAmount: Number(order.taxAmount),
    discountAmount: Number(order.discountAmount),
    discountPercent: Number(order.discountPercent),
    total: Number(order.total),
    tipAmount: Number(order.tipAmount),
    items: (order.items ?? []).map((item: any) => ({
      ...item,
      productName: item.product?.name ?? '',
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
      modifiers: (item.modifiers ?? []).map((m: any) => ({
        id: m.id,
        name: m.name,
        priceAdjustment: Number(m.priceAdjustment),
      })),
    })),
  };
}

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
  async getAllOrders(status?: string, page = 1, pageSize = 50) {
    const skip = (page - 1) * pageSize;
    const orders = await prisma.order.findMany({
      where: { isActive: true, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: orderInclude,
      skip,
      take: pageSize,
    });
    return orders.map(mapOrder);
  },

  async getActiveOrders() {
    const orders = await prisma.order.findMany({
      where: { isActive: true, status: { notIn: ['Pagado', 'Cancelado'] } },
      orderBy: { createdAt: 'asc' },
      include: orderInclude,
    });
    return orders.map(mapOrder);
  },

  async getActiveOrdersForKitchen() {
    const orders = await prisma.order.findMany({
      where: { isActive: true, status: { in: ['Pendiente', 'EnPreparacion'] } },
      orderBy: { createdAt: 'asc' },
      include: orderInclude,
    });
    return orders.map(mapOrder);
  },

  async getOrderById(id: number) {
    const o = await prisma.order.findFirst({ where: { id, isActive: true }, include: orderInclude });
    if (!o) throw new NotFoundError('Orden', id);
    return mapOrder(o);
  },

  async getOrderByTable(tableId: number) {
    const o = await prisma.order.findFirst({
      where: { tableId, isActive: true, status: { notIn: ['Pagado', 'Cancelado'] } },
      include: orderInclude,
    });
    return o ? mapOrder(o) : o;
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

    const order = await prisma.$transaction(async (tx) => {
      if (data.tableId) {
        const table = await tx.table.findFirst({
          where: { id: data.tableId, status: 'Libre', isActive: true },
        });
        if (!table) throw new BusinessRuleError('La mesa no está disponible.');
        await tx.table.update({ where: { id: data.tableId }, data: { status: 'Ocupada', updatedAt: new Date() } });
      }

      return tx.order.create({
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
    });

    const mapped = mapOrder(order);
    getIO()?.to('kitchen').emit('NewOrder', mapped);
    if (data.tableId) {
      getIO()?.to('tables').emit('TableStatusChanged', { tableId: data.tableId, status: 'Ocupada' });
    }

    return mapped;
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

    const pendingItems = await prisma.orderItem.count({
      where: { orderId, status: 'Pendiente', isActive: true },
    });
    if (pendingItems === 0) throw new BusinessRuleError('No hay ítems pendientes de enviar a cocina.');

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

    getIO()?.to('kitchen').emit('OrderUpdated', mapOrder(updated));
    return mapOrder(updated);
  },

  async markOrderItemReady(orderId: number, itemId: number) {
    await this.getOrderById(orderId);
    const item = await prisma.orderItem.findFirst({ where: { id: itemId, orderId, isActive: true } });
    if (!item) throw new NotFoundError('Item', itemId);

    await prisma.orderItem.update({ where: { id: itemId }, data: { status: 'Listo', readyAt: new Date(), updatedAt: new Date() } });

    getIO()?.to('waiter').emit('ItemStatusChanged', { orderId, itemId, status: 'Listo' });
    getIO()?.to('kitchen').emit('ItemStatusChanged', { orderId, itemId, status: 'Listo' });

    const pending = await prisma.orderItem.count({ where: { orderId, status: { not: 'Listo' }, isActive: true } });
    if (pending === 0) {
      await prisma.order.update({ where: { id: orderId }, data: { status: 'Listo', updatedAt: new Date() } });
      getIO()?.to('waiter').emit('OrderReady', { orderId });
      getIO()?.to('kitchen').emit('OrderReady', { orderId });
    }

    return this.getOrderById(orderId);
  },

  async updateOrderStatus(id: number, status: string) {
    await this.getOrderById(id);
    const updated = await prisma.order.update({ where: { id }, data: { status, updatedAt: new Date() }, include: orderInclude });
    getIO()?.emit('OrderUpdated', mapOrder(updated));
    return mapOrder(updated);
  },

  async cancelOrder(id: number) {
    const order = await this.getOrderById(id);
    if (order.status === 'Pagado') throw new BusinessRuleError('No se puede cancelar una orden pagada.');

    const updated = await prisma.order.update({ where: { id }, data: { status: 'Cancelado', updatedAt: new Date() }, include: orderInclude });

    if (order.tableId) {
      await prisma.table.update({ where: { id: order.tableId }, data: { status: 'Libre', updatedAt: new Date() } });
      getIO()?.to('tables').emit('TableStatusChanged', { tableId: order.tableId, status: 'Libre' });
    }

    getIO()?.emit('OrderCancelled', { orderId: id });
    return mapOrder(updated);
  },

  async recalcAndSave(orderId: number, discountPercent: number, discountAmount: number, tipAmount: number) {
    const items = await prisma.orderItem.findMany({ where: { orderId, isActive: true }, include: { modifiers: true } });
    const { subtotal, taxAmount, total } = calcTotals(items as never, discountPercent, discountAmount, tipAmount);

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { subtotal, taxAmount, discountPercent, discountAmount, tipAmount, total, updatedAt: new Date() },
      include: orderInclude,
    });
    return mapOrder(updated);
  },
};
