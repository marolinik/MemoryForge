# Session Log

## Session 1 — 2025-02-05 14:30:00
- **Summary:** Built the complete auth module — signup, login, logout with JWT tokens. Password hashing with argon2. Session middleware with auth guards for protected routes.
- **Completed:** Auth signup endpoint, Auth login endpoint, Auth logout endpoint, JWT token issuance, Password hashing, Session middleware
- **Decisions:** DEC-002 (JWT over sessions)
- **Next session:** Input validation layer, then start API endpoints

## Session 2 — 2025-02-08 10:15:00
- **Summary:** Added Zod validation schemas for all request bodies. Built error handling middleware with structured JSON error responses. Started planning the user CRUD endpoints.
- **Completed:** Zod validation schemas, Error handling middleware, Structured error responses
- **Next session:** Build /api/users CRUD endpoints

## Session 3 — 2025-02-10 16:00:00
- **Summary:** Evaluated rate limiting approaches. Decided against express-rate-limit (in-memory, lost on restart) in favor of custom PostgreSQL-backed sliding window counter. Designed the rate_limits table schema and wrote the Prisma migration.
- **Completed:** Rate limiter research, rate_limits schema design, Prisma migration
- **Decisions:** DEC-004 (Custom rate limiter)
- **Blockers:** Stripe test API keys still not received
- **Next session:** Implement the rate limiting middleware, then continue user CRUD endpoints
