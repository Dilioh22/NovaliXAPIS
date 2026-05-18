import { prisma } from '../lib/prisma';
import { NotFoundError, BusinessRuleError } from '../middleware/error.middleware';

const include = { table: { include: { zone: true } } };
const CONFLICT_WINDOW_MS = 90 * 60 * 1000;

export const ReservationService = {
  async getAll(date?: string, status?: string) {
    return prisma.reservation.findMany({
      where: {
        isActive: true,
        ...(date ? { reservationDate: { gte: new Date(date), lt: new Date(new Date(date).getTime() + 86400000) } } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { reservationDate: 'asc' },
      include,
    });
  },

  async getByTable(tableId: number) {
    return prisma.reservation.findMany({ where: { tableId, isActive: true }, orderBy: { reservationDate: 'asc' }, include });
  },

  async getById(id: number) {
    const r = await prisma.reservation.findFirst({ where: { id, isActive: true }, include });
    if (!r) throw new NotFoundError('Reservación', id);
    return r;
  },

  async create(data: { tableId: number; customerName: string; customerPhone?: string; partySize?: number; reservationDate: string; notes?: string }) {
    const table = await prisma.table.findFirst({ where: { id: data.tableId, isActive: true } });
    if (!table) throw new NotFoundError('Mesa', data.tableId);

    const partySize = data.partySize ?? 1;
    if (partySize > table.capacity) {
      throw new BusinessRuleError(`La mesa #${table.number} tiene capacidad para ${table.capacity} personas.`);
    }

    const requestedAt = new Date(data.reservationDate);
    const windowStart = new Date(requestedAt.getTime() - CONFLICT_WINDOW_MS);
    const windowEnd   = new Date(requestedAt.getTime() + CONFLICT_WINDOW_MS);

    const conflict = await prisma.reservation.findFirst({
      where: {
        tableId: data.tableId,
        isActive: true,
        status: { notIn: ['Cancelada', 'Completada', 'NoShow'] },
        reservationDate: { gte: windowStart, lte: windowEnd },
      },
    });
    if (conflict) {
      throw new BusinessRuleError('Existe una reservación en un rango de 90 minutos para esa mesa.');
    }

    const reservation = await prisma.reservation.create({
      data: { ...data, reservationDate: requestedAt, partySize },
      include,
    });

    if (table.status === 'Libre') {
      await prisma.table.update({ where: { id: data.tableId }, data: { status: 'Reservada', updatedAt: new Date() } });
    }

    return reservation;
  },

  async update(id: number, data: { tableId?: number; customerName?: string; customerPhone?: string; partySize?: number; reservationDate?: string; notes?: string }) {
    await this.getById(id);
    return prisma.reservation.update({
      where: { id },
      data: { ...data, reservationDate: data.reservationDate ? new Date(data.reservationDate) : undefined, updatedAt: new Date() },
      include,
    });
  },

  async updateStatus(id: number, status: string) {
    const r = await prisma.reservation.findFirst({ where: { id, isActive: true }, include: { table: true } });
    if (!r) throw new NotFoundError('Reservación', id);

    await prisma.reservation.update({ where: { id }, data: { status, updatedAt: new Date() } });

    if (['Cancelada', 'Completada', 'NoShow'].includes(status) && r.table.status === 'Reservada') {
      await prisma.table.update({ where: { id: r.tableId }, data: { status: 'Libre', updatedAt: new Date() } });
    }

    return this.getById(id);
  },

  async delete(id: number) {
    const r = await prisma.reservation.findFirst({ where: { id, isActive: true }, include: { table: true } });
    if (!r) throw new NotFoundError('Reservación', id);

    await prisma.reservation.update({ where: { id }, data: { isActive: false, updatedAt: new Date() } });

    if (['Pendiente', 'Confirmada'].includes(r.status) && r.table.status === 'Reservada') {
      await prisma.table.update({ where: { id: r.tableId }, data: { status: 'Libre', updatedAt: new Date() } });
    }
  },
};
