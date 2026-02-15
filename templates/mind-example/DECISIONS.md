# Decision Log

## DEC-001: Use PostgreSQL over SQLite
- **Date:** 2025-01-28
- **Decided by:** team
- **Decision:** PostgreSQL for production database
- **Rationale:** Need concurrent writes from multiple API instances. SQLite is single-writer. Prisma ORM abstracts the difference, so switching cost is low if we ever revisit.
- **Status:** Final

## DEC-002: JWT over session cookies for auth
- **Date:** 2025-01-30
- **Decided by:** agent
- **Decision:** JWT access tokens (15min) + refresh tokens (7d) stored in httpOnly cookies
- **Rationale:** Stateless auth scales better for API-first architecture. Short-lived access tokens limit exposure window. Refresh rotation prevents token theft from being permanent.
- **Status:** Final

## DEC-003: Prisma over raw SQL
- **Date:** 2025-01-30
- **Decided by:** team
- **Decision:** Use Prisma ORM for all database access
- **Rationale:** Type-safe queries, auto-generated migrations, good TypeScript integration. Performance overhead acceptable for our scale (< 1000 req/sec target).
- **Status:** Final

## DEC-004: Custom rate limiter over express-rate-limit
- **Date:** 2025-02-10
- **Decided by:** agent
- **Decision:** Build custom rate limiter using sliding window counter in PostgreSQL
- **Rationale:** express-rate-limit uses in-memory storage by default (lost on restart). Redis would add a dependency. PostgreSQL-backed sliding window gives us persistence and per-user granularity without new infrastructure.
- **Status:** Final

## DEC-005: Email service provider
- **Date:** 2025-02-12
- **Decided by:** pending
- **Decision:** Evaluating SendGrid vs Resend
- **Rationale:** SendGrid is industry standard but complex setup. Resend has simpler API and React Email support. Need to evaluate deliverability and pricing for our volume (~500 emails/day).
- **Status:** Pending — need team input
