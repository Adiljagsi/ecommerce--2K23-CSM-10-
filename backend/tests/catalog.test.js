require('dotenv').config();

// Safety: tests wipe the tables, so they only run on a separate test database.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to a separate test database before running tests');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/server');
const pool = require('../src/db');

const adminAuth = 'Bearer ' + jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);
const userAuth = 'Bearer ' + jwt.sign({ id: 2, role: 'user' }, process.env.JWT_SECRET);
const base = '/api/v1/admin';

const post = (path, body) => request(app).post(base + path).set('Authorization', adminAuth).send(body);
const patch = (path, body) => request(app).patch(base + path).set('Authorization', adminAuth).send(body);

async function makeCategory(slug = 'clothing', parent_id = null) {
  return (await post('/categories', { name: slug, slug, parent_id })).body;
}
async function makeProduct(slug = 'polo', category_id) {
  return (await post('/products', { name: 'Polo', slug, category_id })).body;
}
async function makeVariant(product_id, option_values = { size: 'M' }) {
  return (await post(`/products/${product_id}/variants`, { option_values })).body;
}

beforeEach(async () => {
  await pool.query('TRUNCATE skus, variants, products, categories RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await pool.end();
});

describe('Product creation', () => {
  test('creates a draft product with required fields', async () => {
    const cat = await makeCategory();
    const res = await post('/products', { name: 'Polo', slug: 'polo', category_id: cat.id });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
  });

  test('rejects a product with no name', async () => {
    const cat = await makeCategory();
    const res = await post('/products', { slug: 'polo', category_id: cat.id });
    expect(res.status).toBe(400);
  });

  test('a draft product with no SKU cannot become active', async () => {
    const cat = await makeCategory();
    const product = await makeProduct('polo', cat.id);
    const res = await patch(`/products/${product.id}`, { status: 'active' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_ACTIVE_SKU');
  });
});

describe('SKU creation', () => {
  test('creates a SKU with code, price and stock', async () => {
    const cat = await makeCategory();
    const product = await makeProduct('polo', cat.id);
    const variant = await makeVariant(product.id);
    const res = await post(`/products/${product.id}/skus`, {
      variant_id: variant.id, code: 'POLO-M', price: '1500.00', stock_quantity: 10,
    });
    expect(res.status).toBe(201);
    expect(res.body.price).toBe('1500.00');
  });

  test('rejects a SKU with no price', async () => {
    const cat = await makeCategory();
    const product = await makeProduct('polo', cat.id);
    const variant = await makeVariant(product.id);
    const res = await post(`/products/${product.id}/skus`, {
      variant_id: variant.id, code: 'POLO-M',
    });
    expect(res.status).toBe(400);
  });

  test('rejects a negative price', async () => {
    const cat = await makeCategory();
    const product = await makeProduct('polo', cat.id);
    const variant = await makeVariant(product.id);
    const res = await post(`/products/${product.id}/skus`, {
      variant_id: variant.id, code: 'POLO-M', price: '-5.00',
    });
    expect(res.status).toBe(400);
  });
});

describe('Duplicates', () => {
  test('rejects a duplicate product slug with 409', async () => {
    const cat = await makeCategory();
    await makeProduct('polo', cat.id);
    const res = await post('/products', { name: 'Other', slug: 'polo', category_id: cat.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_SLUG');
  });

  test('rejects a duplicate SKU code with 409', async () => {
    const cat = await makeCategory();
    const product = await makeProduct('polo', cat.id);
    const v1 = await makeVariant(product.id, { size: 'M' });
    const v2 = await makeVariant(product.id, { size: 'L' });
    await post(`/products/${product.id}/skus`, { variant_id: v1.id, code: 'SAME', price: '10.00' });
    const res = await post(`/products/${product.id}/skus`, { variant_id: v2.id, code: 'SAME', price: '10.00' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_SKU');
  });
});

describe('Category hierarchy', () => {
  test('creates a child category under a parent', async () => {
    const parent = await makeCategory('clothing');
    const res = await post('/categories', { name: 'T-Shirts', slug: 't-shirts', parent_id: parent.id });
    expect(res.status).toBe(201);
    expect(res.body.parent_id).toBe(parent.id);
  });

  test('rejects a category being its own parent', async () => {
    const cat = await makeCategory('clothing');
    const res = await patch(`/categories/${cat.id}`, { parent_id: cat.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CATEGORY_CYCLE');
  });

  test('rejects a longer cycle (parent becomes child of its own child)', async () => {
    const a = await makeCategory('a');
    const b = await makeCategory('b', a.id);
    const res = await patch(`/categories/${a.id}`, { parent_id: b.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CATEGORY_CYCLE');
  });

  test('deactivating a parent deactivates its children', async () => {
    const parent = await makeCategory('clothing');
    const child = await makeCategory('t-shirts', parent.id);
    await patch(`/categories/${parent.id}`, { is_active: false });
    const r = await pool.query('SELECT is_active FROM categories WHERE id = $1', [child.id]);
    expect(r.rows[0].is_active).toBe(false);
  });
});

describe('Stock rules', () => {
  async function makeSku() {
    const cat = await makeCategory();
    const product = await makeProduct('polo', cat.id);
    const variant = await makeVariant(product.id);
    return (await post(`/products/${product.id}/skus`, {
      variant_id: variant.id, code: 'POLO-M', price: '1500.00', stock_quantity: 10,
    })).body;
  }

  test('accepts stock of 0', async () => {
    const sku = await makeSku();
    const res = await patch(`/skus/${sku.id}`, { stock_quantity: 0 });
    expect(res.status).toBe(200);
    expect(res.body.stock_quantity).toBe(0);
  });

  test('rejects negative stock', async () => {
    const sku = await makeSku();
    const res = await patch(`/skus/${sku.id}`, { stock_quantity: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_STOCK');
  });

  test('the database itself also blocks negative stock', async () => {
    const sku = await makeSku();
    await expect(
      pool.query('UPDATE skus SET stock_quantity = -1 WHERE id = $1', [sku.id])
    ).rejects.toThrow();
  });
});

describe('Variant and SKU combinations', () => {
  test('creating a variant does not create a fake SKU', async () => {
    const cat = await makeCategory();
    const product = await makeProduct('polo', cat.id);
    await makeVariant(product.id, { size: 'XL' });
    const r = await pool.query('SELECT count(*)::int AS n FROM skus');
    expect(r.rows[0].n).toBe(0);
  });

  test('rejects a SKU whose variant belongs to another product', async () => {
    const cat = await makeCategory();
    const p1 = await makeProduct('polo', cat.id);
    const p2 = await makeProduct('mug', cat.id);
    const variantOfP2 = await makeVariant(p2.id);
    const res = await post(`/products/${p1.id}/skus`, {
      variant_id: variantOfP2.id, code: 'X', price: '10.00',
    });
    expect(res.status).toBe(404);
  });
});

describe('Authorization', () => {
  test('rejects a request with no token (401)', async () => {
    const res = await request(app).get(base + '/products');
    expect(res.status).toBe(401);
  });

  test('rejects a non-admin token (403)', async () => {
    const res = await request(app).get(base + '/products').set('Authorization', userAuth);
    expect(res.status).toBe(403);
  });

  test('rejects an unauthenticated write (401)', async () => {
    const res = await request(app).post(base + '/categories').send({ name: 'X', slug: 'x' });
    expect(res.status).toBe(401);
  });

  test('allows an admin token', async () => {
    const res = await request(app).get(base + '/products').set('Authorization', adminAuth);
    expect(res.status).toBe(200);
  });
});
