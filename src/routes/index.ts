import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { AuthController } from '../controllers/auth.controller';
import { ProductController } from '../controllers/product.controller';
import { TableController } from '../controllers/table.controller';
import { OrderController } from '../controllers/order.controller';
import { PaymentController } from '../controllers/payment.controller';
import { CashRegisterController } from '../controllers/cashregister.controller';
import { ReservationController } from '../controllers/reservation.controller';
import { InvoiceController } from '../controllers/invoice.controller';
import { ReportController } from '../controllers/report.controller';

const router = Router();

// ── Auth ──────────────────────────────────────────────────────
router.post('/auth/login',   AuthController.login);
router.post('/auth/refresh', AuthController.refresh);
router.post('/auth/logout',  authenticate, AuthController.logout);
router.get('/auth/me',       authenticate, AuthController.me);

// ── Users (Admin only) ────────────────────────────────────────
router.get('/users',                     authenticate, authorize('Admin'), AuthController.getAll);
router.get('/users/:id',                 authenticate, authorize('Admin'), AuthController.getById);
router.post('/users',                    authenticate, authorize('Admin'), AuthController.create);
router.put('/users/:id',                 authenticate, authorize('Admin'), AuthController.update);
router.patch('/users/:id/reset-password',authenticate, authorize('Admin'), AuthController.resetPassword);
router.patch('/users/:id/toggle-status', authenticate, authorize('Admin'), AuthController.toggleStatus);

// ── Categories ────────────────────────────────────────────────
router.get('/categories',        authenticate, ProductController.getCategories);
router.get('/categories/:id',    authenticate, ProductController.getCategoryById);
router.post('/categories',       authenticate, authorize('Admin'), ProductController.createCategory);
router.put('/categories/:id',    authenticate, authorize('Admin'), ProductController.updateCategory);
router.delete('/categories/:id', authenticate, authorize('Admin'), ProductController.deleteCategory);

// ── Products ──────────────────────────────────────────────────
router.get('/products',                       authenticate, ProductController.getProducts);
router.get('/products/:id',                   authenticate, ProductController.getProductById);
router.get('/products/category/:categoryId',  authenticate, ProductController.getByCategory);
router.post('/products',                      authenticate, authorize('Admin'), ProductController.createProduct);
router.put('/products/:id',                   authenticate, authorize('Admin'), ProductController.updateProduct);
router.delete('/products/:id',                authenticate, authorize('Admin'), ProductController.deleteProduct);
router.patch('/products/:id/toggle-availability', authenticate, authorize('Admin', 'Cajero'), ProductController.toggleAvailability);

// ── Tables ────────────────────────────────────────────────────
router.get('/tables/zones',          authenticate, TableController.getZonesWithTables);
router.get('/tables/zones/list',     authenticate, TableController.getZones);
router.post('/tables/zones',         authenticate, authorize('Admin'), TableController.createZone);
router.get('/tables',                authenticate, TableController.getTables);
router.get('/tables/:id',            authenticate, TableController.getTableById);
router.post('/tables',               authenticate, authorize('Admin'), TableController.createTable);
router.put('/tables/:id',            authenticate, authorize('Admin'), TableController.updateTable);
router.patch('/tables/:id/status',   authenticate, TableController.updateStatus);
router.delete('/tables/:id',         authenticate, authorize('Admin'), TableController.deleteTable);

// ── Orders ────────────────────────────────────────────────────
router.get('/orders',                             authenticate, OrderController.getAll);
router.get('/orders/active',                      authenticate, OrderController.getActive);
router.get('/orders/kitchen',                     authenticate, authorize('Admin', 'Cocinero'), OrderController.getKitchen);
router.get('/orders/table/:tableId',              authenticate, OrderController.getByTable);
router.get('/orders/:id',                         authenticate, OrderController.getById);
router.post('/orders',                            authenticate, authorize('Admin', 'Mesero'), OrderController.create);
router.put('/orders/:id',                         authenticate, OrderController.update);
router.patch('/orders/:id/status',                authenticate, authorize('Admin'), OrderController.updateStatus);
router.post('/orders/:id/send-to-kitchen',        authenticate, authorize('Admin', 'Mesero'), OrderController.sendToKitchen);
router.post('/orders/:id/cancel',                 authenticate, authorize('Admin', 'Cajero'), OrderController.cancel);
router.post('/orders/:id/items',                  authenticate, authorize('Admin', 'Mesero'), OrderController.addItem);
router.delete('/orders/:id/items/:itemId',        authenticate, authorize('Admin', 'Mesero'), OrderController.removeItem);
router.patch('/orders/:id/items/:itemId/ready',   authenticate, authorize('Admin', 'Cocinero'), OrderController.markItemReady);

// ── Payments ──────────────────────────────────────────────────
router.get('/payments/methods',       authenticate, PaymentController.getMethods);
router.get('/payments/order/:orderId',authenticate, PaymentController.getByOrder);
router.post('/payments',              authenticate, authorize('Admin', 'Cajero'), PaymentController.process);

// ── Cash Register ─────────────────────────────────────────────
router.get('/cash-registers',          authenticate, CashRegisterController.getAll);
router.get('/cash-registers/my-session', authenticate, CashRegisterController.getMySession);
router.get('/cash-registers/history',  authenticate, authorize('Admin'), CashRegisterController.getHistory);
router.get('/cash-registers/sessions/:id', authenticate, CashRegisterController.getSessionById);
router.post('/cash-registers/open',    authenticate, authorize('Admin', 'Cajero'), CashRegisterController.openSession);
router.post('/cash-registers/sessions/:id/close', authenticate, authorize('Admin', 'Cajero'), CashRegisterController.closeSession);

// ── Reservations ──────────────────────────────────────────────
router.get('/reservations',              authenticate, ReservationController.getAll);
router.get('/reservations/table/:tableId', authenticate, ReservationController.getByTable);
router.get('/reservations/:id',          authenticate, ReservationController.getById);
router.post('/reservations',             authenticate, authorize('Admin', 'Cajero', 'Mesero'), ReservationController.create);
router.put('/reservations/:id',          authenticate, authorize('Admin', 'Cajero', 'Mesero'), ReservationController.update);
router.patch('/reservations/:id/status', authenticate, authorize('Admin', 'Cajero'), ReservationController.updateStatus);
router.delete('/reservations/:id',       authenticate, authorize('Admin'), ReservationController.delete);

// ── Invoices ──────────────────────────────────────────────────
router.get('/invoices',              authenticate, InvoiceController.getAll);
router.get('/invoices/order/:orderId', authenticate, InvoiceController.getByOrder);
router.get('/invoices/:id',          authenticate, InvoiceController.getById);
router.post('/invoices',             authenticate, authorize('Admin', 'Cajero'), InvoiceController.generate);
router.patch('/invoices/:id/void',   authenticate, authorize('Admin'), InvoiceController.void);

// ── Reports ───────────────────────────────────────────────────
router.get('/reports/sales',        authenticate, authorize('Admin'), ReportController.getSalesReport);
router.get('/reports/today',        authenticate, authorize('Admin', 'Cajero'), ReportController.getToday);
router.get('/reports/top-products', authenticate, authorize('Admin'), ReportController.getTopProducts);

export default router;
