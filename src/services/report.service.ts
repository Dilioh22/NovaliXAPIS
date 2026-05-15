import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const ReportService = {
  async getSalesReport(from: string, to: string) {
    const orders = await prisma.order.findMany({
      where: { status: 'Pagado', isActive: true, createdAt: { gte: new Date(from), lte: new Date(to) } },
      include: { payments: { include: { paymentMethod: true } }, items: { include: { product: { include: { category: true } } } }, waiter: true },
    });

    const totalSales = orders.reduce((s, o) => s + Number(o.total), 0);
    const totalTax = orders.reduce((s, o) => s + Number(o.taxAmount), 0);
    const totalDiscount = orders.reduce((s, o) => s + Number(o.discountAmount), 0);
    const totalTips = orders.reduce((s, o) => s + Number(o.tipAmount), 0);
    const netSales = totalSales - totalTax;

    // Sales by day
    const byDay: Record<string, number> = {};
    orders.forEach(o => {
      const day = o.createdAt.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + Number(o.total);
    });

    // Sales by payment method
    const byMethod: Record<string, number> = {};
    orders.flatMap(o => o.payments).forEach(p => {
      const name = p.paymentMethod.name;
      byMethod[name] = (byMethod[name] ?? 0) + Number(p.amount);
    });

    // Waiter performance
    const byWaiter: Record<number, { name: string; orders: number; total: number }> = {};
    orders.forEach(o => {
      if (!byWaiter[o.waiterId]) byWaiter[o.waiterId] = { name: `${o.waiter.firstName} ${o.waiter.lastName}`, orders: 0, total: 0 };
      byWaiter[o.waiterId]!.orders++;
      byWaiter[o.waiterId]!.total += Number(o.total);
    });

    // Top products
    const byProduct: Record<number, { name: string; category: string; qty: number; total: number }> = {};
    orders.flatMap(o => o.items).forEach(item => {
      const pid = item.productId;
      if (!byProduct[pid]) byProduct[pid] = { name: item.product.name, category: item.product.category.name, qty: 0, total: 0 };
      byProduct[pid]!.qty += item.quantity;
      byProduct[pid]!.total += Number(item.subtotal);
    });

    return {
      from, to,
      totalSales, totalTax, totalDiscount, totalTips, netSales,
      totalOrders: orders.length,
      averageTicket: orders.length ? totalSales / orders.length : 0,
      salesByDay: Object.entries(byDay).map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date)),
      salesByPaymentMethod: Object.entries(byMethod).map(([method, total]) => ({ method, total })),
      waiterPerformance: Object.values(byWaiter).sort((a, b) => b.total - a.total),
      topProducts: Object.entries(byProduct).map(([id, v]) => ({ productId: +id, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 20),
    };
  },

  async getDailySalesReport() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86400000);
    return this.getSalesReport(today.toISOString(), tomorrow.toISOString());
  },

  async getTopProducts(limit = 10) {
    const items = await prisma.orderItem.findMany({
      where: { isActive: true, order: { status: 'Pagado' } },
      include: { product: { include: { category: true } } },
    });

    const map: Record<number, { productId: number; name: string; category: string; quantity: number; total: number }> = {};
    items.forEach(i => {
      if (!map[i.productId]) map[i.productId] = { productId: i.productId, name: i.product.name, category: i.product.category.name, quantity: 0, total: 0 };
      map[i.productId]!.quantity += i.quantity;
      map[i.productId]!.total += Number(i.subtotal);
    });

    return Object.values(map).sort((a, b) => b.quantity - a.quantity).slice(0, limit);
  },
};
