# MOLAB Cloud — International Mathematical Oncology Platform

A backend + web app for hospitals worldwide to register, get admin-approved,
register de-identified oncology patients, and run five published tumor-growth
models against each patient's serial measurements to get a consensus
prognosis (risk band, doubling time, projected volume).

This is a real, runnable full-stack app: Node/Express API, SQLite database,
bcrypt password hashing, JWT session cookies, real SMTP email verification,
and a hidden admin panel. It is **launch-ready for a pilot**, not a
turnkey replacement for a hospital-grade, regulator-approved system — see
"Before you use this with real patients" at the bottom.

---

## 1. Project layout

```
molab-cloud/
├── src/
│   ├── server.js            # entry point
│   ├── app.js                # Express app, route mounting, hidden admin mount
│   ├── config/env.js         # loads and validates .env
│   ├── db/
│   │   ├── schema.sql        # SQLite schema
│   │   └── index.js          # DB connection + auto-migration on boot
│   ├── middleware/
│   │   ├── auth.js           # session reading, hospital/admin guards
│   │   ├── rateLimit.js       # brute-force protection
│   │   └── errorHandler.js
│   ├── services/
│   │   ├── emailService.js   # SMTP (or console/log fallback in dev)
│   │   ├── tokenService.js   # JWT + opaque token helpers
│   │   └── modelEngine.js    # RK4 + Nelder–Mead, 5 growth models (server-side!)
│   ├── controllers/          # request handlers
│   └── routes/                # route wiring
├── public/                    # the public + hospital website (static, vanilla JS)
│   ├── index.html             # landing page + live stats
│   ├── signup.html / login.html / verify.html
│   ├── dashboard.html         # hospital rep app (patients, simulator, models)
│   └── js/ , css/
├── adminPanel/                 # admin UI — NEVER linked from public/, served
│   │                            dynamically only at the secret admin path
│   ├── index.html
│   └── assets/ (admin.js, admin.css)
├── scripts/
│   ├── createAdmin.js          # the ONLY way to create an admin account (CLI)
│   └── migrate.js
├── data/                        # SQLite database file lives here (gitignored)
├── .env.example
├── package.json
├── Dockerfile
└── docker-compose.yml
```

## 2. Quick start (local)

```bash
cd molab-cloud
npm install
cp .env.example .env
# edit .env — at minimum set JWT_SECRET and ADMIN_ROUTE_SECRET (see below)

npm run create-admin -- admin@yourorg.com "a-strong-password-here"

npm start
# → MOLAB Cloud backend listening on port 4000
```

Open `http://localhost:4000` — that's the public site. Register a hospital,
check `data/dev-emails.log` (or your terminal) for the verification link
since SMTP isn't configured yet, click it, log in. The hospital will show as
"pending" until an admin approves it from the admin panel.

## 3. Generating secrets

```bash
# JWT signing secret
openssl rand -hex 32

# Admin panel URL path (put the output straight into ADMIN_ROUTE_SECRET)
openssl rand -hex 12

# Optional second-factor header value
openssl rand -hex 16
```

