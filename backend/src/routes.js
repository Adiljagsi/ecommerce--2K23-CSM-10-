const express = require('express');
const pool = require('./db');
const { requireAdmin, sendError } = require('./auth');

const router = express.Router();
router.use(requireAdmin);

// Turns database errors into clear JSON errors (never a traceback).
function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err.code === '23505') {
        const isSku = (err.constraint || '').includes('skus');
        return sendError(res, 409, isSku ? 'DUPLICATE_SKU' : 'DUPLICATE_SLUG',
          isSku ? 'SKU code already exists' : 'Slug already exists');
      }
      if (err.code === '23503') {
        return sendError(res, 400, 'INVALID_REFERENCE', 'Referenced record does not exist');
      }
      if (err.code === '23514') {
        return sendError(res, 400, 'CONSTRAINT_VIOLATION', 'Value breaks a database rule');
      }
      console.error(err);
      return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error');
    }
  };
}

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isMoney = (v) => /^\d+(\.\d{1,2})?$/.test(String(v));
const isStock = (v) => Number.isInteger(v) && v >= 0;

// Builds and runs an UPDATE for only the allowed fields that were sent.
async function updateRow(table, id, body, allowed, hasUpdatedAt) {
  const sets = [];
  const values = [];
  allowed.forEach((col) => {
    if (body[col] !== undefined) {
      values.push(body[col]);
      sets.push(`${col} = $${values.length}`);
    }
  });
  if (sets.length === 0) return null;
  if (hasUpdatedAt) sets.push('updated_at = now()');
  values.push(id);
  const result = await pool.query(
    `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return result.rows[0] || undefined;
}

// ---------- Categories ----------

router.post('/categories', handle(async (req, res) => {
  const { name, slug, parent_id = null } = req.body;
  if (!isText(name) || !isText(slug)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'name and slug are required');
  }
  const r = await pool.query(
    'INSERT INTO categories (name, slug, parent_id) VALUES ($1, $2, $3) RETURNING *',
    [name, slug, parent_id]
  );
  res.status(201).json(r.rows[0]);
}));

router.get('/categories', handle(async (req, res) => {
  const r = await pool.query('SELECT * FROM categories ORDER BY id');
  const byId = {};
  r.rows.forEach((c) => { byId[c.id] = { ...c, children: [] }; });
  const roots = [];
  r.rows.forEach((c) => {
    if (c.parent_id && byId[c.parent_id]) byId[c.parent_id].children.push(byId[c.id]);
    else roots.push(byId[c.id]);
  });
  res.json({ data: roots });
}));

router.patch('/categories/:id', handle(async (req, res) => {
  const id = Number(req.params.id);
  const { parent_id, is_active } = req.body;

  // Cycle check: the new parent must not be this category or one of its descendants.
  if (parent_id !== undefined && parent_id !== null) {
    const cycle = await pool.query(
      `WITH RECURSIVE up AS (
         SELECT id, parent_id FROM categories WHERE id = $1
         UNION ALL
         SELECT c.id, c.parent_id FROM categories c JOIN up ON c.id = up.parent_id
       ) SELECT 1 FROM up WHERE id = $2`,
      [parent_id, id]
    );
    if (cycle.rowCount > 0) {
      return sendError(res, 400, 'CATEGORY_CYCLE', 'A category cannot become its own ancestor');
    }
  }

  const row = await updateRow('categories', id, req.body,
    ['name', 'slug', 'parent_id', 'is_active'], true);
  if (row === null) return sendError(res, 400, 'VALIDATION_ERROR', 'No fields to update');
  if (row === undefined) return sendError(res, 404, 'NOT_FOUND', 'Category not found');

  // Deactivating a parent also deactivates all its descendants.
  if (is_active === false) {
    await pool.query(
      `WITH RECURSIVE down AS (
         SELECT id FROM categories WHERE parent_id = $1
         UNION ALL
         SELECT c.id FROM categories c JOIN down ON c.parent_id = down.id
       ) UPDATE categories SET is_active = false WHERE id IN (SELECT id FROM down)`,
      [id]
    );
  }
  res.json(row);
}));

// ---------- Products ----------

router.post('/products', handle(async (req, res) => {
  const { name, slug, description = null, category_id } = req.body;
  if (!isText(name) || !isText(slug) || !Number.isInteger(category_id)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'name, slug and category_id are required');
  }
  const r = await pool.query(
    `INSERT INTO products (name, slug, description, category_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, slug, description, category_id]
  );
  res.status(201).json(r.rows[0]);
}));

