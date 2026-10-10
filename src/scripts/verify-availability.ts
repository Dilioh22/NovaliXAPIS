/**
 * Verificación EN VIVO de #13 (productos agotados en tiempo real).
 * Requiere el API en marcha contra una base de PRUEBAS sembrada. No ejecutar contra producción:
 * cambia la disponibilidad de UN producto (y la restaura al terminar), y el API de producción
 * ejecuta el seeder al arrancar.
 *   npm run verify:availability          (API_URL opcional; por defecto http://localhost:3000)
 * La prueba sin base de datos (npm run test:availability) cubre la misma lógica con Prisma en memoria.
 */
import { io, Socket } from 'socket.io-client';

const BASE = process.env['API_URL'] ?? 'http://localhost:3000';
const USERS = {
  Admin:    { email: 'admin@restaurante.com',    password: 'Admin123!' },
  Cajero:   { email: 'cajero@restaurante.com',   password: 'Cajero123!' },
  Mesero:   { email: 'mesero@restaurante.com',   password: 'Mesero123!' },
  Cocinero: { email: 'cocinero@restaurante.com', password: 'Cocina123!' },
} as const;
type Role = keyof typeof USERS;
interface AvailabilityEvent { productId: number; name: string; isAvailable: boolean }

const results: { name: string; ok: boolean }[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`);
}
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function login(role: Role): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(USERS[role]),
  });
  if (!r.ok) throw new Error(`login de ${role} falló: ${r.status}`);
  return ((await r.json()) as { accessToken: string }).accessToken;
}

async function call(token: string, method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const r = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

async function main(): Promise<void> {
  const tokens = {
    Admin: await login('Admin'), Cajero: await login('Cajero'),
    Mesero: await login('Mesero'), Cocinero: await login('Cocinero'),
  };
  const list = await call(tokens.Admin, 'GET', '/products');
  const product = list.json[0];
  const original: boolean = product.isAvailable;
  const toggle = `/products/${product.id}/toggle-availability`;

  const events: AvailabilityEvent[] = [];
  const socket: Socket = io(BASE, { path: '/hubs/orders', auth: { token: tokens.Mesero } });
  socket.on('ProductAvailabilityChanged', (e: AvailabilityEvent) => events.push(e));
  await new Promise<void>((resolve, reject) => { socket.once('connect', () => resolve()); socket.once('connect_error', reject); });

  try {
    await call(tokens.Admin, 'PATCH', toggle, { isAvailable: true });   // punto de partida: disponible
    await sleep(300);
    events.length = 0;

    const mesero = await call(tokens.Mesero, 'PATCH', toggle, { isAvailable: false });
    check('Mesero no puede marcar (403)', mesero.status === 403, `status ${mesero.status}`);

    const c1 = await call(tokens.Cocinero, 'PATCH', toggle, { isAvailable: false });
    await sleep(300);
    check('Cocinero marca agotado (200, isAvailable=false)', c1.status === 200 && c1.json?.isAvailable === false, `status ${c1.status}`);
    check('Se emite 1 evento con productId, name e isAvailable=false',
      events.length === 1 && events[0].productId === product.id && events[0].name === product.name && events[0].isAvailable === false,
      JSON.stringify(events));

    const c2 = await call(tokens.Cocinero, 'PATCH', toggle, { isAvailable: false });
    await sleep(300);
    check('Repetir el mismo valor deja el producto agotado (idempotente)', c2.status === 200 && c2.json?.isAvailable === false, `status ${c2.status}`);
    check('Repetir el mismo valor no emite otro evento', events.length === 1, `eventos=${events.length}`);

    const cajero = await call(tokens.Cajero, 'PATCH', toggle, { isAvailable: true });
    await sleep(300);
    check('Cajero marca disponible (200) y se emite el evento',
      cajero.status === 200 && events.length === 2 && events[1].isAvailable === true, `status ${cajero.status} eventos=${events.length}`);

    const putSame = await call(tokens.Admin, 'PUT', `/products/${product.id}`, { isAvailable: true });
    await sleep(300);
    check('PUT que no cambia isAvailable no emite', putSame.status === 200 && events.length === 2, `status ${putSame.status} eventos=${events.length}`);

    const putChange = await call(tokens.Admin, 'PUT', `/products/${product.id}`, { isAvailable: false });
    await sleep(300);
    check('PUT que cambia isAvailable emite el evento',
      putChange.status === 200 && events.length === 3 && events[2].isAvailable === false, `status ${putChange.status} eventos=${events.length}`);

    const alternar = await call(tokens.Admin, 'PATCH', toggle, {});
    await sleep(300);
    check('Sin valor en el cuerpo, alterna y emite (compatibilidad)',
      alternar.status === 200 && alternar.json?.isAvailable === true && events.length === 4 && events[3].isAvailable === true,
      `status ${alternar.status} eventos=${events.length}`);
  } finally {
    await call(tokens.Admin, 'PATCH', toggle, { isAvailable: original });
    socket.close();
  }

  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1); });
