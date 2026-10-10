import { prisma } from '../lib/prisma';

export const ReportService = {
  async getSalesReport(from: string, to: string) {
    // `to` puede llegar como fecha sin hora (ej. "2026-09-22"), que se interpreta como
    // medianoche UTC; se extiende al final del día para incluir todo el rango solicitado.
    const toDate = new Date(to);
    if (!isNaN(toDate.getTime()) && toDate.getUTCHours() === 0 && toDate.getUTCMinutes() === 0 && toDate.getUTCSeconds() === 0) {
      toDate.setUTCHours(23, 59, 59, 999);
    }

    const orders = await prisma.order.findMany({
      where: { status: 'Pagado', isActive: true, createdAt: { gte: new Date(from), lte: toDate } },
      include: { payments: { include: { paymentMethod: true } }, items: { include: { product: { include: { category: true } } } }, waiter: true },
    });

    const totalSales = orders.reduce((s, o) => s + Number(o.total), 0);
    const totalTax = orders.reduce((s, o) => s + Number(o.taxAmount), 0);
    const totalDiscount = orders.reduce((s, o) => s + Number(o.discountAmount), 0);
    const totalTips = orders.reduce((s, o) => s + Number(o.tipAmount), 0);
    const netSales = totalSales - totalTax;

    const byDay: Record<string, { total: number; orderCount: number }> = {};
    orders.forEach(o => {
      const day = o.createdAt.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { total: 0, orderCount: 0 };
      byDay[day]!.total += Number(o.total);
      byDay[day]!.orderCount++;
    });

    const byMethod: Record<string, { total: number; count: number }> = {};
    orders.flatMap(o => o.payments).forEach(p => {
      const name = p.paymentMethod.name;
      if (!byMethod[name]) byMethod[name] = { total: 0, count: 0 };
      byMethod[name]!.total += Number(p.amount);
      byMethod[name]!.count++;
    });

    const byWaiter: Record<number, { waiterId: number; waiterName: string; orderCount: number; totalSales: number; totalTips: number }> = {};
    orders.forEach(o => {
      if (!byWaiter[o.waiterId]) byWaiter[o.waiterId] = { waiterId: o.waiterId, waiterName: `${o.waiter.firstName} ${o.waiter.lastName}`, orderCount: 0, totalSales: 0, totalTips: 0 };
      byWaiter[o.waiterId]!.orderCount++;
      byWaiter[o.waiterId]!.totalSales += Number(o.total);
      byWaiter[o.waiterId]!.totalTips += Number(o.tipAmount);
    });

    const byProduct: Record<number, { productName: string; category: string; quantity: number; total: number }> = {};
    orders.flatMap(o => o.items).forEach(item => {
      const pid = item.productId;
      if (!byProduct[pid]) byProduct[pid] = { productName: item.product.name, category: item.product.category.name, quantity: 0, total: 0 };
      byProduct[pid]!.quantity += item.quantity;
      byProduct[pid]!.total += Number(item.subtotal);
    });

    return {
      from, to,
      totalSales, totalTax, totalDiscount, totalTips, netSales,
      totalOrders: orders.length,
      averageTicket: orders.length ? totalSales / orders.length : 0,
      salesByDay: Object.entries(byDay).map(([date, v]) => ({ date, total: v.total, orderCount: v.orderCount })).sort((a, b) => a.date.localeCompare(b.date)),
      salesByPaymentMethod: Object.entries(byMethod).map(([method, v]) => ({ method, total: v.total, count: v.count })),
      waiterPerformance: Object.values(byWaiter)
        .map(w => ({ ...w, averageTicket: w.orderCount ? w.totalSales / w.orderCount : 0 }))
        .sort((a, b) => b.totalSales - a.totalSales),
      topProducts: Object.entries(byProduct)
        .map(([id, v]) => ({ productId: +id, ...v, averagePrice: v.quantity ? v.total / v.quantity : 0 }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 20),
    };
  },

  async getHourlyReport(from: string, to: string) {
    // Mismo criterio que getSalesReport: `to` sin hora se extiende al final del día.
    const toDate = new Date(to);
    if (!isNaN(toDate.getTime()) && toDate.getUTCHours() === 0 && toDate.getUTCMinutes() === 0 && toDate.getUTCSeconds() === 0) {
      toDate.setUTCHours(23, 59, 59, 999);
    }

    const orders = await prisma.order.findMany({
      where: { status: 'Pagado', isActive: true, createdAt: { gte: new Date(from), lte: toDate } },
      select: { total: true, createdAt: true },
    });

    const byHour: { total: number; orderCount: number }[] = Array.from({ length: 24 }, () => ({ total: 0, orderCount: 0 }));
    orders.forEach(o => {
      // Honduras no usa horario de verano; se aplica un desfase fijo de UTC-6 para reportar
      // la hora local del negocio en lugar de la hora UTC de almacenamiento.
      const hour = (o.createdAt.getUTCHours() + 24 - 6) % 24;
      byHour[hour]!.total += Number(o.total);
      byHour[hour]!.orderCount++;
    });

    return byHour.map((v, hour) => ({ hour, total: v.total, orderCount: v.orderCount }));
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
