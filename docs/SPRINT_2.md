# Sprint 2: Catalog Data Foundation

## 1. Sprint Goal and Scope Boundary
Goal: build the database foundation for the catalog so that categories, products, variants and SKUs are stored without losing identity, relationships, price or stock meaning.

In scope: category tree, products, variants, SKUs, basic admin CRUD, database constraints, migrations, seed data, tests.

Out of scope (Sprint 3 or later): dynamic specifications, asset upload, public search, publication workflows, payments, orders, shipping, full checkout.

## 2. Link to Sprint 1
This sprint reuses the Sprint 1 stack (React, Node.js with Express, PostgreSQL) and extends the Sprint 1 ERD. See [SPRINT_1.md](SPRINT_1.md).

## 3. ERD and Data Dictionary
```mermaid
erDiagram
    CATEGORIES ||--o{ CATEGORIES : "parent of"
    CATEGORIES ||--o{ PRODUCTS : contains
    PRODUCTS ||--o{ VARIANTS : has
    VARIANTS ||--o{ SKUS : materializes
    PRODUCTS ||--o{ ASSETS : displays
    USERS ||--o{ CARTS : owns
    CARTS ||--o{ CART_ITEMS : contains
    SKUS ||--o{ CART_ITEMS : selected_as
    USERS ||--o{ ORDERS : places
    ORDERS ||--o{ ORDER_ITEMS : contains
    SKUS ||--o{ ORDER_ITEMS : sold_as

    CATEGORIES {
        int id PK
        int parent_id FK
        varchar name
        varchar slug UK
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }
    PRODUCTS {
        int id PK
        int category_id FK
        varchar name
        varchar slug UK
        text description
        varchar status
        timestamp created_at
        timestamp updated_at
    }
    VARIANTS {
        int id PK
        int product_id FK
        jsonb option_values
    }
    SKUS {
        int id PK
        int variant_id FK
        varchar code UK
        numeric price
        int stock_quantity
        boolean is_active
    }
    ASSETS {
        int id PK
        int product_id FK
        varchar storage_key
        varchar role
        varchar alt_text
        int sort_order
    }
    USERS {
        int id PK
    }
    CARTS {
        int id PK
        int user_id FK
    }
    CART_ITEMS {
        int id PK
        int cart_id FK
        int sku_id FK
        int quantity
    }
    ORDERS {
        int id PK
        int user_id FK
    }
    ORDER_ITEMS {
        int id PK
        int order_id FK
        int sku_id FK
        int quantity
        numeric unit_price
    }
```
### Data Dictionary

| Table | Column | Type | Rule |
|---|---|---|---|
| categories | id | SERIAL | Primary key |
| categories | parent_id | INT | Optional FK to categories(id), ON DELETE RESTRICT; cannot equal id or become its own ancestor |
| categories | name | VARCHAR(120) | Required |
| categories | slug | VARCHAR(140) | Required, UNIQUE |
| categories | is_active | BOOLEAN | Default true |
| products | id | SERIAL | Primary key |
| products | category_id | INT | Required FK to categories(id), ON DELETE RESTRICT |
| products | name | VARCHAR(200) | Required |
| products | slug | VARCHAR(220) | Required, UNIQUE |
| products | description | TEXT | Optional |
| products | status | VARCHAR(20) | draft, active or inactive; default draft |
| variants | id | SERIAL | Primary key |
| variants | product_id | INT | Required FK to products(id), ON DELETE CASCADE |
| variants | option_values | JSONB | Example: {"size":"M","color":"Blue"} |
| skus | id | SERIAL | Primary key |
| skus | variant_id | INT | Required FK to variants(id), ON DELETE CASCADE |
| skus | code | VARCHAR(60) | Required, UNIQUE |
| skus | price | NUMERIC(10,2) | Required, CHECK price >= 0 (no floating-point money) |
| skus | stock_quantity | INT | Default 0, CHECK stock_quantity >= 0 |
| skus | is_active | BOOLEAN | Default true |

