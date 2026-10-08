# Club Rachas: White-Label Loyalty Streaks Platform. Implementation Spec

> **Audience:** an autonomous coding agent implementing this repository from scratch.
> **Status:** v1.0 (2026-10-08). This file is the source of truth. If you must deviate, update this spec in the same change and explain why.
> **Keywords:** **MUST** = required for acceptance; **SHOULD** = expected unless there is a concrete reason not to; **MAY** = optional.

---

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| Product | White-label "monthly spending streaks" loyalty program for the Farmaenlace business group, Ecuador. |
| Tenants | **EcoClub** (League 1 "SmartClub Ahorro", Farmacias Económicas) and **FarmaClub** (League 2 "SmartClub Wellness", Medicity, Wellderma, Mascotas, Ambiente). Same code, different config. |
| White-label model | **One deployment per tenant** (one CDK stack per tenant per stage). Branding is fixed at build time; business rules (tiers, thresholds, rewards) are **data** in DynamoDB, seeded from tenant config. |
| Monorepo | pnpm workspaces: `packages/infra`, `packages/api`, `packages/ui`, plus `packages/shared` (domain logic, tenant config, schemas). |
| Language | TypeScript everywhere, ESM, strict mode. |
| API | Express 5 on AWS Lambda (Node.js 22, arm64) behind API Gateway **HTTP API**. |
| UI | React 19 + Vite + React Router 7 + Tailwind CSS 4 SPA, deployed to private S3 behind CloudFront (OAC). |
| Routing | CloudFront serves the SPA and proxies `/api/*` to API Gateway, so both share **one origin** (no CORS). |
| Storage | DynamoDB, on-demand. Required tables: `Businesses`, `Customers`, `Streaks`, `CustomerStreakProgress`. Supporting tables: `Purchases`, `CustomerRewards`. |
| Customer auth | Cédula (CI) only, which yields a signed JWT (HS256). |
| POS auth | Per-tenant POS API key (Secrets Manager) + `x-business-id` header. |
| Locale | `es-EC` UI copy, USD currency, time zone `America/Guayaquil` for all month boundaries. |
| Money | Integer **cents** everywhere. Never floats. |
| Region | `us-east-1`. |
| CI/CD | GitHub Actions: PR runs lint, typecheck, test, build, synth. Push to `main` deploys `prod` via OIDC, then seeds. |

---

## 1. Product overview

### 1.1 Concept

Customers accumulate **all spending in a calendar month** across every business in their club (e.g., $3 on the 1st plus $11 on the 30th = $14). The monthly total places them in a **tier** (Bronze / Silver / Gold). Reaching a tier yields:

- **Micro-rewards (month 1):** granted immediately the first month a tier is reached (Bronze) to keep people from dropping out early.
- **Retention rewards (month 3):** granted when the customer keeps a tier (or higher) for **3 consecutive calendar months** (Silver, Gold).

Progress is visible **offline**: every POS purchase returns a progress message that is printed on the paper receipt and included in the digital receipt.

### 1.2 Tenants

| | EcoClub | FarmaClub |
|---|---|---|
| `tenantId` | `ecoclub` | `farmaclub` |
| League (internal name) | SmartClub Ahorro | SmartClub Wellness |
| Audience | Lower-middle income, price- and convenience-driven | Upper-middle income; personal care, lifestyle, home, pets |
| Businesses | Farmacias Económicas | Medicity, Wellderma, Mascotas, Ambiente (goal: cross-selling) |
| Bronze / Silver / Gold (monthly) | $10 / $15 / $25 | $30 / $60 / $120 |
| Reward code prefix | `ECO` | `FRM` |
| Visual lead | Green (Farmaenlace green) | Blue (Farmaenlace navy/blue) |

> **Assumption A1:** "EcoClub" maps to the Farmacias **Económicas** league and "FarmaClub" maps to the Wellness league. Mapping lives only in tenant config, so swapping is a config change.

### 1.3 Personas and channels

1. **Digital customer (self-service):** scans a QR at the counter/window or follows a social-media link, then opens the web app and registers with CI + email. Afterwards they log in with CI only to see progress and rewards.
2. **Non-digital customer (assisted):** at checkout the cashier types CI + email into the POS (Vendix). The customer is registered **and the current purchase counts** in the same call. They see progress on the printed receipt.
3. **Cashier / POS (Vendix):** calls the POS API to register customers, record purchases, print progress, and redeem reward codes. Because the real Vendix integration is out of scope, the UI ships a **POS Simulator** (`/caja`) that exercises the exact same API.

### 1.4 Scope

**In scope (MVP):**
- Self-service registration and CI-only login.
- Assisted registration and purchase recording through POS API.
- Monthly accumulation, tiers, consecutive-month streaks, reward issuance (idempotent, concurrency-safe).
- Receipt progress message (plain text + 32/40/48-column receipt lines).
- Customer dashboard, rewards wallet (codes + QR), history.
- Reward choice (for "one of" rewards) and redemption at POS.
- POS Simulator, including printable receipt preview and registration QR poster generator.
- Two tenants, infra, CI/CD, tests, seed and demo data.

**Out of scope (document as future work in README):**
- Real Vendix integration (only the API contract is defined).
- Sending emails (SES needs a verified domain; there is no domain yet).
- Refunds/returns and purchase reversal.
- Admin back-office UI. Businesses and streaks are managed through seed config / DynamoDB.
- Custom domain / Route 53 / ACM.
- Account deletion / data-subject-request flows (see §11, must be noted as a follow-up).

---

## 2. Business rules (normative)

All rules below are implemented as **pure functions in `packages/shared/src/domain`** and covered by unit tests (§9.4). The API only orchestrates I/O around them.

### 2.1 Glossary

| Term | Definition |
|---|---|
| **CI** | Ecuadorian *Cédula de Identidad*, 10 digits. Primary customer identifier. |
| **Month key** | `YYYY-MM` of an instant in `America/Guayaquil` (UTC-05:00, no DST). |
| **Monthly total** | Sum of `amountCents` of a customer's purchases at participating businesses whose `purchasedAt` falls in that month key. |
| **Streak definition** | A program: participating businesses + ordered tiers + rewards. Stored in `Streaks`. Each tenant has exactly one active streak in MVP, but the model supports several. |
| **Tier** | `{ tierId, name, minMonthlyCents }`. A month *qualifies* for tier T if `monthlyTotal >= T.minMonthlyCents`. |
| **Tier streak** | Number of consecutive month keys, ending at a given month, that qualify for tier T **or higher**. |
| **Reward definition** | Attached to a tier: `requiredConsecutiveMonths` (N), `selection` (`ALL` / `ONE_OF`), benefits, validity. |
| **Customer reward** | An issued, redeemable instance with a unique human code (e.g., `ECO-7KX9Q2MT`). |

### 2.2 CI validation (MUST)

A CI is valid if and only if:
1. It matches `^\d{10}$`.
2. Province code `parseInt(ci[0..1])` is in `01..24` or equals `30` (Ecuadorians registered abroad).
3. Third digit `ci[2]` is `< 6` (natural persons).
4. Check digit: for `i = 0..8`, multiply `ci[i]` by coefficient `2` when `i` is even and `1` when odd; if a product is `> 9`, subtract 9; sum. `check = (10 - sum % 10) % 10` MUST equal `ci[9]`.

Examples (synthetic, use these in tests and seeds): valid `1700000001`, `1700000019`, `1700000027`, `0900000001`, `0900000019`. Invalid `1700000002` (checksum), `2500000001` (province), `1760000001` (third digit), `170000000` (length).

Export `isValidCi(ci)`, `normalizeCi(input)` (strip spaces/dashes), and a test helper `makeValidCi(prefix9)`.

### 2.3 Registration

- Required data: **CI + email** only. Email is trimmed, lowercased, ≤254 chars, valid per zod `email()`.
- **Consent (MUST):** Ecuador's LOPDP requires explicit consent. Store `consent = { acceptedAt, policyVersion, channel }` where `channel` is `WEB_CHECKBOX` or `POS_VERBAL`. `policyVersion` is the constant `PRIVACY_POLICY_VERSION` in shared.
- **Self-service** (`POST /api/auth/register`): if the CI already exists, return `409 CUSTOMER_EXISTS` (UI offers login). On success, return a session token (auto-login).
- **Assisted** (`POST /api/pos/customers` or implicitly via `POST /api/pos/purchases` with `email`): idempotent. If the CI exists, return the existing customer with `200` and **do not** overwrite the email.
- Record `registrationChannel`: `WEB_QR` | `WEB_SOCIAL` | `WEB_DIRECT` | `POS`, and `registeredAtBusinessId` when known (from QR query param or POS header).
- Multiple customers MAY share an email (family members often share one).

### 2.4 Authentication (customers)

- Login is **CI only** (`POST /api/auth/login { ci }`). If the CI is not registered, return `404 CUSTOMER_NOT_FOUND`.
- On success issue a JWT (HS256, `jose`), claims `{ sub: ci, tid: tenantId }`, `exp` = 30 days. Rationale: re-login requires only the CI, so a longer session adds no meaningful risk and helps older adults.
- Because knowing a CI is enough to log in, the API MUST minimize what a session can see or do (§11): emails are always **masked** in responses, no profile edits in MVP, and rewards are only redeemable in person by a cashier.

### 2.5 Purchases and monthly accumulation

