import { PrismaClient } from '@prisma/client';
import { NotFoundError, BusinessRuleError } from '../middleware/error.middleware';

const prisma = new PrismaClient();

const sessionInclude = { cashRegister: true, openedBy: true, closedBy: true };

export const CashRegisterService = {
  async getAllCashRegisters() {
    const registers = await prisma.cashRegister.findMany({ where: { isActive: true } });
    return Promise.all(registers.map(async (r) => {
      const session = await prisma.cashRegisterSession.findFirst({ where: { cashRegisterId: r.id, status: 'Open' } });
      return { ...r, currentSession: session };
    }));
  },

  async getMyActiveSession(userId: number) {
    return prisma.cashRegisterSession.findFirst({
      where: { openedById: userId, status: 'Open' },
      include: sessionInclude,
    });
  },

  async getActiveSession(cashRegisterId: number) {
    return prisma.cashRegisterSession.findFirst({
      where: { cashRegisterId, status: 'Open' },
      include: sessionInclude,
    });
  },

  async openSession(userId: number, data: { cashRegisterId: number; openingAmount: number; notes?: string }) {
    const existing = await prisma.cashRegisterSession.findFirst({ where: { openedById: userId, status: 'Open' } });
    if (existing) throw new BusinessRuleError('Ya tienes una sesión abierta.');

    const registerBusy = await prisma.cashRegisterSession.findFirst({ where: { cashRegisterId: data.cashRegisterId, status: 'Open' } });
    if (registerBusy) throw new BusinessRuleError('Esa caja ya tiene una sesión abierta.');

    return prisma.cashRegisterSession.create({
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
  },

  async closeSession(sessionId: number, userId: number, data: { closingAmount: number; notes?: string }) {
    const session = await prisma.cashRegisterSession.findFirst({ where: { id: sessionId, status: 'Open' } });
    if (!session) throw new NotFoundError('Sesión', sessionId);

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

    return prisma.cashRegisterSession.update({
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
  },

  async getSessionHistory() {
    return prisma.cashRegisterSession.findMany({
      orderBy: { openedAt: 'desc' },
      take: 50,
      include: sessionInclude,
    });
  },

  async getSessionById(id: number) {
    const s = await prisma.cashRegisterSession.findUnique({ where: { id }, include: sessionInclude });
    if (!s) throw new NotFoundError('Sesión', id);
    return s;
  },
};
