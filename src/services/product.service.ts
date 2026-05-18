import { prisma } from '../lib/prisma';
import { NotFoundError, BusinessRuleError } from '../middleware/error.middleware';

const productInclude = {
  category: true,
  modifiers: { where: { isActive: true } },
};

export const ProductService = {
  // ── Categories ──────────────────────────────────────────────
  async getAllCategories() {
    return prisma.category.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      include: { products: { where: { isActive: true }, include: { modifiers: { where: { isActive: true } } } } },
    });
  },

  async getCategoryById(id: number) {
    const cat = await prisma.category.findFirst({ where: { id, isActive: true }, include: { products: { where: { isActive: true } } } });
    if (!cat) throw new NotFoundError('Categoría', id);
    return cat;
  },

  async createCategory(data: { name: string; description?: string; displayOrder?: number; iconName?: string }) {
    return prisma.category.create({ data });
  },

  async updateCategory(id: number, data: { name?: string; description?: string; displayOrder?: number; iconName?: string }) {
    await this.getCategoryById(id);
    return prisma.category.update({ where: { id }, data: { ...data, updatedAt: new Date() } });
  },

  async deleteCategory(id: number) {
    const cat = await this.getCategoryById(id);
    const hasProducts = await prisma.product.count({ where: { categoryId: id, isActive: true } });
    if (hasProducts) throw new BusinessRuleError('No se puede eliminar una categoría con productos activos.');
    await prisma.category.update({ where: { id: cat.id }, data: { isActive: false, updatedAt: new Date() } });
  },

  // ── Products ─────────────────────────────────────────────────
  async getAllProducts() {
    return prisma.product.findMany({ where: { isActive: true }, orderBy: [{ categoryId: 'asc' }, { displayOrder: 'asc' }], include: productInclude });
  },

  async getProductById(id: number) {
    const p = await prisma.product.findFirst({ where: { id, isActive: true }, include: productInclude });
    if (!p) throw new NotFoundError('Producto', id);
    return p;
  },

  async getProductsByCategory(categoryId: number) {
    return prisma.product.findMany({ where: { categoryId, isActive: true }, orderBy: { displayOrder: 'asc' }, include: productInclude });
  },

  async createProduct(data: {
    categoryId: number; name: string; description?: string; price: number;
    imageUrl?: string; preparationTime?: number; isAvailable?: boolean;
    displayOrder?: number; modifiers?: { name: string; priceAdjustment?: number }[];
  }) {
    const { modifiers, ...rest } = data;
    return prisma.product.create({
      data: {
        ...rest,
        price: rest.price,
        modifiers: modifiers?.length ? { create: modifiers } : undefined,
      },
      include: productInclude,
    });
  },

  async updateProduct(id: number, data: { categoryId?: number; name?: string; description?: string; price?: number; imageUrl?: string; preparationTime?: number; isAvailable?: boolean; displayOrder?: number }) {
    await this.getProductById(id);
    return prisma.product.update({ where: { id }, data: { ...data, updatedAt: new Date() }, include: productInclude });
  },

  async deleteProduct(id: number) {
    await this.getProductById(id);
    await prisma.product.update({ where: { id }, data: { isActive: false, updatedAt: new Date() } });
  },

  async toggleAvailability(id: number) {
    const p = await this.getProductById(id);
    return prisma.product.update({ where: { id }, data: { isAvailable: !p.isAvailable, updatedAt: new Date() }, include: productInclude });
  },
};