- Purchases are recorded **only via the POS API**, never by customers.
- `amountCents`: integer, `1..1_000_000` (≤ $10,000). It is the **net amount paid** after discounts.
- `purchasedAt`: optional ISO-8601 with offset; defaults to server now. MUST be ≤ now + 5 min and ≥ now − 72 h (supports offline POS sync), otherwise `422 PURCHASE_OUT_OF_WINDOW`.
- Month key is derived from `purchasedAt` in `America/Guayaquil`. Implementation hint: `new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).format(date)` gives `"2026-10"`.
- A purchase counts toward every **active** streak whose `businessIds` include the purchase's business.
- **Idempotency:** `(businessId, transactionId)` is unique. Replaying the same pair with the same `ci` and `amountCents` returns the original result (`200`). With different data it returns `409 TRANSACTION_CONFLICT`.

### 2.6 Tiers

- Tiers are strictly ascending by `minMonthlyCents`. Ranges are **lower-inclusive, upper-exclusive**: EcoClub Bronze is `[1000, 1500)`, Silver `[1500, 2500)`, Gold `[2500, ∞)`.
- `tierForTotal(def, total)` returns the highest tier with `min <= total`, or `null` (shown as "Miembro" / no tier).
- `nextTier(def, total)` returns `{ tier, gapCents }` for the lowest tier with `min > total`, or `null` at the top tier.

### 2.7 Streaks

For tier T and month key M, given the customer's monthly totals (missing months = 0):

- `streakCount(T, M)` = number of consecutive months ending **at M** that qualify for T or higher (0 if M does not qualify).
- **Display status** at the current month `Mnow`:
  - `ACTIVE`: `Mnow` already qualifies, so `consecutiveMonths = streakCount(T, Mnow)`.
  - `AT_RISK`: `Mnow` does not qualify yet but `Mnow − 1` does, so `consecutiveMonths = streakCount(T, Mnow − 1)`. The streak survives if T is reached before month end.
  - `NONE`: otherwise, so `consecutiveMonths = 0`.
- Streaks are **derived from monthly totals on read**. There is no stored counter and no scheduled job ("lazy evaluation"). A missed month resets automatically because it has total 0.
- Look-back cap: 36 months.

### 2.8 Rewards: issuance

- A reward definition with `requiredConsecutiveMonths = N` attached to tier T is **due in month M** when `M` qualifies for T **and** `streakCount(T, M) % N === 0`.
  - Bronze (N=1): due every month the customer reaches Bronze.
  - Silver/Gold (N=3): due in months 3, 6, 9… of an unbroken streak (the cycle restarts after each unlock).
- **Cumulative:** rewards of *every* tier whose condition holds are due (a Gold month also counts for Bronze and Silver streaks). *(Assumption A2.)*
- **Immediate:** issuance happens **during purchase processing**, the moment the threshold is crossed. Customers don't wait for month close.
- **Level-based, exactly-once:** after applying a purchase, compute all rewards due for that month and attempt a conditional put for each, keyed by a deterministic id. Already-issued rewards are skipped. This makes issuance idempotent and safe under concurrent purchases and retries.
- **Instance ids:**
  - `selection = ALL`: one customer reward per benefit per installment: `{streakId}#{M}#{tierId}#{rewardId}#{benefitId}#{i}`.
  - `selection = ONE_OF`: one customer reward with status `PENDING_CHOICE` holding all options: `{streakId}#{M}#{tierId}#{rewardId}#choice`. The customer picks one in the app (or the cashier at redemption time).
- **Validity:**
  - Default: `validFrom = issuedAt`, `expiresAt` = end of month `M + validForMonths` (in Guayaquil time).
  - Benefits with `monthlyInstallments = k > 1` (e.g., "one free home delivery per month") issue k rewards: installment 0 is valid from `issuedAt` to end of `M+1`; installment `i ≥ 1` is valid during calendar month `M+1+i` only.
  - `ONE_OF` benefits MUST have `monthlyInstallments = 1` (schema invariant).
- **Late purchases** (for a previous month, within the 72 h window) are evaluated for **their own** month key. If they change a later month's streak count, the later month's rewards are picked up on that month's next purchase (level-based evaluation catches up).
- **Status** values: `PENDING_CHOICE` | `AVAILABLE` | `REDEEMED`. `EXPIRED` is **computed on read** (`now > expiresAt` and not redeemed) and never written.
- **Code:** `{PREFIX}-` + 8 chars of Crockford base32 (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`) from `crypto.randomInt`. Unique via GSI lookup (collisions are negligible at 40 bits; on GSI hit, regenerate).

### 2.9 Rewards: choice and redemption

- **Choose** (`POST /api/me/rewards/:code/choose { benefitId }`): conditional update `status = PENDING_CHOICE` changes it to `AVAILABLE` with the chosen benefit snapshot. A second choice returns `409 REWARD_ALREADY_CHOSEN`.
- **Redeem** (`POST /api/pos/rewards/redeem { code }`): conditional update `status = AVAILABLE` changes it to `REDEEMED`, with `redeemedAt`, `redeemedAtBusinessId`, `redeemedTransactionId?`. Rejection reasons (`409 REWARD_NOT_REDEEMABLE` with `reason`): `ALREADY_REDEEMED`, `EXPIRED`, `NOT_YET_VALID`, `PENDING_CHOICE` (cashier may choose on the customer's behalf by passing `benefitId`), `WRONG_BUSINESS` (benefit restricted via `businessIds`).
- How a benefit is applied (applying a 5% discount, booking a grooming session…) happens at the POS/business side. This system only validates and marks codes.

### 2.10 Receipt progress message (the omnichannel "hack")

`buildProgressMessage(input) -> { message: string; lines: string[] }` in shared, where `lines` are wrapped to `width ∈ {32, 40, 48}` (default 40) and **ASCII-folded** (NFD + strip diacritics, drop `¡¿`, `ñ→n`) for thermal printers. `message` keeps full UTF-8 for digital receipts and the app.

Money formatting: `Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' })`, dropping a trailing `,00` (so `$18`, `$18,50`). Tier names are uppercased in messages (`BRONCE`, `PLATA`, `ORO`).

Sentence selection (concatenate in this order, skip empty):

1. **New rewards in this purchase:** `¡Felicitaciones! Desbloqueaste {titles joined with ", " and " y "}.` Then, if exactly one code, `Código: {code}.`; otherwise `Revisa tus códigos en {appHost}.`
2. **Progress:**
   - No tier yet, no purchases in any earlier month: `¡Bienvenido a {displayName}! Llevas {total} este mes. Te faltan {gap} para llegar a {NEXT} y ganar {next.receiptTeaser}.`
   - No tier yet, returning customer: `¡Sigue sumando! Llevas {total} este mes. Te faltan {gap} para llegar a {NEXT} y ganar {next.receiptTeaser}.`
   - Has tier, not top: `¡Vas por buen camino! Llevas {total} este mes. Solo te faltan {gap} para llegar a {NEXT} y ganar {next.receiptTeaser}.`
   - Top tier: `¡Eres {CUR} este mes! Llevas {total}.`
3. **Streak line** (first match wins, at most one):
   - If the current tier has a reward with N > 1 that was not unlocked this month: `Racha {CUR}: mes {progressInCycle} de {N}. ¡Mantén tu nivel el próximo mes!`
   - Else, if the highest `AT_RISK` tier R has a reward with N > 1: `¡No pierdas tu racha {R}! Te faltan {R.min − total} antes de fin de mes.`

`message` joins the sentences with single spaces. `lines` renders three paragraphs (rewards, progress, streak), each word-wrapped greedily to `width`.

**Golden test (MUST pass verbatim):** EcoClub, total `1800`, no new rewards, Silver streak month 1:
`¡Vas por buen camino! Llevas $18 este mes. Solo te faltan $7 para llegar a ORO y ganar un cupón de envío a domicilio gratis. Racha PLATA: mes 1 de 3. ¡Mantén tu nivel el próximo mes!`

Receipt block (`lines`, width 40) for the same input. **Golden test, MUST match exactly** (trailing spaces trimmed):

```
----------------------------------------
           ECOCLUB - TU RACHA
Mes: OCTUBRE 2026           Nivel: PLATA
Acumulado: $18                Faltan: $7
[##############------]               ORO
Vas por buen camino! Llevas $18 este
mes. Solo te faltan $7 para llegar a ORO
y ganar un cupon de envio a domicilio
gratis.
Racha PLATA: mes 1 de 3. Manten tu nivel
el proximo mes!
----------------------------------------
```

Layout rules: rules of `-` × width; title `{DISPLAYNAME} - TU RACHA` centered (`floor` left padding); two-column rows are left label + right-aligned value padded to width; at no tier the right value is `Nivel: -`. The progress bar is `[` + 20 cells + `]`, `#` count = `floor(20 × total / next.minMonthlyCents)` (all `#` at top tier), followed by the right-aligned next tier name (or current tier at top).

### 2.11 Program definitions per tenant

**EcoClub: League "SmartClub Ahorro" (`streakId: liga-ahorro`)**, businesses: `farmacias-economicas`

| Tier | Min/month | N | Selection | Benefits | `receiptTeaser` | validForMonths |
|---|---|---|---|---|---|---|
| BRONZE "Bronce" | 1000 | 1 | ALL | `PERCENT_DISCOUNT` 5%: "5% de cashback en tu próxima compra" | `5% de cashback en tu próxima compra` | 1 |
| SILVER "Plata" | 1500 | 3 | ONE_OF | `SPECIAL_DAYS_EARLY_ACCESS` "Acceso anticipado a Días Especiales" **or** `FIXED_DISCOUNT` 200¢ "Cupón de $2" | `un cupón de $2 o acceso anticipado a Días Especiales` | 2 |
| GOLD "Oro" | 2500 | 3 | ALL | `SPECIAL_DAYS_DISCOUNT` up to 25% "Hasta 25% en Días Especiales"; `FREE_DELIVERY` "Envío a domicilio gratis" with `monthlyInstallments: 3` | `un cupón de envío a domicilio gratis` | 2 |

**FarmaClub: League "SmartClub Wellness" (`streakId: liga-wellness`)**, businesses: `medicity`, `wellderma`, `mascotas`, `ambiente`

| Tier | Min/month | N | Selection | Benefits | `receiptTeaser` | validForMonths |
|---|---|---|---|---|---|---|
| BRONZE "Bronce" | 3000 | 1 | ALL | `PERCENT_DISCOUNT` 5% "5% de cashback en tu próxima compra"; `IN_STORE_PERK` "Café de cortesía en tu visita" | `5% de cashback y un café de cortesía` | 1 |
| SILVER "Plata" | 6000 | 3 | ALL | `IN_STORE_PERK` "Consulta dermatológica exprés"; `IN_STORE_PERK` "Muestras médicas premium de laboratorios aliados"; `IN_STORE_PERK` "Fila Fast Track en Medicity" (`businessIds: [medicity]`) | `consulta dermatológica exprés, muestras premium y Fast Track` | 2 |
| GOLD "Oro" | 12000 | 3 | ONE_OF | `PARTNER_EXPERIENCE` "Asesoría de diseño de interiores" (`businessIds: [ambiente]`) **or** `PARTNER_EXPERIENCE` "Sesión de grooming para tu mascota" (`businessIds: [mascotas]`) **or** `PARTNER_EXPERIENCE` "Fin de semana de prueba de manejo BYD" (`partnerName: BYD`) | `una experiencia premium a tu elección` | 2 |

> **Assumption A3:** "5% cashback toward the next purchase" is modeled as a single-use 5% discount coupon on the next purchase. **A4:** Silver Ahorro and Gold Wellness use "or" in the brief, so they are `ONE_OF`. Everything else is `ALL`.

### 2.12 Worked example (EcoClub)

| Month | Purchases | Total | Tier | Bronze streak | Silver streak | Gold streak | Rewards issued |
|---|---|---|---|---|---|---|---|
| Aug | $3, $9 | $12 | Bronze | 1 | 0 | 0 | Bronze 5% (on the $9 purchase) |
| Sep | $20 | $20 | Silver | 2 | 1 | 0 | Bronze 5% |
| Oct | $5, $11 | $16 | Silver | 3 | 2 | 0 | Bronze 5% (on $11) |
| Nov | $30 | $30 | Gold | 4 | **3** | 1 | Bronze 5% + **Silver choice** |
| Dec | $4 | $4 | none | 0 | 0 | 0 | None. In December before month end, Silver shows `AT_RISK` with 3 months. |

---

## 3. Architecture

### 3.1 Runtime diagram (per tenant, per stage)

```
 Browser (customer / cashier)            Vendix POS (future)
            │  HTTPS                             │ HTTPS  x-api-key, x-business-id
            ▼                                    ▼
 ┌──────────────────────── CloudFront distribution ───────────────────────┐
 │  default (*)  ── OAC ──▶ S3 bucket (private, Block Public Access)      │
 │               CloudFront Function: SPA rewrite → /index.html           │
 │  /api/*       ── HTTPS ─▶ API Gateway HTTP API ($default route)        │
 └─────────────────────────────────────────────────────────────────────────┘
                                         │ Lambda proxy (payload v2)
                                         ▼
                         Lambda (Node 22, arm64): Express 5 app
                         │ env: TENANT_ID, TABLE_*, *_SECRET_ARN
             ┌───────────┼──────────────────────────────┐
             ▼           ▼                              ▼
       DynamoDB (6 tables)   Secrets Manager (JWT secret, POS key)   CloudWatch Logs
```

### 3.2 White-label strategy

- `packages/shared/src/tenants/{ecoclub,farmaclub}.ts` export a `TenantConfig` (§4.1): identity, copy, theme tokens, businesses, and streak definition **seed**.
- **Build time (UI):** `vite build --mode <tenantId>` loads `packages/ui/.env.<tenantId>`. That provides `VITE_TENANT`, `VITE_APP_TITLE`, `VITE_APP_DESCRIPTION`, `VITE_THEME_COLOR`, used in `index.html` via Vite's `%VITE_*%` replacement so **Open Graph tags are correct for social-media link previews** (crawlers don't run JS). A unit test MUST assert these `.env` values match the shared tenant config.
- **Runtime (UI):** `main.tsx` resolves the tenant config by `import.meta.env.VITE_TENANT` and applies CSS custom properties to `document.documentElement` **before** the first render.
- **Runtime (API):** `TENANT_ID` env selects tenant identity/copy. **Business rules are loaded from the `Streaks` and `Businesses` tables** (cached in-memory for 60 s), so thresholds and rewards can be changed in DynamoDB without redeploying. The seed script writes them from tenant config.
- **Infra:** `bin/app.ts` instantiates one `ClubStack` per selected tenant: `EcoClub-<stage>`, `FarmaClub-<stage>`.

