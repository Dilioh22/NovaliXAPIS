import { prisma } from '../lib/prisma';
import { NotFoundError, BusinessRuleError } from '../middleware/error.middleware';

const sessionInclude = { cashRegister: true, openedBy: true, closedBy: true };

function mapSession(session: any): any {
  if (!session) return session;
  return {
    ...session,
    cashRegisterName: session.cashRegister?.name ?? '',
    openedByName: session.openedBy ? `${session.openedBy.firstName} ${session.openedBy.lastName}`.trim() : '',
    closedByName: session.closedBy ? `${session.closedBy.firstName} ${session.closedBy.lastName}`.trim() : undefined,
  };
}

export const CashRegisterService = {
  async getAllCashRegisters() {
    const registers = await prisma.cashRegister.findMany({
      where: { isActive: true },
      include: {
        sessions: {
          where: { status: 'Open' },
          take: 1,
        },
      },
    });
    return registers.map(r => ({ ...r, currentSession: r.sessions[0] ?? null }));
  },

  async getMyActiveSession(userId: number) {
    const session = await prisma.cashRegisterSession.findFirst({
      where: { openedById: userId, status: 'Open' },
      include: sessionInclude,
    });
    return mapSession(session);
  },

  async getActiveSession(cashRegisterId: number) {
    const session = await prisma.cashRegisterSession.findFirst({
      where: { cashRegisterId, status: 'Open' },
      include: sessionInclude,
    });
    return mapSession(session);
  },

  async openSession(userId: number, data: { cashRegisterId: number; openingAmount: number; notes?: string }) {
    const existing = await prisma.cashRegisterSession.findFirst({ where: { openedById: userId, status: 'Open' } });
    if (existing) throw new BusinessRuleError('Ya tienes una sesión abierta.');

    const registerBusy = await prisma.cashRegisterSession.findFirst({ where: { cashRegisterId: data.cashRegisterId, status: 'Open' } });
    if (registerBusy) throw new BusinessRuleError('Esa caja ya tiene una sesión abierta.');

    const session = await prisma.cashRegisterSession.create({
      data: {
        cashRegisterId: data.cashRegisterId,
        openedById: userId,
        openingAmount: data.openingAmount,
        status: 'Open',
        notes: data.notes,
        openedAt: new Date(),
      },
      include: sessionInclude,
    });
    return mapSession(session);
  },

  async closeSession(sessionId: number, userId: number, data: { closingAmount: number; notes?: string }) {
    const session = await prisma.cashRegisterSession.findFirst({ where: { id: sessionId, status: 'Open' } });
    if (!session) throw new NotFoundError('Sesión', sessionId);

    const openOrders = await prisma.order.count({
      where: {
        payments: { some: { cashSessionId: sessionId, isActive: true } },
        status: { notIn: ['Pagado', 'Cancelado'] },
        isActive: true,
      },
    });
    if (openOrders > 0) throw new BusinessRuleError(`Hay ${openOrders} orden(es) sin cerrar en esta sesión.`);

    const payments = await prisma.payment.findMany({
      where: { cashSessionId: sessionId, isActive: true },
      include: { paymentMethod: true },
    });

    const totalCash = payments.filter(p => p.paymentMethod.code === 'CASH').reduce((s, p) => s + Number(p.amount), 0);
    const totalCard = payments.filter(p => p.paymentMethod.code === 'CARD').reduce((s, p) => s + Number(p.amount), 0);
    const totalTransfer = payments.filter(p => p.paymentMethod.code === 'TRANSFER').reduce((s, p) => s + Number(p.amount), 0);
    const totalSales = totalCash + totalCard + totalTransfer;
    const expectedAmount = Number(session.openingAmount) + totalCash;
    const difference = data.closingAmount - expectedAmount;

    const updated = await prisma.cashRegisterSession.update({
      where: { id: sessionId },
      data: {
        closedById: userId,
        closingAmount: data.closingAmount,
        expectedAmount,
        difference,
        totalCash,
        totalCard,
        totalTransfer,
        totalSales,
        transactionCount: payments.length,
        status: 'Closed',
        closedAt: new Date(),
        notes: data.notes,
        updatedAt: new Date(),
      },
      include: sessionInclude,
    });
    return mapSession(updated);
  },

  async getSessionHistory(from?: string, to?: string) {
    const toDate = to ? new Date(to) : undefined;
    if (toDate && !isNaN(toDate.getTime()) && toDate.getUTCHours() === 0 && toDate.getUTCMinutes() === 0 && toDate.getUTCSeconds() === 0) {
      toDate.setUTCHours(23, 59, 59, 999);
    }
    const sessions = await prisma.cashRegisterSession.findMany({
      where: {
        ...(from || toDate ? { openedAt: { ...(from ? { gte: new Date(from) } : {}), ...(toDate ? { lte: toDate } : {}) } } : {}),
      },
      orderBy: { openedAt: 'desc' },
      take: 50,
      include: sessionInclude,
    });
    return sessions.map(mapSession);
  },

  async getSessionById(id: number) {
    const s = await prisma.cashRegisterSession.findUnique({ where: { id }, include: sessionInclude });
    if (!s) throw new NotFoundError('Sesión', id);
    return mapSession(s);
  },
};
