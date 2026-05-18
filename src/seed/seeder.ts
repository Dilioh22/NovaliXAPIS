import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('Seeding database…');

  // Payment methods
  if (!(await prisma.paymentMethod.count())) {
    await prisma.paymentMethod.createMany({ data: [
      { name: 'Efectivo', code: 'CASH' },
      { name: 'Tarjeta de Crédito/Débito', code: 'CARD' },
      { name: 'Transferencia', code: 'TRANSFER' },
    ]});
    console.log('✓ Métodos de pago');
  }

  // Categories + Products
  if (!(await prisma.category.count())) {
    const entradas     = await prisma.category.create({ data: { name: 'Entradas',          displayOrder: 1, iconName: 'appetizer'   } });
    const bebidas      = await prisma.category.create({ data: { name: 'Bebidas',           displayOrder: 2, iconName: 'drink'       } });
    const principales  = await prisma.category.create({ data: { name: 'Platos Principales',displayOrder: 3, iconName: 'main_course' } });
    const postres      = await prisma.category.create({ data: { name: 'Postres',           displayOrder: 4, iconName: 'dessert'     } });

    await prisma.product.createMany({ data: [
      { categoryId: entradas.id,    name: 'Sopa del Día',          price: 85,  preparationTime: 10, displayOrder: 1 },
      { categoryId: entradas.id,    name: 'Ensalada César',        price: 120, preparationTime: 8,  displayOrder: 2 },
      { categoryId: entradas.id,    name: 'Nachos con Queso',      price: 130, preparationTime: 12, displayOrder: 3 },
      { categoryId: bebidas.id,     name: 'Agua Natural',          price: 30,  preparationTime: 1,  displayOrder: 1 },
      { categoryId: bebidas.id,     name: 'Refresco',              price: 45,  preparationTime: 1,  displayOrder: 2 },
      { categoryId: bebidas.id,     name: 'Jugo Natural',          price: 65,  preparationTime: 5,  displayOrder: 3 },
      { categoryId: bebidas.id,     name: 'Café Americano',        price: 55,  preparationTime: 3,  displayOrder: 4 },
      { categoryId: principales.id, name: 'Pollo a la Plancha',    price: 220, preparationTime: 20, displayOrder: 1 },
      { categoryId: principales.id, name: 'Chuleta de Cerdo',      price: 250, preparationTime: 25, displayOrder: 2 },
      { categoryId: principales.id, name: 'Bistec a la Hondureña', price: 280, preparationTime: 25, displayOrder: 3 },
      { categoryId: principales.id, name: 'Pasta Carbonara',       price: 190, preparationTime: 18, displayOrder: 4 },
      { categoryId: postres.id,     name: 'Flan de Caramelo',      price: 85,  preparationTime: 5,  displayOrder: 1 },
      { categoryId: postres.id,     name: 'Pastel de Chocolate',   price: 95,  preparationTime: 5,  displayOrder: 2 },
    ]});

    const burger = await prisma.product.create({ data: { categoryId: principales.id, name: 'Hamburguesa Clásica', price: 175, preparationTime: 15, displayOrder: 5 } });
    await prisma.productModifier.createMany({ data: [
      { productId: burger.id, name: 'Queso Extra', priceAdjustment: 20 },
      { productId: burger.id, name: 'Tocino',      priceAdjustment: 25 },
      { productId: burger.id, name: 'Sin Cebolla', priceAdjustment: 0  },
    ]});
    console.log('✓ Categorías y productos');
  }

  // Table zones + tables
  if (!(await prisma.tableZone.count())) {
    const interior = await prisma.tableZone.create({ data: { name: 'Interior', description: 'Salón interior climatizado' } });
    const terraza  = await prisma.tableZone.create({ data: { name: 'Terraza',  description: 'Área exterior al aire libre' } });
    const bar      = await prisma.tableZone.create({ data: { name: 'Bar',      description: 'Área de bar' } });

    for (let i = 1; i <= 8; i++) {
      await prisma.table.create({ data: { zoneId: interior.id, number: i, capacity: i <= 4 ? 4 : 6, positionX: ((i-1)%4)*150, positionY: ((i-1)/4|0)*150 } });
    }
    for (let i = 9; i <= 14; i++) {
      await prisma.table.create({ data: { zoneId: terraza.id, number: i, capacity: 4, positionX: ((i-9)%3)*150, positionY: ((i-9)/3|0)*150 } });
    }
    await prisma.table.createMany({ data: [
      { zoneId: bar.id, number: 15, capacity: 2, shape: 'circle' },
      { zoneId: bar.id, number: 16, capacity: 2, shape: 'circle' },
    ]});
    console.log('✓ Zonas y mesas');
  }

  // Users
  if (!(await prisma.user.count())) {
    await prisma.user.createMany({ data: [
      { email: 'admin@restaurante.com',    passwordHash: await bcrypt.hash('Admin123!',   11), firstName: 'Administrador', lastName: 'Sistema',   role: 'Admin',    pin: await bcrypt.hash('1234', 11) },
      { email: 'cajero@restaurante.com',   passwordHash: await bcrypt.hash('Cajero123!',  11), firstName: 'Carlos',        lastName: 'García',    role: 'Cajero',   pin: await bcrypt.hash('2222', 11) },
      { email: 'mesero@restaurante.com',   passwordHash: await bcrypt.hash('Mesero123!',  11), firstName: 'María',         lastName: 'López',     role: 'Mesero',   pin: await bcrypt.hash('3333', 11) },
      { email: 'cocinero@restaurante.com', passwordHash: await bcrypt.hash('Cocina123!',  11), firstName: 'Juan',          lastName: 'Martínez',  role: 'Cocinero', pin: await bcrypt.hash('4444', 11) },
    ]});
    console.log('✓ Usuarios');
  }

  // Cash registers
  if (!(await prisma.cashRegister.count())) {
    await prisma.cashRegister.createMany({ data: [
      { name: 'Caja Principal', location: 'Recepción' },
      { name: 'Caja Bar',       location: 'Bar' },
    ]});
    console.log('✓ Cajas registradoras');
  }

  console.log('Seed completado.');
}

export async function runSeeder() { await main(); }

if (require.main === module) {
  main().catch(console.error).finally(() => prisma.$disconnect());
}