### 3.3 Monorepo layout

```
.
├── .github/workflows/{ci.yml,deploy.yml,verify.yml}
├── .editorconfig  .gitignore  .nvmrc (22)  .prettierrc.json  .prettierignore
├── eslint.config.js            # flat config for all packages
├── package.json                # private root, scripts only, "packageManager": "pnpm@10.x"
├── pnpm-workspace.yaml         # packages/*
├── tsconfig.base.json
├── vitest.config.ts            # test.projects: ['packages/*']
├── docker-compose.yml          # dynamodb-local for dev & integration tests
├── README.md                   # setup, dev, deploy, bootstrap, architecture summary
├── SPEC.md                     # this file
└── packages/
    ├── shared/   (@club/shared)  domain logic, tenant configs, zod schemas, DTO types, table definitions
    ├── api/      (@club/api)     Express app, Lambda handler, repositories, seed script
    ├── ui/       (@club/ui)      React SPA
    └── infra/    (@club/infra)   CDK app
```

`@club/shared` is an **internal source package** (no build step): `"exports": { ".": "./src/index.ts" }`, consumed directly by Vite, esbuild (CDK `NodejsFunction`), tsx, and Vitest.

### 3.4 Tech stack

Use the latest stable versions at implementation time, with these constraints:

| Area | Choice |
|---|---|
| Runtime | Node.js 22 LTS (`.nvmrc`, `engines`), Lambda `NODEJS_22_X`, `ARM_64` |
| Package manager | pnpm 10 (corepack, `packageManager` field), `--frozen-lockfile` in CI |
| Language | TypeScript (latest stable), `"type": "module"` in all packages |
| Validation | zod 4 (shared request/response schemas used by API **and** UI forms) |
| API | Express 5, `@codegenie/serverless-express`, `helmet`, `pino` + `pino-http`, `jose`, AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-secrets-manager`) |
| UI | React 19, React Router 7 (`createBrowserRouter`, library/data mode), TanStack Query 5, Tailwind CSS 4 (`@tailwindcss/vite`), `qrcode.react`, `@fontsource/poppins`, `@fontsource/roboto` |
| Infra | `aws-cdk-lib` 2.x, `constructs`, `esbuild` (devDep, for `NodejsFunction` local bundling), `tsx` to run the CDK app |
| Tests | Vitest, `@vitest/coverage-v8`, `supertest`, React Testing Library, `@testing-library/user-event`, `jsdom`, MSW, `aws-cdk-lib/assertions` |
| Lint/format | ESLint 9 flat config, `typescript-eslint` (type-checked), `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-plugin-jsx-a11y`, `@vitest/eslint-plugin`, Prettier + `eslint-config-prettier` |

Don't add Turborepo, Nx, Redux, CSS-in-JS, or a charting library. Plain CSS bars are enough.

---

## 4. `packages/shared`

```
src/
├── index.ts
├── constants.ts            # PRIVACY_POLICY_VERSION, TIME_ZONE, LOCALE, CURRENCY, LOOKBACK_MONTHS=36
├── tenants/
│   ├── types.ts            # TenantConfig, ThemeTokens
│   ├── ecoclub.ts
│   ├── farmaclub.ts
│   └── index.ts            # TENANTS, getTenant(id), TenantId union
├── domain/
│   ├── ci.ts               # isValidCi, normalizeCi, maskCi, makeValidCi (test helper export)
│   ├── money.ts            # formatMoney(cents), dollarsToCents (string-safe, no float math)
│   ├── month.ts            # monthKeyOf(date), addMonths, previousMonthKey, monthBounds, daysLeftInMonth, monthLabel
│   ├── tiers.ts            # tierForTotal, nextTier, compareTiers
│   ├── streaks.ts          # streakCount, tierStreakStatus, progressInCycle
│   ├── rewards.ts          # dueRewards, buildRewardInstances (ids, validity, installments), generateRewardCode
│   ├── progress.ts         # buildProgressSummary (DTO for API/UI)
│   ├── receipt.ts          # buildProgressMessage, wrapLines, asciiFold, renderReceiptLines
│   └── email.ts            # maskEmail
├── schemas/                # zod: streakDefinition, business, api request/response DTOs, error envelope
└── tables.ts               # neutral DynamoDB table specs (keys, GSIs) used by infra AND local setup script
```

Domain functions MUST be pure; time is passed in (`now: Date`), never read from a global clock.

### 4.1 Types (normative shape; names may be refined)

```ts
export type TenantId = 'ecoclub' | 'farmaclub';
export type TierId = 'BRONZE' | 'SILVER' | 'GOLD';
export type BenefitType =
  | 'PERCENT_DISCOUNT' | 'FIXED_DISCOUNT' | 'FREE_DELIVERY'
  | 'SPECIAL_DAYS_EARLY_ACCESS' | 'SPECIAL_DAYS_DISCOUNT'
  | 'IN_STORE_PERK' | 'PARTNER_EXPERIENCE';

