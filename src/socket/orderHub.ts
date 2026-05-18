import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { logger } from '../utils/logger';
import { env } from '../config/env';

let io: SocketServer | null = null;

export function getIO(): SocketServer | null { return io; }

type AuthSocket = Socket & { user?: { role?: string; sub?: number } };

function canJoin(role: string | undefined, room: string): boolean {
  switch (room) {
    case 'kitchen': return role === 'Cocinero' || role === 'Admin';
    case 'cashier': return role === 'Cajero'   || role === 'Admin';
    case 'waiter':  return role === 'Mesero'   || role === 'Admin';
    case 'tables':  return true;
    default:        return false;
  }
}

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: env.cors.origins, methods: ['GET', 'POST'] },
    path: '/hubs/orders',
  });

  io.use((socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token ?? socket.handshake.query?.access_token as string;
      if (!token) return next(new Error('Token no proporcionado.'));
      const payload = verifyAccessToken(token as string);
      (socket as AuthSocket).user = payload;
      next();
    } catch {
      next(new Error('Token inválido.'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as AuthSocket).user;
    logger.info(`Socket conectado: ${socket.id} role=${user?.role}`);

    // Auto-join rooms by role
    if (user?.role === 'Cocinero') socket.join('kitchen');
    if (user?.role === 'Cajero')   socket.join('cashier');
    if (user?.role === 'Mesero')   socket.join('waiter');
    if (user?.role === 'Admin') {
      socket.join('kitchen');
      socket.join('cashier');
      socket.join('waiter');
    }
    socket.join('tables');
    // Sala personal para notificaciones dirigidas (ej. WaiterOrderReady)
    if (user?.sub) socket.join(`waiter:${user.sub}`);

    // Explicit join requests with role validation
    socket.on('join:kitchen', () => {
      if (canJoin(user?.role, 'kitchen')) socket.join('kitchen');
    });
    socket.on('join:cashier', () => {
      if (canJoin(user?.role, 'cashier')) socket.join('cashier');
    });
    socket.on('join:tables', () => socket.join('tables'));
    socket.on('join:waiter', () => {
      if (canJoin(user?.role, 'waiter')) socket.join('waiter');
    });

    socket.on('leave:kitchen', () => socket.leave('kitchen'));
    socket.on('leave:cashier', () => socket.leave('cashier'));
    socket.on('leave:tables',  () => socket.leave('tables'));
    socket.on('leave:waiter',  () => socket.leave('waiter'));

    socket.on('disconnect', () => logger.info(`Socket desconectado: ${socket.id}`));
  });

  return io;
}