### Relationship Cardinality

- One category has many products (1:N); a category can also have many child categories (1:N).
- One product has many variants (1:N).
- One variant has many SKUs (1:N).
- One product has many assets (1:N).
- One SKU appears in many cart items and order items (1:N), so Sprint 3 links to SKU identity, not to product pricing.
## 4. Administration Routes
All routes are under /api/v1/admin and require the header `Authorization: Bearer <token>` of an administrator. No token returns 401. A non-admin token returns 403.

| Method | Route | Purpose | Success | Errors |
|---|---|---|---|---|
| POST | /api/v1/admin/categories | Create a category | 201 | 400, 401, 403, 409 |
| GET | /api/v1/admin/categories | Return the category tree | 200 | 401, 403 |
| POST | /api/v1/admin/products | Create a draft product | 201 | 400, 401, 403, 409 |
| PATCH | /api/v1/admin/products/:id | Update product content or status | 200 | 400, 401, 403, 404, 409 |
| GET | /api/v1/admin/products | List products (admin view) | 200 | 401, 403 |
| POST | /api/v1/admin/products/:id/skus | Add a SKU to a product | 201 | 400, 401, 403, 404, 409 |
| PATCH | /api/v1/admin/skus/:id | Update price, stock or active status | 200 | 400, 401, 403, 404 |

### Error format (same for every route)

{ "error": { "code": "DUPLICATE_SLUG", "message": "A product with this slug already exists" } }

### Example 1: Create a category

Request:

POST /api/v1/admin/categories
{ "name": "Clothing", "slug": "clothing", "parent_id": null }

Response 201:

{ "id": 1, "name": "Clothing", "slug": "clothing", "parent_id": null, "is_active": true }

### Example 2: Create a product

Request fields: name (required), slug (required, unique), description (optional), category_id (required).

POST /api/v1/admin/products
{ "name": "Blue Polo Shirt", "slug": "blue-polo-shirt", "description": "Cotton polo", "category_id": 2 }

Response 201:

{ "id": 1, "name": "Blue Polo Shirt", "slug": "blue-polo-shirt", "status": "draft", "category_id": 2 }

### Example 3: Add a SKU

Request fields: variant_id (required), code (required, unique), price (required, 0 or more), stock_quantity (0 or more).

POST /api/v1/admin/products/1/skus
{ "variant_id": 1, "code": "POLO-BLU-M", "price": "1500.00", "stock_quantity": 10 }

Response 201:

{ "id": 1, "variant_id": 1, "code": "POLO-BLU-M", "price": "1500.00", "stock_quantity": 10, "is_active": true }

### Example 4: Duplicate SKU rejected

Response 409:

{ "error": { "code": "DUPLICATE_SKU", "message": "SKU code already exists" } }

### Example 5: Negative stock rejected

PATCH /api/v1/admin/skus/1
{ "stock_quantity": -5 }

Response 400:

{ "error": { "code": "INVALID_STOCK", "message": "Stock quantity cannot be negative" } }
### Request fields and response shapes for the remaining routes

| Route | Request fields | Response shape |
|---|---|---|
| PATCH /products/:id | name, slug, description, status (draft, active or inactive), category_id. All optional. | 200: the updated product object |
| GET /products | none | 200: { "data": [ product objects ] } |
| GET /categories | none | 200: { "data": [ category objects, each with a "children" list ] } |
| PATCH /skus/:id | price (0 or more), stock_quantity (0 or more), is_active. All optional. | 200: the updated SKU object |

Validation errors: 400 for a missing or invalid field, 409 for a duplicate slug or SKU code, 404 when the id does not exist.
## 5. Data Integrity and Authorization Decisions
(to be added)

## 6. Seed Data and Demonstration
(to be added)

## 7. Test Strategy, Command and Result
(to be added)

## 8. Known Limitations and Sprint 3 Backlog
(to be added)