export interface BenefitDefinition {
  benefitId: string;            // kebab-case, unique within reward
  type: BenefitType;
  title: string;                // es-EC, short (≤ 40 chars)
  description: string;          // es-EC
  percent?: number;             // PERCENT_DISCOUNT, SPECIAL_DAYS_DISCOUNT
  amountCents?: number;         // FIXED_DISCOUNT
  businessIds?: string[];       // restrict redemption
  partnerName?: string;         // PARTNER_EXPERIENCE
  monthlyInstallments?: number; // default 1
}

export interface RewardDefinition {
  rewardId: string;
  requiredConsecutiveMonths: number; // ≥ 1
  selection: 'ALL' | 'ONE_OF';
  validForMonths: number;            // ≥ 1
  benefits: BenefitDefinition[];     // ≥ 1 (≥ 2 for ONE_OF)
}

export interface TierDefinition {
  tierId: TierId;
  name: string;               // 'Bronce' | 'Plata' | 'Oro'
  minMonthlyCents: number;
  receiptTeaser: string;      // completes "... y ganar {teaser}."
  rewards: RewardDefinition[];
}

export interface StreakDefinition {
  streakId: string;
  name: string;
  description: string;
  period: 'CALENDAR_MONTH';
  timeZone: 'America/Guayaquil';
  businessIds: string[];
  tiers: TierDefinition[];    // strictly ascending minMonthlyCents, unique tierIds
  active: boolean;
  version: number;            // bump on edits
}

export interface BusinessDefinition {
  businessId: string;         // kebab-case slug
  name: string;               // 'Farmacias Económicas'
  brand: string;              // 'Económicas'
  category: 'PHARMACY' | 'DERMOCOSMETICS' | 'PETS' | 'HOME';
  description: string;
  active: boolean;
}

export interface ThemeTokens { /* see §7.1, all hex or CSS color strings */ }

export interface TenantConfig {
  id: TenantId;
  displayName: string;        // 'EcoClub'
  stackPrefix: string;        // 'EcoClub'
  leagueName: string;         // 'SmartClub Ahorro'
  groupName: 'Farmaenlace';
  tagline: string;
  rewardCodePrefix: 'ECO' | 'FRM';
  theme: ThemeTokens;
  businesses: BusinessDefinition[];
  streak: StreakDefinition;
}
```

The zod `streakDefinitionSchema` MUST enforce: ascending unique tiers, unique ids, `ONE_OF` ⇒ ≥2 benefits each with `monthlyInstallments ∈ {undefined, 1}`, numeric bounds, and that every `businessIds` entry exists in the tenant's businesses (checked in a tenant-config test).

Business categories: Farmacias Económicas → `PHARMACY`, Medicity → `PHARMACY`, Wellderma → `DERMOCOSMETICS`, Mascotas → `PETS`, Ambiente → `HOME`.

---

## 5. Data model (DynamoDB)

All tables: `BillingMode.PAY_PER_REQUEST`, point-in-time recovery ON, AWS-managed encryption, CDK-generated physical names (passed to Lambda via env). Use `TableV2`. Prod: `RemovalPolicy.RETAIN` + deletion protection. Dev: `DESTROY`. Use the DocumentClient (`@aws-sdk/lib-dynamodb`) with `removeUndefinedValues: true`.

Table specs live once in `shared/src/tables.ts` (logical name, PK/SK, GSIs). Infra maps them to CDK, and `api/scripts/setup-local-tables.ts` maps them to `CreateTableCommand` for DynamoDB Local.

### 5.1 `Businesses` (required)

| Key | Value |
|---|---|
| PK | `businessId` (S) |

Attributes: `name`, `brand`, `category`, `description`, `active` (BOOL), `createdAt`, `updatedAt`. Few items, so read with `Scan` and cache for 60 s.

### 5.2 `Customers` (required)

| Key | Value |
|---|---|
| PK | `ci` (S) |

Attributes: `email`, `registrationChannel`, `registeredAtBusinessId?`, `consent { acceptedAt, policyVersion, channel }`, `createdAt`, `updatedAt`, `lastLoginAt?`. Create with `ConditionExpression: attribute_not_exists(ci)`.

### 5.3 `Streaks` (required)

| Key | Value |
|---|---|
| PK | `streakId` (S) |

Attributes: the full `StreakDefinition` (tiers as a nested list/map). Validate with zod on read. If invalid, log an error and fail the request with 500 (never silently ignore).

### 5.4 `CustomerStreakProgress` (required): one item per customer × streak × month

| Key | Value |
|---|---|
| PK | `ci` (S) |
| SK | `progressKey` (S) = `{streakId}#{YYYY-MM}` |

Attributes: `streakId`, `monthKey`, `totalCents` (N), `purchaseCount` (N), `businessesVisited` (SS), `firstPurchaseAt`, `lastPurchaseAt`, `updatedAt`.
History query: `ci = :ci AND begins_with(progressKey, :streakId#)`, `ScanIndexForward=false`, `Limit=36`. Tier and streak values are **computed**, not stored.

### 5.5 `Purchases` (supporting: idempotency ledger and history)

| Key | Value |
|---|---|
| PK | `purchaseId` (S) = `{businessId}#{transactionId}` |
| GSI `byCustomer` | PK `ci` (S), SK `purchasedAt` (S, ISO-8601 UTC) |

Attributes: `ci`, `businessId`, `transactionId`, `storeId?`, `amountCents`, `purchasedAt`, `monthKey`, `streakIds` (L), `issuedRewardIds` (L, set after issuance), `createdAt`.

### 5.6 `CustomerRewards` (supporting: issued rewards wallet)

| Key | Value |
|---|---|
| PK | `ci` (S) |
| SK | `rewardInstanceId` (S), deterministic (§2.8) |
| GSI `byCode` | PK `code` (S), projection ALL |

Attributes: `code`, `status`, `streakId`, `monthKey`, `tierId`, `rewardId`, `benefit?` (snapshot), `options?` (snapshots, for `PENDING_CHOICE`), `installment`, `validFrom`, `expiresAt`, `issuedAt`, `issuedByPurchaseId`, `chosenAt?`, `redeemedAt?`, `redeemedAtBusinessId?`, `redeemedTransactionId?`.

> Rationale for the two supporting tables: idempotent POS ingestion needs a uniqueness ledger, and redemption needs lookup by code. Putting both into `CustomerStreakProgress` would mix unrelated access patterns.

---

## 6. API (`packages/api`)

### 6.1 Structure

```
src/
├── app.ts                 # createApp(container): Express app (no listen)
├── server.ts              # local dev: listen on PORT (default 3000)
├── lambda.ts              # serverless-express handler; app + container created once per cold start
├── config/env.ts          # zod-parsed env (fail fast)
├── container.ts           # wires repositories/services by DATA_DRIVER
├── lib/{errors.ts,jwt.ts,secrets.ts,logger.ts,clock.ts,codes.ts}
├── middleware/{request-id.ts,require-customer.ts,require-pos.ts,validate.ts,error-handler.ts,not-found.ts}
├── routes/{health.ts,program.ts,auth.ts,me.ts,pos.ts}
├── services/{program-service.ts,customer-service.ts,purchase-service.ts,progress-service.ts,reward-service.ts}
└── repositories/
    ├── types.ts           # interfaces
    ├── dynamo/*.ts        # DynamoDB implementations
    └── memory/*.ts        # in-memory implementations (tests, quick local dev)
scripts/{seed.ts,setup-local-tables.ts}
test/{unit,integration}/
```

Layering: routes → services → repository interfaces. Routes contain no business logic. Services receive `Clock` and repositories via constructor injection.

### 6.2 Conventions

- Base path `/api` (identical locally and behind CloudFront). JSON only. `express.json({ limit: '10kb' })`.
- `helmet()`, `app.disable('x-powered-by')`, `app.set('trust proxy', true)`. **No CORS middleware** (same origin in prod; Vite proxy in dev).
- Request validation via zod schemas from `@club/shared`; failures produce `400 VALIDATION_ERROR` with `details` (zod issues).
- Error envelope: `{ "error": { "code": "STRING_CODE", "message": "Spanish, user-safe", "details"?: unknown, "reason"?: string } }`. A typed `AppError(status, code, message, extra?)` class plus a central error handler. Unknown errors return 500 `INTERNAL_ERROR` with no stack in the body.
- Logging: pino JSON with `requestId`. **Never log raw CIs or emails**: use `maskCi` (`17******01`) and `maskEmail` via a pino `redact`/serializer.
- Responses never include unmasked emails.

**Error codes:** `VALIDATION_ERROR`, `INVALID_CI`, `UNAUTHENTICATED`, `INVALID_POS_KEY`, `BUSINESS_NOT_ALLOWED`, `CUSTOMER_NOT_FOUND`, `CUSTOMER_EXISTS`, `REWARD_NOT_FOUND`, `REWARD_ALREADY_CHOSEN`, `REWARD_NOT_REDEEMABLE`, `TRANSACTION_CONFLICT`, `PURCHASE_OUT_OF_WINDOW`, `NOT_FOUND`, `INTERNAL_ERROR`.

### 6.3 Auth middleware

