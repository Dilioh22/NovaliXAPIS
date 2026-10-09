/**
 * Verificación de #13 SIN base de datos. Usa el servicio, el router y el hub socket.io reales,
 * y reemplaza solo Prisma por una copia en memoria. No se conecta a ninguna base.
 *   npm run test:availability
 */
process.env['JWT_SECRET'] = 'x'.repeat(48);
process.env['NODE_ENV'] = 'test';
// Si algo intentara usar Prisma de verdad, fallaría aquí en vez de llegar a una base real.
process.env['DATABASE_URL'] = 'postgresql://nadie:nada@127.0.0.1:1/nada';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, Socket } from 'socket.io-client';

interface AvailabilityEvent { productId: number; name: string; isAvailable: boolean }

// ── Prisma falso (solo lo que usa ProductService para estas rutas) ──────────────
const row: Record<string, any> = {
  id: 1, categoryId: 1, name: 'Horchata', price: 40, isAvailable: true, isActive: true, modifiers: [], category: { id: 1 },
};
let updates = 0;
const fakePrisma = {
  product: {
    findFirst: async ({ where }: any) => (where.id === row['id'] && row['isActive'] ? { ...row } : null),
    update: async ({ data }: any) => { updates++; Object.assign(row, data); return { ...row }; },
  },
};
const prismaPath = require.resolve('../lib/prisma');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: fakePrisma } } as any;

let server: http.Server;
let base = '';
let socket: Socket;
const events: AvailabilityEvent[] = [];
const tokens = {} as Record<'Admin' | 'Cajero' | 'Mesero' | 'Cocinero', string>;
const wait = (ms = 150) => new Promise<void>(r => setTimeout(r, ms));

async function call(role: keyof typeof tokens, method: string, path: string, body?: unknown) {
  const r = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens[role]}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}
const toggle = (role: keyof typeof tokens, body?: unknown) => call(role, 'PATCH', '/products/1/toggle-availability', body);

before(async () => {
  const express = (await import('express')).default;
  const router = (await import('../routes')).default;
  const { errorHandler, notFoundHandler } = await import('../middleware/error.middleware');
  const { initSocket } = await import('../socket/orderHub');
  const { signAccessToken } = await import('../utils/jwt');

  const app = express();
  app.use(express.json());
  app.use('/api', router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  server = http.createServer(app);
  initSocket(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  (['Admin', 'Cajero', 'Mesero', 'Cocinero'] as const).forEach((role, i) => {
    tokens[role] = signAccessToken({ sub: i + 1, email: `${role.toLowerCase()}@prueba.test`, role });
  });

  socket = connect(base, { path: '/hubs/orders', auth: { token: tokens.Mesero } });
  socket.on('ProductAvailabilityChanged', (e: AvailabilityEvent) => events.push(e));
  await new Promise<void>((resolve, reject) => { socket.once('connect', () => resolve()); socket.once('connect_error', reject); });
});

after(async () => {
  socket?.close();
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
});

test('Mesero no puede marcar disponibilidad (403) y no cambia nada', async () => {
  const r = await toggle('Mesero', { isAvailable: false });
  assert.equal(r.status, 403);
  assert.equal(updates, 0);
  assert.equal(events.length, 0);
});

test('Cocinero marca agotado: 200, isAvailable=false y se emite 1 evento completo', async () => {
  const r = await toggle('Cocinero', { isAvailable: false });
  await wait();
  assert.equal(r.status, 200);
  assert.equal(r.json.isAvailable, false);
  assert.deepEqual(events, [{ productId: 1, name: 'Horchata', isAvailable: false }]);
});

test('repetir el mismo valor es idempotente: sigue agotado, no escribe ni emite', async () => {
  const antes = updates;
  const r = await toggle('Cocinero', { isAvailable: false });
  await wait();
  assert.equal(r.status, 200);
  assert.equal(r.json.isAvailable, false);
  assert.equal(updates, antes);
  assert.equal(events.length, 1);
});

test('Cajero marca disponible: 200 y se emite el evento', async () => {
  const r = await toggle('Cajero', { isAvailable: true });
  await wait();
  assert.equal(r.status, 200);
  assert.equal(events.length, 2);
  assert.deepEqual(events[1], { productId: 1, name: 'Horchata', isAvailable: true });
});

test('sin valor en el cuerpo alterna y emite (compatibilidad)', async () => {
  const r = await toggle('Admin', {});
  await wait();
  assert.equal(r.status, 200);
  assert.equal(r.json.isAvailable, false);
  assert.equal(events.length, 3);
  assert.equal(events[2]?.isAvailable, false);
});

test('PUT que no cambia isAvailable no emite; el que sí lo cambia, emite con el nombre vigente', async () => {
  const mismo = await call('Admin', 'PUT', '/products/1', { isAvailable: false });
  const nombre = await call('Admin', 'PUT', '/products/1', { name: 'Horchata grande' });
  await wait();
  assert.equal(mismo.status, 200);
  assert.equal(nombre.status, 200);
  assert.equal(events.length, 3);

  const cambia = await call('Admin', 'PUT', '/products/1', { isAvailable: true });
  await wait();
  assert.equal(cambia.status, 200);
  assert.equal(events.length, 4);
  assert.deepEqual(events[3], { productId: 1, name: 'Horchata grande', isAvailable: true });
});
