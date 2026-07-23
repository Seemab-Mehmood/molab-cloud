# MOLAB Cloud — International Mathematical Oncology Platform

A closed, membership-only platform for MOLAB-affiliated healthcare
professionals and researchers worldwide. There is **no public
self-registration** — the MOLAB Team uploads a membership roster
(Excel/CSV), the system auto-creates accounts and emails activation links,
and members log in with their name, MOLAB Membership ID, and a password they
set themselves. Once active, a member can accept the research data-use
agreement, enroll de-identified patients, run five published tumor-growth
models against each patient's serial measurements, download the results, and
use a members-only community board.

This is a real, runnable full-stack app: Node/Express API, SQLite database,
bcrypt password hashing, JWT session cookies, real SMTP email, Excel roster
import, and a hidden admin panel. It is **launch-ready for a pilot**, not a
turnkey replacement for a hospital-grade, regulator-approved system — see
"Before you use this with real patients" at the bottom.

---

## 1. Project layout

```
molab-cloud/
├── src/
│   ├── server.js               # entry point (also runs the one-time admin seed)
│   ├── app.js                   # Express app, route mounting, hidden admin mount
│   ├── config/env.js
│   ├── db/{schema.sql,index.js}
│   ├── middleware/{auth.js, rateLimit.js, errorHandler.js}
│   ├── services/
│   │   ├── emailService.js      # SMTP (or console/log fallback in dev)
│   │   ├── tokenService.js
│   │   ├── excelRoster.js       # parses the admin's uploaded roster file
│   │   ├── adminSeed.js         # auto-creates the bootstrap admin account
│   │   └── modelEngine.js       # RK4 + Nelder–Mead, 5 growth models (server-side)
│   ├── controllers/
│   │   ├── memberController.js  # activate / login / logout / forgot-reset password
│   │   ├── agreementController.js
│   │   ├── teamController.js    # "who else is at my hospital"
│   │   ├── communityController.js
│   │   ├── patientController.js
│   │   ├── adminController.js   # roster upload, member status, email tools, oversight
│   │   ├── publicController.js
│   │   └── sharedAudit.js
│   └── routes/                   # route wiring (one file per controller area)
├── public/                        # the public + member website (static, vanilla JS)
│   ├── index.html                 # landing page — login only, live stats
│   ├── login.html                 # name + MOLAB ID + password
│   ├── activate.html              # set-password flow from the roster invite email
│   ├── forgot-password.html / reset-password.html
│   ├── signup.html                # "membership is by invitation" info page
│   └── dashboard.html             # member app: dashboard, team, patients, simulator,
│                                    tutorial, community board
├── adminPanel/                     # admin UI — NEVER linked from public/, served
│   │                                 dynamically only at the secret admin path
│   ├── index.html                  # overview, roster, hospitals, patients, email, audit
│   └── assets/ (admin.js, admin.css)
├── scripts/{createAdmin.js, migrate.js}
├── data/                            # SQLite DB + dev-emails.log (gitignored, minus this delivery)
├── .env                              # already filled in — see section 2
├── package.json / Dockerfile / docker-compose.yml
```

## 2. Quick start (local)

```bash
cd molab-cloud
npm install
npm start
# → MOLAB Cloud backend listening on port 4000
```

Open `http://localhost:4000`.

### Your admin login
`.env` ships pre-configured to auto-create an admin on first boot:
```
Email:    molabpakistan@gmail.com
Password: @MolabPakistan26
Panel:    http://localhost:4000/6518107ae6b714539468f765
```
Nothing else to run — this happens automatically the first time the server
starts (`src/services/adminSeed.js`). Once confirmed working, consider
deleting `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` from `.env` (the account
persists regardless). Add more admins any time with:
```bash
npm run create-admin -- another@yourorg.com "a-strong-password"
```

## 3. How membership works, end to end

1. **Admin uploads a roster** (admin panel → Membership Roster tab) — an
   `.xlsx`/`.xls`/`.csv` with columns `Name`, `MOLAB ID`, `Email`,
   `Hospital/Institution`, `Country`, and optionally `Tier`. Header matching
   is case-insensitive and forgiving of common variants (see
   `src/services/excelRoster.js`).
2. Each **new** row creates a `status: active` member account and hospital
   record (deduplicated by name+country) — **immediately usable, no
   password and no email activation step.** A 12-month membership clock
   (`membership_started_at` → `membership_expires_at`, `MEMBERSHIP_DURATION_DAYS`
   in `.env`, default 365) starts the moment the account is created. MOLAB
   IDs are handed to members directly by the MOLAB Team, outside this app.