- `requireCustomer`: `Authorization: Bearer <jwt>`. Verify signature, `exp`, and `tid === TENANT_ID`, then load the customer (404 becomes 401). Sets `req.customer`.
- `requirePos`: headers `x-api-key` and `x-business-id`. Compare the key with `crypto.timingSafeEqual` (hash both to SHA-256 first to equalize length). The business must exist, be `active`, and belong to an active streak, otherwise `403 BUSINESS_NOT_ALLOWED`. Sets `req.business`.

### 6.4 Endpoints

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | `{ status: 'ok', tenant, version }` |
| `GET /api/program` | none | Tenant identity, active streak definitions (tiers, rewards, teasers), active businesses. `Cache-Control: public, max-age=300` |
| `POST /api/auth/register` | none | `{ ci, email, acceptPrivacyPolicy: true, source?: { channel: 'QR'\|'SOCIAL'\|'DIRECT', businessId? } }` → `201 { token, customer }` / `409 CUSTOMER_EXISTS` |
| `POST /api/auth/login` | none | `{ ci }` → `200 { token, customer }` / `404 CUSTOMER_NOT_FOUND` |
| `GET /api/me` | customer | `{ ci, emailMasked, registeredAt, registrationChannel }` |
| `GET /api/me/progress` | customer | `{ progress: ProgressSummary[] }` for the current month (§6.6) |
| `GET /api/me/history?months=6` | customer | Monthly items (1–12 months): `{ monthKey, monthLabel, totalCents, purchaseCount, tier }[]`, zero-filled |
| `GET /api/me/purchases?cursor=` | customer | Paginated (20) via `byCustomer` GSI, newest first. Opaque base64url cursor |
| `GET /api/me/rewards` | customer | All rewards with computed `status` (incl. `EXPIRED`), newest first |
| `POST /api/me/rewards/:code/choose` | customer | `{ benefitId }` → updated reward |
| `POST /api/pos/customers` | POS | `{ ci, email }` → `201` (created) / `200` (existing): `{ customer, registeredNow }` |
| `POST /api/pos/customers/progress` | POS | `{ ci, receiptWidth? }` → `{ progress, receipt }` (reprint). **POST so the CI never appears in URLs or access logs** |
| `POST /api/pos/purchases` | POS | Record purchase (§6.5) |
| `POST /api/pos/rewards/lookup` | POS | `{ code }` → reward with computed status |
| `POST /api/pos/rewards/redeem` | POS | `{ code, transactionId?, benefitId? }` → redeemed reward / `409 REWARD_NOT_REDEEMABLE` with `reason` |

`customer` in auth responses: `{ ci, emailMasked, registeredAt }`. `CustomerRewardDto`: `{ code, status, tierId, tierName, monthKey, benefit?, options?, validFrom, expiresAt, redeemedAt? }`.

### 6.5 `POST /api/pos/purchases`: algorithm (normative)

Request:

```json
{
  "transactionId": "VX-000123",
  "ci": "1700000001",
  "email": "cliente@example.com",
  "amountCents": 1100,
  "purchasedAt": "2026-10-30T15:04:05-05:00",
  "storeId": "UIO-042",
  "receiptWidth": 40
}
```

`email` is only required when the customer is not registered yet. `purchasedAt`, `storeId`, `receiptWidth` are optional.

Steps:

1. Validate body. `requirePos` has resolved `business`.
2. Resolve the customer by CI. If missing: when `email` is present, register (`channel = POS`, `consent.channel = POS_VERBAL`, `registeredAtBusinessId`) and set `registeredNow = true`. Otherwise return `404 CUSTOMER_NOT_FOUND`.
3. Validate the `purchasedAt` window and compute `monthKey`. Determine `streaks` = active streaks containing `business.businessId`.
4. `TransactWriteItems`:
   - `Put` Purchases item with `attribute_not_exists(purchaseId)`.
   - For each streak: `Update` progress `{ci, streakId#monthKey}` with `ADD totalCents :amt, purchaseCount :one, businessesVisited :bizSet SET streakId=:s, monthKey=:m, lastPurchaseAt=:t, updatedAt=:now, firstPurchaseAt=if_not_exists(firstPurchaseAt, :t)`.
   - If cancelled because the Purchase condition failed: **replay**. Load the existing purchase; if `ci` or `amountCents` differ, return `409 TRANSACTION_CONFLICT`. Otherwise continue with step 5 and respond `200`. Re-running issuance is safe (idempotent) and repairs a previous attempt that crashed between steps 4 and 6.
5. For each streak: query history (strongly consistent, ≤36 months), call `dueRewards(def, history, monthKey)` then `buildRewardInstances(...)`, and `Put` each instance with `attribute_not_exists(rewardInstanceId)` (parallel). Successful puts are newly created. `ConditionalCheckFailed` means it was already issued, so ignore it.
6. `Update` the purchase with `issuedRewardIds` = stored ids ∪ ids created in step 5. This purchase's **new rewards** are exactly those ids, so a replay returns the same `newRewards` as the original call.
7. Build `ProgressSummary` for the purchase's month key and the receipt via `buildProgressMessage` (the primary streak is the first matching one).
8. Respond `201` (or `200` on replay):

```json
{
  "purchase": { "purchaseId": "farmacias-economicas#VX-000123", "amountCents": 1100, "purchasedAt": "...", "monthKey": "2026-10" },
  "customer": { "ci": "1700000001", "emailMasked": "c*****e@example.com", "registeredNow": false },
  "progress": [ /* ProgressSummary */ ],
  "newRewards": [ /* CustomerRewardDto */ ],
  "receipt": { "message": "¡Vas por buen camino! ...", "lines": ["----", "..."] }
}
```

**Concurrency guarantee (MUST be tested against DynamoDB Local):** N parallel purchases for the same customer that together cross a threshold produce exactly one reward instance per due benefit, and `totalCents` equals the exact sum.

### 6.6 `ProgressSummary` DTO

```ts
interface ProgressSummary {
  streakId: string;
  streakName: string;
  monthKey: string;                 // '2026-10'
  monthLabel: string;               // 'octubre 2026'
  daysLeftInMonth: number;          // including today, Guayaquil time
  totalCents: number;
  purchaseCount: number;
  currentTier: { tierId: TierId; name: string } | null;
  nextTier: { tierId: TierId; name: string; minMonthlyCents: number; gapCents: number; receiptTeaser: string } | null;
  tiers: Array<{
    tierId: TierId; name: string; minMonthlyCents: number;
    reachedThisMonth: boolean;
    streak: { consecutiveMonths: number; status: 'ACTIVE' | 'AT_RISK' | 'NONE' };
    rewards: Array<{
      rewardId: string; requiredConsecutiveMonths: number; selection: 'ALL' | 'ONE_OF';
      progressInCycle: number;      // 0..N; see below
      unlockedThisMonth: boolean;
      benefits: Array<{ benefitId: string; type: BenefitType; title: string; description: string }>;
    }>;
  }>;
  businessesVisited: string[];      // businessIds this month
  message: string;                  // same text as the receipt `message`
}
```

`progressInCycle = (reachedThisMonth && c > 0 && c % N === 0) ? N : c % N`, where `c = streak.consecutiveMonths`. `unlockedThisMonth = reachedThisMonth && c > 0 && c % N === 0`.

### 6.7 Environment (`config/env.ts`, zod)

| Var | Notes |
|---|---|
| `TENANT_ID` | `ecoclub` \| `farmaclub` |
| `STAGE` | `local` \| `dev` \| `prod` |
| `DATA_DRIVER` | `dynamodb` (default) \| `memory` |
| `DYNAMODB_ENDPOINT` | optional, e.g. `http://localhost:8000` |
| `TABLE_BUSINESSES`, `TABLE_CUSTOMERS`, `TABLE_STREAKS`, `TABLE_PROGRESS`, `TABLE_PURCHASES`, `TABLE_REWARDS` | required for dynamodb driver |
| `JWT_SECRET` **or** `JWT_SECRET_ARN` | exactly one; ARN form is fetched once per cold start and cached |
| `POS_API_KEY` **or** `POS_API_KEY_SECRET_ARN` | exactly one |
| `APP_PUBLIC_HOST` | optional, used in receipt text ("Revisa tus códigos en …"); defaults to the CloudFront domain passed by infra |
| `LOG_LEVEL` | default `info` |

### 6.8 Local development

- `docker compose up -d dynamodb` (image `amazon/dynamodb-local`, port 8000).
- When `STAGE=local` and a `TABLE_*` var is unset, table names default to `${TENANT_ID}-local-${logicalName}` (e.g., `ecoclub-local-Customers`).
- `pnpm --filter @club/api db:setup --tenant all` creates the local tables from `shared/tables.ts`. `pnpm --filter @club/api seed --local --tenant all --demo` seeds both tenants.
- `pnpm --filter @club/api dev` runs `tsx watch src/server.ts` with `.env` (commit `.env.example` with **obviously fake** dev secrets). Override the tenant with `TENANT_ID=farmaclub`.
- Root scripts `dev:ecoclub` / `dev:farmaclub` start API (matching `TENANT_ID`) and UI (matching `--mode`) together via `concurrently`.
- `DATA_DRIVER=memory` allows running without Docker (seeded in-memory on boot, demo data included).
- Note: pass script arguments without a `--` separator (`pnpm <script> --flag`), since pnpm forwards them as-is.

---

## 7. UI (`packages/ui`)

### 7.1 Brand and theme (from farmaenlace.com)

Colors were extracted from `farmaenlace.com` theme CSS (`wp-content/themes/farmaenlace/css/app.min.css`). The site's fonts **Panton** and **Nexa** are commercial, so substitute **Poppins** (headings, 600/700) and **Roboto** (body, 400/500), both self-hosted via `@fontsource` (the site itself loads Poppins and Roboto from Google Fonts). **Do not copy Farmaenlace logos or images.** Use a text wordmark (e.g., "Eco" in brand color + "Club" in ink).

