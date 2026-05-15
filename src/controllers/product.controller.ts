import { Request, Response, NextFunction } from 'express';
import { ProductService } from '../services/product.service';
import { createCategorySchema, updateCategorySchema, createProductSchema, updateProductSchema } from '../validators/schemas';

export const ProductController = {
  // Categories
  getCategories: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await ProductService.getAllCategories()); } catch (e) { next(e); }
  },
  getCategoryById: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await ProductService.getCategoryById(+req.params['id']!)); } catch (e) { next(e); }
  },
  createCategory: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await ProductService.createCategory(createCategorySchema.parse(req.body))); } catch (e) { next(e); }
  },
  updateCategory: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await ProductService.updateCategory(+req.params['id']!, updateCategorySchema.parse(req.body))); } catch (e) { next(e); }
  },
  deleteCategory: async (req: Request, res: Response, next: NextFunction) => {
    try { await ProductService.deleteCategory(+req.params['id']!); res.status(204).send(); } catch (e) { next(e); }
  },

  // Products
  getProducts: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await ProductService.getAllProducts()); } catch (e) { next(e); }
  },
  getProductById: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await ProductService.getProductById(+req.params['id']!)); } catch (e) { next(e); }
  },
  getByCategory: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await ProductService.getProductsByCategory(+req.params['categoryId']!)); } catch (e) { next(e); }
  },
  createProduct: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await ProductService.createProduct(createProductSchema.parse(req.body) as Parameters<typeof ProductService.createProduct>[0])); } catch (e) { next(e); }
  },
  updateProduct: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await ProductService.updateProduct(+req.params['id']!, updateProductSchema.parse(req.body))); } catch (e) { next(e); }
  },
  deleteProduct: async (req: Request, res: Response, next: NextFunction) => {
    try { await ProductService.deleteProduct(+req.params['id']!); res.status(204).send(); } catch (e) { next(e); }
  },
  toggleAvailability: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await ProductService.toggleAvailability(+req.params['id']!)); } catch (e) { next(e); }
  },
};