3. Each **existing** row (matched by MOLAB ID or email) updates that
   member's name/hospital/tier in place — their status, membership dates,
   and agreement acceptance are left untouched, so re-uploading a refreshed
   roster is always safe.
4. Members log in at `/login.html` with just **full name + MOLAB
   Membership ID** — no password. The name must match what's on file
   (case-insensitive).
5. First time they open **New Patient Intake**, they're shown the research
   data-use agreement and must type their name as a signature to accept it
   before patient registration unlocks (enforced server-side — see
   `requireAgreement` middleware).
6. They can now enroll patients, run simulations, see colleagues at their
   own hospital under **My Hospital Team**, and use the **Community Board**.

### When a membership locks
Login **always** succeeds for a matching name+ID pair. What locks is
*activity* — enforced server-side by `requireActiveMembership`
(`src/middleware/auth.js`) on patient routes (list/view/create/update/
simulate) and on creating community posts/comments. A member is locked when
either is true:
- their 12-month clock has passed (`membership_expires_at < now`), or
- an admin has manually blocked them (`status: suspended`) — the tool for
  handling discriminatory behavior or community complaints.

Both cases feel identical to the member: they can still log in and see
their dashboard, but a popup reads *"Your access to vMOLAB Learn has
expired. Please check your membership status with MOLAB admin,"* and
Patient Registry / New Patient Intake / Prognosis Simulator / new community
posts & replies are blocked until an admin either **renews** (resets the
12-month clock) or **unblocks** them from the Roster tab. Reading the
community board stays open even while locked. A **Contact Admin** tab
(and a direct `mailto:molabpakistan@gmail.com` link) is always available,
specifically so a locked member can resolve it.

## 4. Admin dashboard

At `/{ADMIN_ROUTE_SECRET}`:
- **Overview** — active/expired/suspended member counts, hospitals,
  patients, simulations run, community posts
- **Membership Roster** — upload the Excel/CSV roster; table of every
  member with their membership expiry date and **Renew +1yr** /
  **Block** (with a required reason) / **Unblock** actions
- **Hospitals** — read-only list of hospitals derived from the roster, with
  member counts
- **All Patients** — cross-network oversight; **View** opens a modal with
  the patient's full record, the same chart the member sees, and the
  consensus prognosis, so admin can see exactly "how it works" without
  touching the database directly
- **Email Members** — send a one-off message to one member or broadcast to
  everyone (approvals, feedback replies, system notices) — also where
  Contact Admin messages effectively land (via `ADMIN_CONTACT_EMAIL`)
- **Audit Log** — every login, agreement acceptance, patient action, roster
  import, membership renewal/block, and admin action

## 5. Community board

Members-only (not visible to logged-out visitors or unauthenticated
requests). Any member can **read** the board even while locked; posting a
question, commenting/replying, and reacting require an active membership.
Reactions are a simple toggle per member per post (`community_reactions`,
unique on post+member+type) — see `src/controllers/communityController.js`.

## 6. Tutorial built into the member dashboard

The **Tutorial** tab covers the 4-step workflow (intake → simulate → read
results → export) and, in plain language, what each of the 5 models implies
clinically — not just its equation, but the growth pattern it represents and
when it's the best fit (Gompertz, Logistic, Exponential, von Bertalanffy,
Guiot power-law).

## 7. Exporting patient data

From the Prognosis Simulator, once a simulation has run:
- **CSV** — observed measurements, a full time-series table of every
  model's projected volume sampled every 5 days across the fitted horizon,
  and per-model fit metrics
- **PDF** — the rendered chart plus consensus/metrics text (client-side
  `jsPDF`, loaded from cdnjs)
- **TXT** — a plain-text summary report

## 8. Generating / rotating secrets

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 12   # ADMIN_ROUTE_SECRET (the admin panel's URL path)
openssl rand -hex 16   # ADMIN_ACCESS_KEY
```
If you ever suspect `.env` was exposed, rotate all three and change the
admin password with `npm run create-admin`.

## 9. Email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` in
`.env` for any SMTP provider (SendGrid, Mailgun, Amazon SES, Postmark, Gmail
SMTP with an app password). Until then, every email (activation, password
reset, admin feedback/broadcast) is logged to `data/dev-emails.log` and the
console instead of actually sent — the admin roster-upload result panel and
login page both surface this explicitly so it's never a silent failure.

## 10. The hidden admin panel

