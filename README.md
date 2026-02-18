Backend (Express + MongoDB)

Overview
- Node.js + Express API for products, variants, reviews, cart, orders, users, and auth.
- MongoDB via Mongoose. Optional Cloudinary for image uploads.
- Rate-limited, CORS-enabled, cookie support, JWT auth.

Quick Start
1) Install
   - cd backendGroup7
   - npm install
2) Configure env (see below)
3) Run
   - Dev: npm run dev
   - Prod: npm start
4) API base URL (local): http://localhost:4000

Environment (.env)
Copy this sample and adjust for your environment.

PORT=4000
MONGO_URI=mongodb://localhost:27017/yourdb
MONGO_DBNAME=yourdb
JWT_SECRET=super-secret

# Comma-separated list of allowed frontend origins
CORS_ORIGINS=http://localhost:5173,https://your-frontend.vercel.app

# Optional: Cloudinary for image uploads
CLOUDINARY_CLOUD_NAME=your_cloud
CLOUDINARY_API_KEY=xxxxxxxx
CLOUDINARY_API_SECRET=xxxxxxxx

Scripts
- npm run dev: Start server with watch
- npm start: Start server
- npm run schema:validate, model:testdb: Local helper scripts
- npm run secret:admin: Generate admin secret helper

Key Routes (prefix /api/v1/mongo)
- Auth: /auth/register, /auth/login
- Users: /users/me
- Products: 
  - GET /products?q=&category=&minPrice=&maxPrice=&sort=&page=
  - GET /products/popular?limit=4&offset=0&minAvg=3
  - GET /products/:productId
  - Image upload (Cloudinary required):
    - POST /products/:productId/images  (multipart field: image)
    - DELETE /products/:productId/images/:publicId
  - Variants:
    - GET /products/:productId/variants
    - GET /products/:productId/variants/:variantId
    - POST /products/:productId/variants
    - PATCH /products/:productId/variants/:variantId
    - POST /products/:productId/variants/:variantId/images (multipart field: image)
    - PUT /products/:productId/variants/:variantId/images (replace)
    - DELETE /products/:productId/variants/:variantId/images
- Colors: /colors/:colorId
- Reviews:
  - GET /reviews/product/:productId
  - GET /reviews/me
  - POST /reviews { productId, name, rating, comment }
- Cart: /cart, /cart/items
- Orders: /orders

Popular Picks logic
- Aggregates avg rating from reviews collection and sorts by avg desc, count desc
- Respects query param minAvg (default 3)
- Response contains: _id, name, image, category, avgRating, reviewCount, minPrice, trial

CORS & Cookies
- CORS allowed origins built from CORS_ORIGINS + safe defaults
- Credentials (cookies) are enabled

Image Uploads
- Endpoints require Cloudinary env vars
- Validates image MIME/extension and size

Project Structure
- index.js: server bootstrap, middleware setup, CORS, error handler
- api/v1/routes.js: mounts v1 routes
- api/v1/mongo/controllers: product/review/cart/order logic
- models: Product, Reviews, User, Order, Cart
- middleware: rateLimiter, auth, roles, errorHandler
- rest/*.rest: example requests for REST Client

Notes
- If Mongo is not configured, API still starts but Mongo-backed routes will error on DB access. Set MONGO_URI to enable functionality.

# LivinLab_Backend