**Farmaenlace palette (source values):**

| Site class | Hex | Use here |
|---|---|---|
| `.c-green1`, links | `#80bc00` | EcoClub primary (fills, progress, accents). **Not** for text on white or white text on it (2.3:1) |
| `.c-blue` | `#002d74` | Navy: headings, FarmaClub strong/primary |
| `.c-light-blue` | `#0570b7` | FarmaClub primary (5.2:1 with white) |
| `.b-green-degradado` | `#1d8649` → `#6abf4b` | EcoClub strong buttons (`#1d8649`, 4.6:1 with white) and hero gradient |
| `.box-with-color.blue-1` | `#002d74` → `#006098` | FarmaClub hero gradient |
| `.c-light-green` | `#d9e8ab` | EcoClub soft surfaces (navy text on it) |
| `.c-red` | `#ea0029` | Errors / danger (4.6:1) |
| `.c-light-gray` | `#f1f2f4` | Muted surface |
| `.c-gray` | `#899199` | Input borders, icons, large text only (3.2:1) |
| menu text | `#b3b3b1` | Decorative dividers; Silver tier color |
| menu bg | `#191918` | Ink (body text) |

**Token sets** (CSS custom properties set on `:root` from `TenantConfig.theme`):

| Token | EcoClub | FarmaClub |
|---|---|---|
| `--brand-primary` | `#80bc00` | `#0570b7` |
| `--brand-primary-strong` (buttons, links) | `#1d8649` | `#002d74` |
| `--brand-on-strong` | `#ffffff` | `#ffffff` |
| `--brand-secondary` (headings, header) | `#002d74` | `#002d74` |
| `--brand-accent` | `#6abf4b` | `#80bc00` |
| `--brand-soft` | `#d9e8ab` | `#e1eef6` (12% tint of `#0570b7`) |
| `--brand-gradient` | `linear-gradient(90deg,#1d8649 34%,#6abf4b 100%)` | `linear-gradient(-22deg,#002d74 0,#006098 83%)` |

Shared tokens: `--surface #ffffff`, `--surface-muted #f1f2f4`, `--ink #191918`, `--ink-muted #5f666d` (darkened site gray to reach 5.8:1), `--line #899199`, `--line-subtle #b3b3b1`, `--danger #ea0029`, `--success #1d8649`, `--tier-bronze #c27c3a`, `--tier-silver #b3b3b1`, `--tier-gold #f2b705` (tier chips use `--ink` text; all ≥ 4.5:1).

Tailwind 4 setup (`src/styles.css`):

```css
@import "tailwindcss";
@theme inline {
  --color-brand: var(--brand-primary);
  --color-brand-strong: var(--brand-primary-strong);
  --color-on-brand: var(--brand-on-strong);
  --color-secondary: var(--brand-secondary);
  --color-accent: var(--brand-accent);
  --color-soft: var(--brand-soft);
  --color-surface: var(--surface);
  --color-surface-muted: var(--surface-muted);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-line: var(--line);
  --color-danger: var(--danger);
  --color-tier-bronze: var(--tier-bronze);
  --color-tier-silver: var(--tier-silver);
  --color-tier-gold: var(--tier-gold);
  --font-display: "Poppins", ui-sans-serif, system-ui, sans-serif;
  --font-sans: "Roboto", ui-sans-serif, system-ui, sans-serif;
}
html { font-size: 112.5%; } /* 18px base for older adults */
```

Components use only semantic classes (`bg-brand-strong text-on-brand`, `text-secondary`, `bg-soft`). **No hard-coded hex in components.**

### 7.2 Routes (Spanish slugs, `createBrowserRouter`, lazy-loaded pages)

| Path | Access | Page |
|---|---|---|
| `/` | public | **Landing:** gradient hero with tagline, CTAs "Únete gratis" and "Ver mi progreso"; "Cómo funciona" in 3 steps; tier cards from `/api/program` labelled "Al instante" (N=1) / "Mantén 3 meses" (N=3); participating businesses (FarmaClub: highlight the cross-brand idea); FAQ including "¿Necesito la app? No: tu progreso sale en tu factura." |
| `/registro` | public | CI (`inputMode="numeric"`, `autoComplete="off"`, live validation "Revisa tu número de cédula"), email, required privacy checkbox linking `/privacidad`. Reads `?canal=qr\|social&negocio=<businessId>`. `409` shows "Ya eres parte del club" + button to `/ingresar` (CI prefilled via router state, **never** in the URL). Success saves token and redirects to `/mi-club` |
| `/ingresar` | public | CI only. `404` shows "No encontramos esa cédula" + link to `/registro` |
| `/mi-club` | customer | **Dashboard:** month label + days left; big total; tier badge; `ProgressToNextTier` bar with markers at each tier and text "Te faltan $7 para ORO"; per-tier `StreakTracker` (N dots, status chip Activa / En riesgo / Sin racha, reward preview); the receipt `message` in a "Así sale en tu factura" card; businesses visited ("Visitaste 2 de 4 marcas"); link to rewards with available count |
| `/recompensas` | customer | Tabs Disponibles / Por elegir / Usadas / Vencidas. `RewardCard`: title, description, tier chip, validity, large monospace code + QR (`qrcode.react`, encodes the code only). Pending-choice uses a radio dialog to `/choose` |
| `/historial` | customer | Last 6 months as CSS bars with tier threshold lines + paginated purchases list |
| `/caja` | POS key | **POS Simulator** (§7.5) |
| `/privacidad` | public | Static privacy notice placeholder (LOPDP oriented; marked "pendiente de revisión legal") |
| `*` | public | 404 |

Customer pages: mobile-first, `max-w-screen-sm` centered, bottom nav (Mi club / Recompensas / Historial / Salir). `/caja`: wider layout, not linked from customer nav (small footer link "Acceso caja").

### 7.3 Components (minimum)

`AppShell`, `Wordmark`, `Button` (variants primary/secondary/ghost, min-height 48px), `TextField`, `CiField`, `Checkbox`, `Alert`, `Spinner`, `Money`, `TierBadge`, `ProgressToNextTier`, `StreakTracker`, `RewardCard`, `ReceiptPreview` (paper style, monospace, renders `lines`, print CSS), `RequireAuth`, `ErrorBoundary` (route `errorElement`).

### 7.4 Data and state

- `src/api/client.ts`: typed `fetch` wrapper (base `/api`), parses the error envelope into `ApiError { status, code, message, reason }`, attaches `Authorization`. A `401` clears the session and navigates to `/ingresar`.
- TanStack Query for all server state (`['program']`, `['me','progress']`, …). Invalidate progress/rewards after mutations.
- Session: `AuthProvider` context. Token persisted in `localStorage` (wrapped in try/catch; works without storage). POS key in `sessionStorage` only.
- Dev: Vite `server.proxy['/api'] = 'http://localhost:3000'`.
- Scripts: `dev` (`vite --mode ecoclub`), `dev:farmaclub`, `build` (`vite build --mode ecoclub --outDir dist/ecoclub && vite build --mode farmaclub --outDir dist/farmaclub`), `preview`.
- `index.html` uses `%VITE_APP_TITLE%`, `%VITE_APP_DESCRIPTION%`, `%VITE_THEME_COLOR%`, `<html lang="es-EC">`, `og:title`, `og:description`, favicon `/tenants/%VITE_TENANT%/favicon.svg` (simple generated SVG per tenant).

### 7.5 POS Simulator (`/caja`)

1. **Gate:** enter POS API key and select business (from `/api/program`). Stored in `sessionStorage`. A failed call with `INVALID_POS_KEY` returns to the gate.
2. **Venta (purchase):** fields N° transacción (prefilled `crypto.randomUUID()`, editable), Cédula, Monto (`$` text input converted with `dollarsToCents`, no float math), Fecha/hora (default now). On CI blur, call `/pos/customers/progress`. If `CUSTOMER_NOT_FOUND`, reveal the Correo field and show the verbal consent script ("¿Autoriza el uso de su cédula y correo para el programa {displayName}…?") with a required "El cliente aceptó" checkbox. Submit, then show `ReceiptPreview` with `receipt.lines`, new rewards, and buttons "Imprimir" (`window.print()`, print CSS shows only the receipt) and "Nueva venta".
3. **Canje (redeem):** code input, then `lookup` card (status, validity, restrictions), then "Canjear" (with benefit picker when `PENDING_CHOICE`).
4. **Material QR:** choose business and channel, then render a printable A5 poster with the QR for `${location.origin}/registro?canal=qr&negocio=<id>` and the headline "Escanea, regístrate con tu cédula y gana".

### 7.6 Accessibility and UX (MUST)

WCAG 2.1 AA: contrast per §7.1, 18px base, touch targets ≥48px, visible focus indicators with ≥3:1 contrast (`focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-secondary`), labels for every input, errors linked via `aria-describedby`, `aria-live="polite"` for async results, progress bars with `role="progressbar"` + `aria-valuenow/min/max` + text equivalent, no information by color alone (tier chips include the name), `prefers-reduced-motion` respected. Plain Spanish with short sentences. Numbers formatted `es-EC`.

---

## 8. Infrastructure (`packages/infra`)

```
bin/app.ts
lib/club-stack.ts
lib/constructs/{data-tables.ts, api-service.ts, web-hosting.ts}
test/club-stack.test.ts
cdk.json   # "app": "tsx bin/app.ts"
```

