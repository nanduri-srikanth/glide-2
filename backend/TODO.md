# Glide Backend - TODO & Deferred Decisions

## Security Hardening (Post-MVP)

### Completed
- [x] **SECRET_KEY**: Using 64-byte cryptographically secure key
- [x] **Token Encryption**: Fernet encryption for Google/Apple integration credentials

### Deferred to Post-MVP
- [ ] **Rate Limiting**: Add rate limiting to protect against brute-force attacks
  - Recommended: `slowapi` with Redis for distributed rate limiting
  - Priority endpoints: `/auth/login`, `/auth/register`, `/auth/refresh`

- [ ] **CORS Hardening**: Review and restrict CORS for production
  - Currently allows multiple dev origins
  - Production should be restricted to actual app domains

---

## Dev Mode Settings

### Backend
- `.env` contains all secrets (gitignored)
- Debug mode enabled (`DEBUG=true`)

### Mobile App
Location: `/glide/app/_layout.tsx` and `/glide/context/AuthContext.tsx`

| Setting | Value | Purpose |
|---------|-------|---------|
| `DEV_SKIP_AUTH` | `true` | Skips redirect to login screen |
| `DEV_AUTO_LOGIN` | `true` | Auto-logs in with test user |
| `DEV_TEST_EMAIL` | `devtest@glide.app` | Test user email |
| `DEV_TEST_PASSWORD` | `devtest123` | Test user password |

**Before Production:** Set both `DEV_SKIP_AUTH` and `DEV_AUTO_LOGIN` to `false`.

---

## Test Users in Database

| Email | Password | Purpose |
|-------|----------|---------|
| `devtest@glide.app` | `devtest123` | Dev auto-login user |
| `test@example.com` | `TestPass123` | Manual testing |

---

## Infrastructure

### Current Setup
- **Database**: Supabase PostgreSQL (connected)
- **Storage**: Supabase Storage (`audio-files` bucket)
- **Backend**: Local development (`uvicorn` on port 8000)

### Production Deployment (Future)
- [ ] Deploy backend to Railway/Render
- [ ] Configure production environment variables
- [ ] Enable pgvector if semantic search needed
- [ ] Set up monitoring/logging