Nothing in `public/` links to it, references it, or contains its path.
Three independent layers gate it:
1. **Unlisted path** — mounted at `/${ADMIN_ROUTE_SECRET}` (page + API). If
   that env var is empty, the admin panel doesn't mount at all.
2. **Real authentication** — bcrypt-hashed, created only via
   `npm run create-admin` on the server itself or the one-time
   `ADMIN_SEED_*` bootstrap — no public admin signup endpoint exists.
3. **Optional shared-secret header** — if `ADMIN_ACCESS_KEY` is set, every
   admin API request must include `x-admin-key: <value>` or it gets a plain
   `404` (not `401`) — it doesn't even learn the route exists.

Treat both secrets like credentials. For real production use, additionally
put the admin path behind a VPN or IP allowlist at your reverse proxy.

## 11. Deploying

### Docker (recommended)
```bash
docker compose up -d --build
```
The bundled admin account is created automatically on first boot.

### Bare metal / VM
```bash
npm install --omit=dev
npm run migrate
NODE_ENV=production npm start
```
Put this behind a reverse proxy (nginx/Caddy) terminating TLS — cookies get
`secure: true` automatically once `NODE_ENV=production`, which requires
HTTPS in front of it.

### Environment checklist before going live
- [ ] `APP_BASE_URL` set to your real HTTPS domain
- [ ] Real SMTP credentials configured and test-verified
- [ ] Logged in once as `molabpakistan@gmail.com`, then removed
      `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` from `.env`
- [ ] TLS/HTTPS terminated in front of the app
- [ ] `data/` volume backed up on a schedule
- [ ] Admin panel additionally restricted at the network level (VPN/IP allowlist)
- [ ] First real roster uploaded and spot-checked in the Roster tab

## 12. API summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | none | Member login (name + MOLAB ID only) → session cookie |
| POST | `/api/auth/logout` / GET `/api/auth/me` | cookie | Session + membership status (locked/expiry/days remaining) |
| POST | `/api/auth/contact-admin` | member (works even if locked) | Send a message to the MOLAB Team |
| GET | `/api/agreement/text` / POST `/accept` | member | Data-use agreement |
| GET | `/api/team` | member | Colleagues at your hospital |
| GET/POST | `/api/community/posts` | member (read open even if locked) | Board posts |
| POST | `/api/community/posts/:id/comments` \| `/react` | member, active membership | Comment / like |
| GET/POST | `/api/patients` | member, active membership | List / register patients (own only) |
| PUT | `/api/patients/:id/dataset` | member, active + agreement | Update measurements |
| POST | `/api/patients/:id/simulate` | member, active + agreement | Run all 5 models server-side |
| GET | `/api/public/stats` \| `/models` | none | Live counts, model registry |
| POST | `/api/{secret}/login` | rate-limited | Admin login |
| POST | `/api/{secret}/roster/upload` | admin | Excel/CSV roster import |
| GET | `/api/{secret}/roster` \| PATCH `/roster/:id/status` \| POST `/roster/:id/renew` | admin | Membership management |
| POST | `/api/{secret}/roster/:id/email` \| `/broadcast` | admin | Member email tools |
| GET | `/api/{secret}/patients` \| `/patients/:id` | admin | Cross-network oversight |
| GET | `/api/{secret}/overview` \| `/hospitals` \| `/audit-log` | admin | Stats & activity |

## 13. Before you use this with real patients

- **Login security tradeoff, on purpose but worth knowing:** logging in
  with just a name and MOLAB ID (no password) is intentionally low-friction
  per your requirements, but it also means anyone who learns a member's
  name and MOLAB ID can access their account — there's no second factor.
  If MOLAB IDs are ever sequential, guessable, or shared outside secure
  channels, that risk goes up. Consider distributing IDs through a private
  channel, keeping them non-sequential, and/or adding a lightweight second
  factor later (e.g. an email-delivered one-time code) if this platform
  will hold real patient data at scale.
- Risk-band thresholds (doubling time <30/<90/>90 days) are a reasonable
  heuristic for this build, not a clinically validated score. Every output
  needs clinician review before any care decision.
- The agreement gate records acceptance server-side, but it is not a
  substitute for your institution's actual ethics/IRB approval process —
  treat it as an in-app acknowledgment, not a legal consent instrument on
  its own.
- SQLite is fine for a pilot; for multi-region, high-availability production
  use, migrate to PostgreSQL.
- Different countries have different health-data laws (HIPAA, GDPR, PDPA,
  DRAP, CDSCO, etc.). Get sign-off from each member's institution and the
  applicable regulator in that country before real patient data goes in.
