import { prisma } from '../lib/prisma';

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

    const byDay: Record<string, number> = {};
    orders.forEach(o => {
      const day = o.createdAt.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + Number(o.total);
    });

    const byMethod: Record<string, number> = {};
    orders.flatMap(o => o.payments).forEach(p => {
      const name = p.paymentMethod.name;
      byMethod[name] = (byMethod[name] ?? 0) + Number(p.amount);
    });

    const byWaiter: Record<number, { name: string; orders: number; total: number }> = {};
    orders.forEach(o => {
      if (!byWaiter[o.waiterId]) byWaiter[o.waiterId] = { name: `${o.waiter.firstName} ${o.waiter.lastName}`, orders: 0, total: 0 };
      byWaiter[o.waiterId]!.orders++;
      byWaiter[o.waiterId]!.total += Number(o.total);
    });

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
    const groups = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: { isActive: true, order: { status: 'Pagado', isActive: true } },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });

    const productIds = groups.map(g => g.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { category: true },
    });
    const productMap = new Map(products.map(p => [p.id, p]));

    return groups.map(g => ({
      productId: g.productId,
      name: productMap.get(g.productId)?.name ?? '',
      category: productMap.get(g.productId)?.category.name ?? '',
      quantity: g._sum.quantity ?? 0,
      total: Number(g._sum.subtotal ?? 0),
    }));
  },
};
