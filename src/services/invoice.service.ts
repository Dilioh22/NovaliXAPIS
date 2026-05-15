import { PrismaClient } from '@prisma/client';
import { NotFoundError, BusinessRuleError } from '../middleware/error.middleware';

const prisma = new PrismaClient();
const include = { order: true };

async function nextInvoiceNumber(): Promise<string> {
  const last = await prisma.invoice.findFirst({ orderBy: { id: 'desc' } });
  const seq = last ? parseInt(last.invoiceNumber.split('-')[1] ?? '0', 10) + 1 : 1;
  return `INV-${String(seq).padStart(6, '0')}`;
}

export const InvoiceService = {
  async getInvoices(from?: string, to?: string) {
    return prisma.invoice.findMany({
      where: {
        isActive: true,
        ...(from && to ? { createdAt: { gte: new Date(from), lte: new Date(to) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include,
    });
  },

  async getInvoiceById(id: number) {
    const inv = await prisma.invoice.findFirst({ where: { id, isActive: true }, include });
    if (!inv) throw new NotFoundError('Factura', id);
    return inv;
  },

  async getInvoiceByOrder(orderId: number) {
    const inv = await prisma.invoice.findFirst({ where: { orderId, isActive: true }, include });
    if (!inv) throw new NotFoundError('Factura para orden', orderId);
    return inv;
  },

  async generateInvoice(data: { orderId: number; customerRTN?: string; customerName?: string; exemptAmount?: number }) {
    const order = await prisma.order.findFirst({
      where: { id: data.orderId, isActive: true },
      include: { items: { where: { isActive: true } } },
    });
    if (!order) throw new NotFoundError('Orden', data.orderId);
    if (order.status !== 'Pagado') throw new BusinessRuleError('Solo se pueden facturar órdenes pagadas.');

    const existing = await prisma.invoice.findFirst({ where: { orderId: data.orderId, isActive: true } });
    if (existing) throw new BusinessRuleError('Esta orden ya tiene factura emitida.');

    const exemptAmount = data.exemptAmount ?? 0;
    const subtotal = Number(order.subtotal) - exemptAmount;
    const taxAmount = subtotal * Number(order.taxRate);
    const total = subtotal + taxAmount + exemptAmount;

    return prisma.invoice.create({
      data: {
        orderId: data.orderId,
        invoiceNumber: await nextInvoiceNumber(),
        customerRTN: data.customerRTN,
        customerName: data.customerName,
        subtotal,
        taxAmount,
        exemptAmount,
        total,
        status: 'Emitida',
      },
      include,
    });
  },

  async voidInvoice(id: number) {
    const inv = await this.getInvoiceById(id);
    if (inv.status === 'Anulada') throw new BusinessRuleError('La factura ya está anulada.');
    return prisma.invoice.update({ where: { id }, data: { status: 'Anulada', updatedAt: new Date() }, include });
  },
};
