require('dotenv').config();
const jwt = require('jsonwebtoken');
const pool = require('../src/db');

async function seed() {
  // Clear the catalog tables so the same data is created every time.
  await pool.query(
    'TRUNCATE skus, variants, products, categories RESTART IDENTITY CASCADE'
  );

  // Categories (2 levels): Clothing > T-Shirts, and Accessories
  await pool.query(`
    INSERT INTO categories (name, slug, parent_id) VALUES
      ('Clothing', 'clothing', NULL),
      ('T-Shirts', 't-shirts', 1),
      ('Accessories', 'accessories', NULL)
  `);

  // Products (3)
  await pool.query(`
    INSERT INTO products (name, slug, description, category_id, status) VALUES
      ('Blue Polo Shirt', 'blue-polo-shirt', 'Cotton polo shirt', 2, 'active'),
      ('Handmade Leather Wallet', 'handmade-leather-wallet', 'Hand-stitched leather wallet', 3, 'active'),
      ('Ceramic Mug', 'ceramic-mug', 'Hand-glazed ceramic mug', 3, 'active')
  `);

  // Variants: the polo has 3 sizes (M, L, XL); the others have one default variant.
  await pool.query(`
    INSERT INTO variants (product_id, option_values) VALUES
      (1, '{"size":"M"}'),
      (1, '{"size":"L"}'),
      (1, '{"size":"XL"}'),
      (2, '{"option":"default"}'),
      (3, '{"option":"default"}')
  `);

  // SKUs (4). The XL variant (id 3) intentionally has NO SKU:
  // a missing combination is not created as a fake zero-stock SKU.
  await pool.query(`
    INSERT INTO skus (variant_id, code, price, stock_quantity) VALUES
      (1, 'POLO-BLU-M', 1500.00, 10),
      (2, 'POLO-BLU-L', 1500.00, 5),
      (4, 'WALLET-BRN', 2200.00, 8),
      (5, 'MUG-WHT', 800.00, 20)
  `);

  console.log('Seed complete: 3 categories, 3 products, 5 variants, 4 SKUs.');

  // Demo admin token (only if JWT_SECRET is set). Do not share or commit it.
  if (process.env.JWT_SECRET) {
    const token = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1d' });
    console.log('Demo admin token:', token);
  }
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