- **Context:** `-c stage=dev|prod` (default `dev`), `-c tenants=ecoclub,farmaclub` (default all). `env.region = process.env.CDK_DEFAULT_REGION ?? 'us-east-1'`. Stack ids `${tenant.stackPrefix}-${stage}`. Tags `app=club`, `tenant`, `stage`.
- **ClubStack props:** `{ tenant: TenantConfig; stage: 'dev' | 'prod'; webAssetPath: string }` (default `../ui/dist/<tenantId>`; tests pass a fixture dir so they don't need a UI build).

**DataTables:** six `TableV2` from `shared/tables.ts`, settings per §5.

**ApiService:**
- Two `secretsmanager.Secret`s with `generateSecretString` (JWT: 64 chars, excludePunctuation; POS key: 40 chars, excludePunctuation).
- `NodejsFunction` (entry `../api/src/lambda.ts`), `runtime NODEJS_22_X`, `architecture ARM_64`, `memorySize 512`, `timeout 10s`, explicit `LogGroup` (retention 1 month; RETAIN in prod), `tracing ACTIVE`, bundling `{ format: ESM, target: 'node22', minify: true, sourceMap: true, mainFields: ['module','main'], banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" }`, env `NODE_OPTIONS=--enable-source-maps` + §6.7 vars.
- Least privilege: `grantReadData` on Businesses and Streaks; `grantReadWriteData` on the other four (including GSIs); `secret.grantRead`.
- `HttpApi` with `$default` route to `HttpLambdaIntegration`, default stage throttling (rate 50, burst 100), access logging to a LogGroup (no request bodies).

**WebHosting:**
- S3 bucket: `blockPublicAccess: BLOCK_ALL`, `enforceSSL: true`, `encryption: S3_MANAGED`, `objectOwnership: BUCKET_OWNER_ENFORCED`, versioned in prod; dev `autoDeleteObjects` + `DESTROY`.
- CloudFront `Distribution`: `defaultRootObject: 'index.html'`, `priceClass: PRICE_CLASS_ALL` (South American edges such as Bogotá and Lima only exist in "All"), `httpVersion HTTP2_AND_3`, `minimumProtocolVersion TLS_V1_2_2021`.
  - Default behavior: `S3BucketOrigin.withOriginAccessControl(bucket)`, `REDIRECT_TO_HTTPS`, `CACHING_OPTIMIZED`, compress, plus a **CloudFront Function (viewer-request)** that rewrites URIs without a file extension to `/index.html` (SPA routing). **Do not use distribution `errorResponses` for SPA fallback**: they would also rewrite API 403/404 responses.
  - `/api/*` behavior: `HttpOrigin('<apiId>.execute-api.<region>.<urlSuffix>')`, `HTTPS_ONLY`, `ALLOW_ALL` methods, `CACHING_DISABLED`, `ALL_VIEWER_EXCEPT_HOST_HEADER` origin request policy.
  - `ResponseHeadersPolicy` (both behaviors): HSTS (1 year, includeSubdomains), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, CSP `default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; connect-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` (verify the built app runs under it, since React style props via CSSOM are allowed).
- Two `BucketDeployment`s, both `prune: false` (old hashed assets stay available to clients still holding a stale `index.html`):
  - (A) `exclude: ['*'], include: ['assets/*']` with `Cache-Control: public, max-age=31536000, immutable`.
  - (B) `exclude: ['assets/*']` with `Cache-Control: no-cache`, `distribution` + `distributionPaths: ['/*']`, and `B.node.addDependency(A)` so `index.html` never references assets that aren't uploaded yet.
- The API Lambda env `APP_PUBLIC_HOST` = distribution domain name.

**Outputs:** `WebUrl` (`https://<dist>.cloudfront.net`), `ApiUrl`, every table name, `PosApiKeySecretArn`, `JwtSecretArn`.

**Optional `GithubOidcStack`** (`-c bootstrapOidc=true`, deployed once manually): GitHub OIDC provider + `GithubDeployRole` trusted for `repo:<owner>/<repo>:ref:refs/heads/main` and the `production` environment, permitted to assume the CDK bootstrap roles (`cdk-*-deploy-role`, `file-publishing`, `lookup`), plus `cloudformation:DescribeStacks` and `dynamodb:PutItem`/`BatchWriteItem` on club tables (for seeding).

---

## 9. Quality: tooling and tests

### 9.1 TypeScript (`tsconfig.base.json`)

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

Each package extends it (`ui` adds `"lib": ["ES2023","DOM","DOM.Iterable"]`, `"jsx": "react-jsx"`, `"types": ["vite/client"]`; `api`, `infra` add `"types": ["node"]`). Each package has `typecheck: tsc -p tsconfig.json`. No `any` (lint-enforced); no `@ts-ignore` (use `@ts-expect-error` with reason in tests only).

### 9.2 ESLint (root `eslint.config.js`, flat)

- `@eslint/js` recommended, `tseslint.configs.strictTypeChecked`, `tseslint.configs.stylisticTypeChecked`, `languageOptions.parserOptions.projectService: true`.
- Rules: `@typescript-eslint/consistent-type-imports: error`, `@typescript-eslint/no-floating-promises: error`, `@typescript-eslint/switch-exhaustiveness-check: error`, `eqeqeq: error`, `no-console: error` (except `scripts/**`, `bin/**`), `@typescript-eslint/restrict-template-expressions` with `allowNumber: true`.
- `packages/ui/**`: `react-hooks` (recommended), `react-refresh/only-export-components`, `jsx-a11y` (recommended).
- `**/*.test.ts(x)`: `@vitest/eslint-plugin` recommended.
- `eslint-config-prettier` last. Ignore `**/dist`, `**/cdk.out`, `**/coverage`.

Prettier: `{ "singleQuote": true, "trailingComma": "all", "printWidth": 100 }`.

### 9.3 Root scripts

`lint`, `lint:fix`, `format`, `format:check`, `typecheck` (`pnpm -r typecheck`), `test` (`vitest run`), `test:coverage`, `build` (`pnpm --filter @club/ui build`), `synth` (`pnpm --filter @club/infra synth`, which runs `cdk synth --quiet`), `synth:prod` (`cdk synth --quiet -c stage=prod`), `dev:ecoclub`, `dev:farmaclub`.

`cdk synth` MUST work without AWS credentials (environment-agnostic stacks, no context lookups).

### 9.4 Required tests

Coverage thresholds: `shared` ≥ 90% lines/branches, `api` ≥ 80%, `ui` ≥ 60%.

**shared (unit):**
- `isValidCi`: every example in §2.2 plus non-digits and whitespace normalization.
- `monthKeyOf`: `2026-11-01T04:30:00Z` → `2026-10`; `2026-11-01T05:00:00Z` → `2026-11`; year rollover `addMonths('2026-12', 1)` → `2027-01`.
- `tierForTotal` boundaries (EcoClub): 999 → null, 1000 → BRONZE, 1499 → BRONZE, 1500 → SILVER, 2499 → SILVER, 2500 → GOLD. Same for FarmaClub (2999/3000/5999/6000/11999/12000).
- `nextTier` gaps, including `null` at top.
- Streaks: §2.12 table reproduced month by month; gap month resets; `AT_RISK` vs `NONE`; 36-month cap.
- `dueRewards`: Bronze every qualifying month; Silver at 3 and 6, not 4/5; cumulative issuance in a Gold month; break-and-restart.
- `buildRewardInstances`: deterministic ids; `ONE_OF` produces a single `PENDING_CHOICE`; `monthlyInstallments: 3` yields correct `validFrom`/`expiresAt` across a year boundary.
- `buildProgressMessage`: the **golden test** (§2.10) verbatim; no-tier welcome; top tier; new reward with single vs multiple codes; ASCII folding; every line ≤ width for 32/40/48.
- `formatMoney`: 1800 → `$18`, 1850 → `$18,50`, 123450 → `$1.234,50`. `dollarsToCents('18.5')` → 1850, `('18,50')` → 1850, rejects `'1.234.5'`.
- Tenant configs: pass zod schema; every referenced `businessId` exists.

**api (unit + HTTP with memory driver via `supertest`):**
- Register: happy path (token, masked email), duplicate (409), invalid CI (400 `INVALID_CI`), missing consent (400).
- Login: 200 / 404; JWT with wrong `tid` is rejected.
- POS auth: missing/wrong key (401), unknown/inactive business (403).
- Purchase: auto-registration with email; 404 without email; window validation (422); replay returns identical body with 200; conflicting replay returns 409; reward issued exactly at threshold crossing; receipt present.
- Choose and redeem: every `REWARD_NOT_REDEEMABLE` reason; double redeem; restricted business.
- Logs never contain a raw CI (assert on captured pino output).

**api (integration, DynamoDB Local; `pnpm --filter @club/api test:integration`, skipped unless `DYNAMODB_ENDPOINT` is set):**
- Repositories round-trip.
- **Concurrency:** 10 parallel purchases of $3 for one EcoClub customer: `totalCents = 3000`, `purchaseCount = 10`, exactly one Bronze reward instance.
- Idempotency under parallel replays of the same `transactionId`: one purchase item, total counted once.

**ui (Vitest + RTL + MSW):**
- `CiField` validation messages; registration flow (success redirects to dashboard; 409 shows login CTA); login 404 message.
- Dashboard renders tier, "Te faltan $7 para ORO", streak dots (`progressInCycle`), `AT_RISK` chip.
- Rewards: choose dialog sends the request; expired tab.
- POS Simulator: unknown customer reveals email + consent; receipt preview renders lines.
- Theme: `applyTheme` sets CSS vars for each tenant; `.env.<tenant>` values (`VITE_TENANT`, title, theme color) match the shared tenant config.

**infra (`aws-cdk-lib/assertions`, fixture `webAssetPath`):**
- 6 DynamoDB tables, all `PAY_PER_REQUEST` with PITR; GSIs `byCustomer`, `byCode` present.
- Bucket has all four Block Public Access flags `true` and a TLS-only policy; no public bucket policy statements.
- Distribution: OAC present; `/api/*` behavior uses the CachingDisabled managed policy; default behavior has the CloudFront Function association; **no** `CustomErrorResponses`; viewer protocol `redirect-to-https`.
- Lambda: `nodejs22.x`, `arm64`, env contains all `TABLE_*`; IAM grants read-only on Businesses/Streaks.
- `prod` stage tables have `DeletionProtectionEnabled: true` and `DeletionPolicy: Retain`.

---

## 10. CI/CD (GitHub Actions)

Pin actions to their latest major versions (`actions/checkout`, `actions/setup-node`, `pnpm/action-setup`, `aws-actions/configure-aws-credentials`). Use `permissions:` least privilege per job.

**`verify.yml`** (reusable, `on: workflow_call`):
- `runs-on: ubuntu-latest`; service container `amazon/dynamodb-local` on port 8000.
- Steps: checkout, pnpm setup, setup-node (`node-version-file: .nvmrc`, `cache: pnpm`), `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage` (env `DYNAMODB_ENDPOINT=http://localhost:8000`, plus fake `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION` for DynamoDB Local), `pnpm build`, `pnpm synth:prod`.
- Upload `coverage/` as an artifact.

**`ci.yml`:** `on: pull_request: branches: [main]`, calls `verify.yml`. `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.

**`deploy.yml`:** `on: push: branches: [main]` (+ `workflow_dispatch`).
- Job `verify`: `uses: ./.github/workflows/verify.yml`.
- Job `deploy`: `needs: verify`, `environment: production`, `permissions: { id-token: write, contents: read }`, `concurrency: { group: deploy-prod, cancel-in-progress: false }`.
  1. Checkout, pnpm, node, install, `pnpm build`.
  2. `aws-actions/configure-aws-credentials` with `role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}`, `aws-region: ${{ vars.AWS_REGION || 'us-east-1' }}`.
  3. `pnpm --filter @club/infra exec cdk deploy --all -c stage=prod --require-approval never --outputs-file cdk-outputs.json`.
  4. `pnpm --filter @club/api seed --stage prod --tenant all` (idempotent upsert of businesses and streaks; **no** demo data in prod).
  5. Write the `WebUrl` per tenant to `$GITHUB_STEP_SUMMARY`.

**One-time setup (document in README):** `cdk bootstrap aws://<account>/us-east-1`; deploy `GithubOidcStack` or create the role manually; set repo secret `AWS_DEPLOY_ROLE_ARN`, optional variable `AWS_REGION`; create the `production` environment.

