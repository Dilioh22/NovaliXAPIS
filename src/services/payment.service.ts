import { PrismaClient } from '@prisma/client';
import { NotFoundError, BusinessRuleError } from '../middleware/error.middleware';
import { getIO } from '../socket/orderHub';

const prisma = new PrismaClient();

export const PaymentService = {
  async getPaymentMethods() {
    return prisma.paymentMethod.findMany({ where: { isActive: true } });
  },

  async getPaymentsByOrder(orderId: number) {
    return prisma.payment.findMany({
      where: { orderId, isActive: true },
      include: { paymentMethod: true, processedBy: true },
    });
  },

  async processPayment(processedById: number, data: {
    orderId: number; paymentMethodCode: string; amount: number;
    receivedAmount?: number; reference?: string; cashSessionId?: number; discountPercent?: number;
  }) {
    const order = await prisma.order.findFirst({
      where: { id: data.orderId, isActive: true },
      include: { payments: { where: { isActive: true } }, items: { where: { isActive: true } } },
    });
    if (!order) throw new NotFoundError('Orden', data.orderId);
    if (order.status === 'Pagado') throw new BusinessRuleError('La orden ya está pagada.');
    if (order.status === 'Cancelado') throw new BusinessRuleError('No se puede pagar una orden cancelada.');

    const method = await prisma.paymentMethod.findFirst({ where: { code: data.paymentMethodCode, isActive: true } });
    if (!method) throw new NotFoundError('Método de pago', data.paymentMethodCode);

    const totalPaid = order.payments.reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Number(order.total) - totalPaid;

    if (data.amount > remaining + 0.01) throw new BusinessRuleError(`El monto excede el saldo pendiente de L ${remaining.toFixed(2)}.`);

    const changeAmount = data.receivedAmount ? Math.max(0, data.receivedAmount - data.amount) : undefined;

    const payment = await prisma.payment.create({
      data: {
        orderId: data.orderId,
        paymentMethodId: method.id,
        amount: data.amount,
        receivedAmount: data.receivedAmount,
        changeAmount,
        reference: data.reference,
        cashSessionId: data.cashSessionId,
        processedById,
      },
      include: { paymentMethod: true, order: true, processedBy: true },
    });

    const newTotalPaid = totalPaid + data.amount;
    const isFullyPaid = newTotalPaid >= Number(order.total) - 0.01;

    if (isFullyPaid) {
      await prisma.order.update({ where: { id: data.orderId }, data: { status: 'Pagado', updatedAt: new Date() } });
      if (order.tableId) {
        await prisma.table.update({ where: { id: order.tableId }, data: { status: 'Libre', updatedAt: new Date() } });
        getIO()?.to('tables').emit('table:updated', { tableId: order.tableId, status: 'Libre' });
      }
      getIO()?.to('cashier').emit('order:paid', { orderId: data.orderId });
    }

    return { ...payment, isOrderFullyPaid: isFullyPaid };
  },
};
