CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  parent_id INT REFERENCES categories(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  category_id INT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','inactive')),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE variants (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE,
  option_values JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE skus (
  id SERIAL PRIMARY KEY,
  variant_id INT NOT NULL REFERENCES variants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  code VARCHAR(60) NOT NULL UNIQUE,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true
);
