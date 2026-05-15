import { PrismaClient } from '@prisma/client';
import { NotFoundError, BusinessRuleError } from '../middleware/error.middleware';

const prisma = new PrismaClient();

const tableInclude = {
  zone: true,
  orders: {
    where: { isActive: true, status: { notIn: ['Pagado', 'Cancelado'] } },
    select: { id: true },
    take: 1,
  },
};

export const TableService = {
  async getAllZonesWithTables() {
    return prisma.tableZone.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { tables: { where: { isActive: true }, orderBy: { number: 'asc' }, include: tableInclude } },
    });
  },

  async getAllZones() {
    return prisma.tableZone.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  },

  async getAllTables() {
    return prisma.table.findMany({ where: { isActive: true }, orderBy: { number: 'asc' }, include: tableInclude });
  },

  async getTableById(id: number) {
    const t = await prisma.table.findFirst({ where: { id, isActive: true }, include: tableInclude });
    if (!t) throw new NotFoundError('Mesa', id);
    return t;
  },

  async createZone(data: { name: string; description?: string }) {
    return prisma.tableZone.create({ data });
  },

  async createTable(data: { zoneId: number; number: number; capacity?: number; positionX?: number; positionY?: number; shape?: string }) {
    const zone = await prisma.tableZone.findFirst({ where: { id: data.zoneId, isActive: true } });
    if (!zone) throw new NotFoundError('Zona', data.zoneId);

    const duplicate = await prisma.table.findFirst({ where: { zoneId: data.zoneId, number: data.number, isActive: true } });
    if (duplicate) throw new BusinessRuleError(`Ya existe la mesa #${data.number} en esa zona.`);

    return prisma.table.create({ data, include: tableInclude });
  },

  async updateTable(id: number, data: { zoneId?: number; number?: number; capacity?: number; positionX?: number; positionY?: number; shape?: string }) {
    await this.getTableById(id);
    return prisma.table.update({ where: { id }, data: { ...data, updatedAt: new Date() }, include: tableInclude });
  },

  async updateTableStatus(id: number, status: string) {
    await this.getTableById(id);
    return prisma.table.update({ where: { id }, data: { status, updatedAt: new Date() } });
  },

  async deleteTable(id: number) {
    const t = await this.getTableById(id);
    if (t.status !== 'Libre') throw new BusinessRuleError('Solo se pueden eliminar mesas libres.');
    await prisma.table.update({ where: { id }, data: { isActive: false, updatedAt: new Date() } });
  },
};