## 4. Email verification

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` in
`.env` to any SMTP provider (SendGrid, Mailgun, Amazon SES, Postmark, Gmail
SMTP with an app password, etc.). Until you do, the server does **not** fail
silently — it logs the verification link to the console and appends it to
`data/dev-emails.log` so you can test the full flow locally. That fallback is
fine for development; real deployments must configure real SMTP.

## 5. How hospital accounts work

1. `POST /api/auth/register` — creates the hospital record with
   `status = 'pending'` and `email_verified = 0`, and emails a verification
   link (bcrypt-hashed password, never stored in plain text).
2. The rep clicks the link → `GET /api/auth/verify-email` → `email_verified = 1`.
3. The rep can now log in (`POST /api/auth/login`), which sets an **httpOnly,
   sameSite=lax** session cookie (JWT). The frontend never touches the raw
   token.
4. The hospital still shows `status = 'pending'` until an administrator
   approves it. Patient intake and simulation are blocked until then
   (`requireApprovedHospital` middleware) — the UI reflects this too.
5. Every hospital-scoped API route checks the session cookie server-side;
   there is no client-supplied hospital ID anywhere that would let one
   hospital read another's patients.

## 6. The hidden admin panel

Nothing in `public/` links to it, references it, or contains its path.
Three independent layers gate it:

1. **Unlisted path** — mounted at `/${ADMIN_ROUTE_SECRET}` (both the page and
   its API, e.g. `/api/${ADMIN_ROUTE_SECRET}/...`). If `ADMIN_ROUTE_SECRET`
   is empty, the admin panel doesn't mount **at all** — safest default.
2. **Real authentication** — admin accounts are bcrypt-hashed and can only be
   created via `npm run create-admin` on the server itself. There is no
   public admin signup endpoint anywhere.
3. **Optional shared-secret header** — if you set `ADMIN_ACCESS_KEY`, every
   admin API request must also include `x-admin-key: <that value>`; the
   admin frontend sends it automatically. Requests missing it get a plain
   `404`, not a `401` — they don't even learn the route exists.

Treat `ADMIN_ROUTE_SECRET` and `ADMIN_ACCESS_KEY` like credentials: generate
them randomly, keep them out of git (already in `.gitignore` via `.env`),
and rotate them if you ever suspect exposure. For a real production
deployment, additionally put the admin path behind a VPN or IP allowlist at
your reverse proxy / firewall — the URL-path secrecy here is defense in
depth, not a substitute for network-level access control.

## 7. Deploying

### Docker (recommended)
```bash
cp .env.example .env   # fill in real values
docker compose up -d --build
docker compose exec molab-cloud npm run create-admin -- admin@yourorg.com "strong-password"
```

### Bare metal / VM
```bash
npm install --omit=dev
npm run migrate
npm run create-admin -- admin@yourorg.com "strong-password"
NODE_ENV=production npm start
```
Put this behind a reverse proxy (nginx/Caddy) that terminates TLS — the app
itself serves plain HTTP. Set `secure: true` on cookies happens automatically
once `NODE_ENV=production`, which requires HTTPS in front of it.

### Environment checklist before going live
- [ ] `JWT_SECRET` changed from the default
- [ ] `ADMIN_ROUTE_SECRET` set to a random value, not committed anywhere
- [ ] `ADMIN_ACCESS_KEY` set (recommended)
- [ ] Real SMTP credentials configured and test-verified
- [ ] `APP_BASE_URL` set to your real HTTPS domain
- [ ] TLS/HTTPS terminated in front of the app
- [ ] `data/` volume backed up on a schedule
- [ ] Admin panel additionally restricted at the network level (VPN/IP allowlist)

## 8. API summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | none | Hospital signup |
| GET | `/api/auth/verify-email?token=` | none (token) | Confirm email |
| POST | `/api/auth/resend-verification` | none | Resend link |
| POST | `/api/auth/login` | none | Hospital login → session cookie |
| POST | `/api/auth/logout` | cookie | Clear session |
| GET | `/api/auth/me` | cookie | Current session info |
| GET/POST | `/api/patients` | hospital | List / register patients (own hospital only) |
| PUT | `/api/patients/:id/dataset` | hospital, approved | Update measurements |
| POST | `/api/patients/:id/simulate` | hospital, approved | Run all 5 models server-side |
| GET | `/api/public/stats` | none | Live counts (real, starts at 0) |
| GET | `/api/public/models` | none | Model registry |
| POST | `/api/{secret}/login` | none (rate-limited) | Admin login |
| GET | `/api/{secret}/overview` \| `/hospitals` \| `/patients` \| `/audit-log` | admin | Network oversight |
| PATCH | `/api/{secret}/hospitals/:id/status` | admin | Approve / suspend |

## 9. Before you use this with real patients

- All five growth models run server-side and identically for every hospital,
  but the risk-band thresholds (doubling time <30/<90/>90 days) are a
  reasonable heuristic built for this demo, not a clinically validated score.
  Every output needs clinician review before any care decision.
- SQLite is fine for a pilot; for multi-region, high-availability production
  use, migrate to PostgreSQL and put the app behind a load balancer.
- No audit-grade encryption-at-rest is configured out of the box — add
  disk/volume encryption at the infrastructure layer.
- Different countries have different health-data laws (HIPAA, GDPR, PDPA,
  DRAP, CDSCO, etc.). Get sign-off from each hospital's legal/ethics/IT team
  and the applicable regulator in that hospital's country before real patient
  data goes in — this app doesn't make that determination for you.