---

## 11. Security and privacy

- **CI-only auth is a product requirement with known weakness:** CIs are semi-public. Mitigations (MUST): masked emails in all responses; no profile mutation endpoints; rewards are redeemable only by a cashier at POS (who MAY verify the physical cédula); HTTP API throttling; tenant-scoped JWTs. Recommend in README (future): email OTP step-up before showing reward codes.
- **POS key:** generated by CDK in Secrets Manager, never in source, never in the CloudFormation template, never logged. The UI stores it in `sessionStorage` only. Future: per-business keys and rotation.
- **PII (LOPDP):** collect only CI + email; record consent with policy version and channel; never put CI/email in URLs (POS lookups use POST bodies; registration prefill uses router state); mask in logs; DynamoDB encryption at rest; TLS everywhere via CloudFront. Follow-up (README): data export/deletion flow and retention policy.
- **Web:** private bucket with OAC only, security headers + CSP (§8), no inline scripts, no third-party runtime requests (self-hosted fonts).
- **Dependencies:** `pnpm audit --prod` informational step in `verify.yml` (non-blocking); Dependabot config for npm and GitHub Actions (weekly).

---

## 12. Seed and demo data

`packages/api/scripts/seed.ts` (run with `tsx`):

- Args: `--tenant ecoclub|farmaclub|all`, `--stage dev|prod` (resolves table names from CloudFormation outputs of `${stackPrefix}-${stage}` via `DescribeStacks`) **or** `--local` (uses `<tenant>-local-*` tables + `DYNAMODB_ENDPOINT`), `--demo` (refused when `stage=prod`).
- Always: upsert `Businesses` and `Streaks` from tenant config (validate with zod first, bump nothing automatically).
- `--demo` (relative to the current Guayaquil month M):
  - EcoClub `1700000001` (`demo.eco1@example.com`): Silver in M−2 and M−1, $12 in M. **A $3 purchase now unlocks the Silver choice reward** (demo moment).
  - EcoClub `1700000019`: $18 in M (reproduces the golden receipt message).
  - EcoClub `0900000001`: registered, no purchases.
  - FarmaClub `1700000027`: Gold in M−2 and M−1 across Medicity + Mascotas; $100 in M (a $20 purchase unlocks the Gold experience choice).
  - FarmaClub `0900000019`: Bronze in M at Wellderma only (cross-selling prompt).
  - Demo purchases are written through the **same service code path** as the POS endpoint (not raw table writes), so rewards are issued consistently.
- Prints the POS API key location (secret ARN), never the key itself, except with `--local` where it prints the dev key from `.env`.

---

## 13. Implementation plan (follow in order; each milestone ends green on `lint`, `typecheck`, `test`)

1. **Scaffold:** root workspace, tsconfig, ESLint/Prettier, Vitest projects, `.nvmrc`, `.gitignore`, docker-compose, empty packages with `typecheck`/`test` scripts. Commit.
2. **Shared domain:** CI, money, month, tiers, streaks, rewards, progress, receipt, tenant configs, schemas, tables + all §9.4 shared tests (including the golden test).
3. **API (memory driver):** env, container, middleware, routes, services, memory repos, HTTP tests.
4. **API (DynamoDB):** dynamo repos, `db:setup`, integration + concurrency tests, `lambda.ts`, seed script.
5. **UI:** theme + tenant modes, router, auth, landing, registration, login, dashboard, rewards, history, POS simulator, tests, a11y pass.
6. **Infra:** constructs, stack, assertions tests, `cdk synth` for both tenants and both stages.
7. **CI/CD:** workflows, Dependabot, optional OIDC stack.
8. **Docs:** README (overview, architecture diagram, local dev quick start, tenant onboarding guide "how to add a third tenant", deploy/bootstrap, API reference table, assumptions, future work).

Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `ci:`, `docs:`).

---

## 14. Acceptance criteria

1. `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm synth` all pass on a clean checkout (Node 22).
2. Local: with DynamoDB Local + seeded demo data, both tenants run (`dev` / `dev:farmaclub`), show their own name, colors, businesses, and tiers.
3. Registering `1700000035` + email via `/registro` lands on `/mi-club` showing "$0" and the gap to BRONCE.
4. In `/caja`, recording a $3 purchase for `1700000001` shows a receipt announcing the unlocked Silver reward with a code, and `/recompensas` (logged in as that CI) lists it under "Por elegir". Choosing a benefit moves it to "Disponibles", and redeeming the code in `/caja` moves it to "Usadas".
5. A purchase for unregistered `1700000043` with email registers the customer and counts the purchase in one call. Without email it returns `CUSTOMER_NOT_FOUND`.
6. Replaying the same `transactionId` doesn't change totals or issue rewards. 10 concurrent purchases issue each due reward exactly once (integration test).
7. The golden receipt message test passes verbatim, and the receipt renders at widths 32/40/48.
8. `cdk synth` produces `EcoClub-<stage>` and `FarmaClub-<stage>`, each with 6 tables, a private BPA bucket with OAC, CloudFront with `/api/*` → HTTP API → Lambda (Node 22, arm64), and no Route 53/ACM resources.
9. PR workflow runs verify; push to `main` deploys both tenants and seeds them; the job summary prints both CloudFront URLs.
10. No raw CI or email in logs; no unmasked email in any API response; no secrets in the repo or synthesized templates.

---

## 15. Assumptions and open questions

| # | Assumption (implemented) | Open question for the business |
|---|---|---|
| A1 | EcoClub = Farmacias Económicas league; FarmaClub = Wellness league | Confirm mapping and final display names |
| A2 | Rewards are cumulative across tiers (a Gold month also advances Bronze/Silver streaks) | Should only the highest tier's reward be granted? |
| A3 | "5% cashback" = single-use 5% discount on next purchase, valid until end of next month | Is it cash credit on monthly spend instead? |
| A4 | "or" rewards are customer's choice (`ONE_OF`) | Who chooses: customer or business? |
| A5 | Month-3 rewards repeat every 3 consecutive months (cycle restarts after unlock) | Should Gold perks renew monthly while Gold is maintained? |
| A6 | Gold Ahorro "one free delivery per month" = 3 monthly coupons after unlock | Duration of the free-delivery benefit |
| A7 | Purchase amount = net paid; returns not handled | Refund/return policy impact on streaks |
| A8 | Month boundaries use `America/Guayaquil` for all stores (including Galápagos) | Accept? |
| A9 | Vendix calls the POS API with a tenant-wide key and `x-business-id` | Vendix integration capabilities (webhooks, retries, receipt template limits, column width) |
| A10 | No emails are sent; digital receipt text is returned to POS for inclusion | Is SES/email delivery needed later (requires a domain)? |
| A11 | Tier thresholds: lower-inclusive (e.g., exactly $15 = Silver) | Confirm |
