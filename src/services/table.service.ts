import { prisma } from '../lib/prisma';
import { NotFoundError, BusinessRuleError } from '../middleware/error.middleware';
import { getIO } from '../socket/orderHub';

const tableInclude = {
  zone: true,
  orders: {
    where: { isActive: true, status: { notIn: ['Pagado', 'Cancelado'] } },
    select: { id: true, createdAt: true, waiter: { select: { firstName: true, lastName: true } } },
    take: 1,
  },
};

function mapTable(table: any): any {
  if (!table) return table;
  const activeOrder = table.orders?.[0];
  return {
    ...table,
    zoneName: table.zone?.name ?? '',
    activeOrderId: activeOrder?.id ?? undefined,
    waiterName: activeOrder?.waiter ? `${activeOrder.waiter.firstName} ${activeOrder.waiter.lastName}`.trim() : undefined,
    occupiedSince: activeOrder?.createdAt ?? undefined,
  };
}

export const TableService = {
  async getAllZonesWithTables() {
    const zones = await prisma.tableZone.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { tables: { where: { isActive: true }, orderBy: { number: 'asc' }, include: tableInclude } },
    });
    return zones.map(z => ({ ...z, tables: z.tables.map(mapTable) }));
  },

  async getAllZones() {
    return prisma.tableZone.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  },

  async getAllTables() {
    const tables = await prisma.table.findMany({ where: { isActive: true }, orderBy: { number: 'asc' }, include: tableInclude });
    return tables.map(mapTable);
  },

  async getTableById(id: number) {
    const t = await prisma.table.findFirst({ where: { id, isActive: true }, include: tableInclude });
    if (!t) throw new NotFoundError('Mesa', id);
    return mapTable(t);
  },

  async createZone(data: { name: string; description?: string }) {
    return prisma.tableZone.create({ data });
  },

  async createTable(data: { zoneId: number; number: number; capacity?: number; positionX?: number; positionY?: number; shape?: string }) {
    const zone = await prisma.tableZone.findFirst({ where: { id: data.zoneId, isActive: true } });
    if (!zone) throw new NotFoundError('Zona', data.zoneId);

    const duplicate = await prisma.table.findFirst({ where: { zoneId: data.zoneId, number: data.number, isActive: true } });
    if (duplicate) throw new BusinessRuleError(`Ya existe la mesa #${data.number} en esa zona.`);

    const table = await prisma.table.create({ data, include: tableInclude });
    return mapTable(table);
  },

  async updateTable(id: number, data: { zoneId?: number; number?: number; capacity?: number; positionX?: number; positionY?: number; shape?: string }) {
    await this.getTableById(id);
    const table = await prisma.table.update({ where: { id }, data: { ...data, updatedAt: new Date() }, include: tableInclude });
    return mapTable(table);
  },

  async updateTableStatus(id: number, status: string) {
    await this.getTableById(id);
    const table = await prisma.table.update({ where: { id }, data: { status, updatedAt: new Date() }, include: tableInclude });
    const mapped = mapTable(table);
    getIO()?.to('tables').emit('TableStatusChanged', { tableId: id, status, table: mapped });
    return mapped;
  },

  async deleteTable(id: number) {
    const t = await this.getTableById(id);
    if (t.status !== 'Libre') throw new BusinessRuleError('Solo se pueden eliminar mesas libres.');
    await prisma.table.update({ where: { id }, data: { isActive: false, updatedAt: new Date() } });
  },
};
