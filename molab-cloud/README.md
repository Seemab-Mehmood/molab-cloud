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
# .env is already included with a working configuration (see below) —
# edit it for your real domain/SMTP before going live.

npm start
# → MOLAB Cloud backend listening on port 4000
```

Open `http://localhost:4000` — that's the public site.

### Your admin login
This deployment ships with `.env` already configured to auto-create an
admin account on first boot:

```
Email:    molabpakistan@gmail.com
Password: @MolabPakistan26
Panel:    http://localhost:4000/6518107ae6b714539468f765   (swap host for your real domain)
```

This account is created automatically the first time the server starts
(see `src/services/adminSeed.js`) — there's nothing else to run. Once you've
confirmed you can log in, consider deleting the `ADMIN_SEED_EMAIL` /
`ADMIN_SEED_PASSWORD` lines from `.env` (the account itself stays in the
database regardless). To add more admins or change this password later:
```bash
npm run create-admin -- newemail@yourorg.com "new-password"
```

## 3. What the admin dashboard does

At `/{ADMIN_ROUTE_SECRET}`, after logging in:
- **Overview** — live counts: total/approved/pending hospitals, total patients
- **Hospital Directory** — every submission, with a **Review** button that
  opens the full submitted form (name, city, country, type, representative
  contact info, email-verification status, submission timestamp) plus
  Approve / Suspend actions right there
- **All Patients** — cross-hospital oversight (code, hospital, type/stage,
  risk band, simulation count) — read-only, no patient editing from here
- **Audit Log** — every registration, login, approval, and simulation event

## 4. Hospital registration → approval → use, end to end

1. Rep fills out `/signup.html`. On submit, they see a checkmark confirmation:
   *"Your hospital registration form has been submitted… After MOLAB Team
   approval, next steps will be communicated to you directly."*
2. A verification email goes out (or logs to `data/dev-emails.log` if SMTP
   isn't configured yet — the signup page tells them this explicitly).
3. Rep clicks the link, verifies, logs in — dashboard shows a "pending MOLAB
   Team review" banner; patient intake is blocked until approved.
4. Admin reviews the submission in the admin panel and clicks Approve.
5. Rep's dashboard banner disappears automatically next time they load it;
   they can now register patients and run simulations.

## 5. Tutorial built into the hospital dashboard

The dashboard's **Tutorial** tab (visible to every logged-in hospital rep)
covers, in plain language:
- The 4-step workflow (intake → simulate → read results → export)
- What each of the 5 models implies clinically (Gompertz, Logistic,
  Exponential, von Bertalanffy, Guiot power-law) — not just the equation,
  but what growth pattern it represents and when it's the best fit
- An explicit caution on how to read the risk band responsibly

## 6. Exporting patient data

From the Prognosis Simulator, once a simulation has been run:
- **Download Data (CSV)** — observed measurements, a full time-series table
  of every model's projected volume sampled every 5 days across the fitted
  horizon, and the per-model fit metrics — opens directly in Excel/Sheets
- **Download Chart (PDF)** — the rendered chart image plus consensus/metrics
  text, via client-side `jsPDF` (loaded from cdnjs)
- **Download Report (TXT)** — the original plain-text summary

## 7. Generating secrets

```bash
# JWT signing secret
openssl rand -hex 32

# Admin panel URL path (put the output straight into ADMIN_ROUTE_SECRET)
openssl rand -hex 12

# Optional second-factor header value
openssl rand -hex 16
```

## 8. Email verification

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` in
`.env` to any SMTP provider (SendGrid, Mailgun, Amazon SES, Postmark, Gmail
SMTP with an app password, etc.). Until you do, the server does **not** fail
silently — it logs the verification link to the console and appends it to
`data/dev-emails.log` so you can test the full flow locally. That fallback is
fine for development; real deployments must configure real SMTP.

## 9. How hospital accounts work

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

## 10. The hidden admin panel

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

## 11. Deploying

### Docker (recommended)
```bash
# .env is already included and working — edit APP_BASE_URL and SMTP_* for
# your real domain/provider first.
docker compose up -d --build
```
The bundled admin account (molabpakistan@gmail.com) is created automatically
on first boot. To add another admin instead:
```bash
docker compose exec molab-cloud npm run create-admin -- another@yourorg.com "strong-password"
```

### Bare metal / VM
```bash
npm install --omit=dev
npm run migrate
NODE_ENV=production npm start
```
Put this behind a reverse proxy (nginx/Caddy) that terminates TLS — the app
itself serves plain HTTP. Set `secure: true` on cookies happens automatically
once `NODE_ENV=production`, which requires HTTPS in front of it.

### Environment checklist before going live
- [ ] `APP_BASE_URL` set to your real HTTPS domain
- [ ] Real SMTP credentials configured and test-verified
- [ ] Logged in once as `molabpakistan@gmail.com`, then removed
      `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` from `.env`
- [ ] TLS/HTTPS terminated in front of the app
- [ ] `data/` volume backed up on a schedule
- [ ] Admin panel additionally restricted at the network level (VPN/IP allowlist)
- [ ] If you ever suspect `.env` was exposed, rotate `JWT_SECRET`,
      `ADMIN_ROUTE_SECRET`, and `ADMIN_ACCESS_KEY` (commands in section 7)
      and change the admin password with `npm run create-admin`

## 12. API summary

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

## 13. Before you use this with real patients

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
