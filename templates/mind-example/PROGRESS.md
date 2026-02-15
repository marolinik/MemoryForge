# Progress Tracker

### Completed
- [x] Project scaffolding (Express + TypeScript + Prisma) (completed 2025-01-28)
- [x] Database schema design — users, sessions, api_keys tables (completed 2025-01-30)
- [x] Prisma migrations + seed script (completed 2025-01-31)
- [x] Auth module — signup, login, logout, JWT issuance (completed 2025-02-05)
- [x] Password hashing with argon2 (completed 2025-02-05)
- [x] Session middleware + auth guards (completed 2025-02-07)
- [x] Input validation layer with Zod schemas (completed 2025-02-08)
- [x] Error handling middleware + structured error responses (completed 2025-02-09)

### In Progress
- [ ] POST /api/users — create user with validation
- [ ] GET /api/users/:id — fetch user profile
- [ ] PATCH /api/users/:id — update user fields
- [ ] DELETE /api/users/:id — soft delete
- [ ] JWT refresh token rotation (access + refresh pair)
- [ ] Rate limiting middleware

### Blocked
- [ ] Stripe webhook handler (waiting on test API keys)
- [ ] Email verification flow (email provider decision pending — DEC-005)

### Not Started
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Integration tests for all endpoints
- [ ] Frontend API client generation from OpenAPI spec
- [ ] Deployment pipeline (Docker + fly.io)
- [ ] Monitoring + alerting setup