router.get('/products', handle(async (req, res) => {
  const r = await pool.query('SELECT * FROM products ORDER BY id');
  res.json({ data: r.rows });
}));

router.patch('/products/:id', handle(async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (status !== undefined && !['draft', 'active', 'inactive'].includes(status)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'status must be draft, active or inactive');
  }
  // A product can only become active if it has at least one active SKU.
  if (status === 'active') {
    const s = await pool.query(
      `SELECT 1 FROM skus s JOIN variants v ON v.id = s.variant_id
       WHERE v.product_id = $1 AND s.is_active = true LIMIT 1`,
      [id]
    );
    if (s.rowCount === 0) {
      return sendError(res, 400, 'NO_ACTIVE_SKU', 'Product needs at least one active SKU to be active');
    }
  }
  const row = await updateRow('products', id, req.body,
    ['name', 'slug', 'description', 'status', 'category_id'], true);
  if (row === null) return sendError(res, 400, 'VALIDATION_ERROR', 'No fields to update');
  if (row === undefined) return sendError(res, 404, 'NOT_FOUND', 'Product not found');
  res.json(row);
}));

// ---------- Variants ----------

router.post('/products/:id/variants', handle(async (req, res) => {
  const id = Number(req.params.id);
  const { option_values = {} } = req.body;
  const p = await pool.query('SELECT 1 FROM products WHERE id = $1', [id]);
  if (p.rowCount === 0) return sendError(res, 404, 'NOT_FOUND', 'Product not found');
  const r = await pool.query(
    'INSERT INTO variants (product_id, option_values) VALUES ($1, $2) RETURNING *',
    [id, JSON.stringify(option_values)]
  );
  res.status(201).json(r.rows[0]);
}));

// ---------- SKUs ----------

router.post('/products/:id/skus', handle(async (req, res) => {
  const id = Number(req.params.id);
  const { variant_id, code, price, stock_quantity = 0 } = req.body;
  if (!Number.isInteger(variant_id) || !isText(code) || !isMoney(price)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'variant_id, code and a valid price are required');
  }
  if (!isStock(stock_quantity)) {
    return sendError(res, 400, 'INVALID_STOCK', 'Stock quantity cannot be negative');
  }
  const v = await pool.query(
    'SELECT 1 FROM variants WHERE id = $1 AND product_id = $2', [variant_id, id]
  );
  if (v.rowCount === 0) {
    return sendError(res, 404, 'NOT_FOUND', 'Variant not found for this product');
  }
  const r = await pool.query(
    `INSERT INTO skus (variant_id, code, price, stock_quantity)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [variant_id, code, price, stock_quantity]
  );
  res.status(201).json(r.rows[0]);
}));

router.patch('/skus/:id', handle(async (req, res) => {
  const id = Number(req.params.id);
  const { price, stock_quantity } = req.body;
  if (stock_quantity !== undefined && !isStock(stock_quantity)) {
    return sendError(res, 400, 'INVALID_STOCK', 'Stock quantity cannot be negative');
  }
  if (price !== undefined && !isMoney(price)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'price must be 0 or more with up to 2 decimals');
  }
  const row = await updateRow('skus', id, req.body,
    ['price', 'stock_quantity', 'is_active'], false);
  if (row === null) return sendError(res, 400, 'VALIDATION_ERROR', 'No fields to update');
  if (row === undefined) return sendError(res, 404, 'NOT_FOUND', 'SKU not found');
  res.json(row);
}));

module.exports = router;
