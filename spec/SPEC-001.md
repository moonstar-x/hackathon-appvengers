# SPEC-001: SmartClub 2.0. Drift Spec from SPEC-000 (Club Rachas)

> **Amends:** [SPEC-000](SPEC-000.md) (Club Rachas v1.0), as implemented at commit `1fd8eaa`.
> **Audience:** an autonomous coding agent changing the existing repository (not a rewrite).
> **Status:** v1.0 draft (2026-10-08).
> **Precedence:** where SPEC-001 and SPEC-000 conflict, SPEC-001 wins. Everything in SPEC-000 not changed here still applies: CI validation, month/tier/streak rules, reward issuance, idempotency, concurrency guarantees, security posture, tooling and coverage thresholds.
> **Keywords:** **MUST** = required for acceptance; **SHOULD** = expected unless there is a concrete reason not to; **MAY** = optional.

---

## 0. Drift at a glance

| ID  | Topic             | SPEC-000 / current implementation                                                                                     | SPEC-001 target                                                                                                                      |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Deployment model  | Two tenants (EcoClub, FarmaClub). Each tenant has its own CDK stack, tables, secrets, UI build and customer database. | **One instance.** One stack `SmartClub-<stage>`, one table set, one UI build, **one customer record (and login) per cédula**.        |
| D1  | Streak scope      | One active streak per tenant.                                                                                         | Several **ligas** (streak definitions) in one catalog. Each liga covers one business or a group of businesses.                       |
| D2  | Name and brand    | "EcoClub" / "FarmaClub", Farmaenlace palette, Poppins + Roboto.                                                       | **"SmartClub 2.0"** with the smartclub.ec palette and design language, using Source Sans 3 + Work Sans.                              |
| D3  | Discount rewards  | Percent discounts have no ceiling. The POS applies them without the system's involvement.                             | Every percent discount has a **`maxDiscountCents` cap**. Redemption takes the ticket amount and returns the exact discount to apply. |
| D4  | Registration data | Cédula + email required.                                                                                              | **Cédula is the only required field.** Email is optional everywhere. Consent stays mandatory.                                        |
| —   | Customer session  | JWT `tid` claim per tenant.                                                                                           | JWT `iss` = `aud` = `smartclub`; one session covers every liga.                                                                      |
| —   | Reward codes      | `ECO-XXXXXXXX` / `FRM-XXXXXXXX`.                                                                                      | New codes use the `SC-XXXXXXXX` format. Legacy `ECO-`/`FRM-` codes stay valid.                                                       |
| —   | Version           | `1.0.0`                                                                                                               | `2.0.0`                                                                                                                              |

---

## 1. Baseline: what the code does today

The implementation follows SPEC-000. Tenancy is spread over ~45 files (Appendix A). Two kinds of change follow from D1:

1. **Mechanical removal** of the tenant layer (`TenantId`, `TENANTS`, `TENANT_ID`, `VITE_TENANT`, `--tenant` flags, per-tenant stacks, storage keys and build modes).
2. **Latent defects** that only stay hidden while each instance has exactly one streak. Once two ligas share one instance, they **MUST** be fixed:

| Location                                                     | Current behavior                                                              | Failure in a single instance                                                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `packages/api/src/services/progress-service.ts:39`           | Filters a receipt's `newRewards` by `tierId`                                  | Both ligas have BRONZE/SILVER/GOLD, so a receipt can list the other liga's rewards. Filter by `streakId` instead. |
| `packages/api/src/services/progress-service.ts:50`           | The receipt's primary streak is `progress[0]` in DynamoDB scan order          | Non-deterministic when a business belongs to more than one liga.                                                  |
| `packages/api/src/services/progress-service.ts:55`           | `history()` reads only `streaks[0]`                                           | History for the second liga is lost.                                                                              |
| `packages/api/src/services/reward-service.ts:93`             | Redemption checks only `benefit.businessIds`                                  | A Liga Ahorro reward could be redeemed at Medicity (§2.1 rule 3).                                                 |
| `packages/shared/src/schemas/index.ts:153`                   | The code regex hardcodes `ECO\|FRM`                                           | Rejects new `SC-` codes.                                                                                          |
| `packages/api/src/services/purchase-service.ts:31`           | Having an `email` is the signal to register and the implied consent           | Email becomes optional (D4), so this signal disappears.                                                           |
| `packages/api/src/lib/jwt.ts:12,24`                          | `tid` claim checked against the tenant                                        | No tenant exists any more.                                                                                        |
| `packages/ui/src/pages/Dashboard.tsx:31,72`                  | Renders `progress[0]` only. "Visitaste X de N" counts all program businesses. | Second liga is hidden. N becomes 5 instead of the liga's own count.                                               |
| `packages/ui/src/pages/Landing.tsx:142`, `History.tsx:30,55` | Use `streaks[0]` only                                                         | Second liga is hidden.                                                                                            |

---

## 2. D1: Single instance

### 2.1 Concepts and rules (normative)

| Term         | Definition                                                                                                                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Program**  | The single SmartClub 2.0 instance. Exactly one per stage.                                                                                                                                                                    |
| **Business** | A participating brand: Farmacias Económicas, Medicity, Wellderma, Mascotas, Ambiente.                                                                                                                                        |
| **Liga**     | A `StreakDefinition`. Its `businessIds` define its scope: **one business** (single-business liga) or **several** (business group). There is no separate business-group entity: the liga's `businessIds` list _is_ the group. |
| **Customer** | One record per CI for the whole program. One CI login shows every liga. Membership is implicit: a registered customer participates in every active liga, with no per-liga enrollment.                                        |

1. A purchase at business B counts toward **every active liga whose `businessIds` include B** (unchanged from SPEC-000 §2.5). A business **MAY** belong to several ligas. Monthly totals, tiers, streaks and rewards are computed **per liga** and are never summed across ligas.
2. Reward instance IDs already embed `streakId` (SPEC-000 §2.8), so issuance stays exactly-once per liga with no change.
3. **Redemption scope (new, MUST).** A reward can be redeemed only at the businesses in `benefit.businessIds` when that is set, otherwise at its issuing liga's `businessIds`. Any other business gets `409 REWARD_NOT_REDEEMABLE` with reason `WRONG_BUSINESS`. The schema **MUST** enforce `benefit.businessIds ⊆ liga.businessIds`.
4. **Deterministic order (new, MUST).** Each liga has a unique `displayOrder`. Every list (program DTO, progress, history, landing, POS) is sorted by `displayOrder`, then `streakId`. A purchase receipt's **primary liga** at business B is the first active liga in that order containing B.
5. The printed/digital receipt shows the primary liga only, with the new rewards whose `streakId` matches it. The purchase response still returns `progress[]` for every liga containing B and `newRewards` from all of them.

### 2.2 Catalog (seed configuration)

Replace `packages/shared/src/tenants/` with `packages/shared/src/program/`:

```
program/
├── types.ts       # types moved from tenants/types.ts; TenantId/TenantConfig removed
├── smartclub.ts   # export const PROGRAM: ProgramConfig
└── index.ts       # export { PROGRAM }, export * from './types'
```

```ts
export interface ProgramConfig {
  id: 'smartclub';
  displayName: string; // 'SmartClub 2.0': titles, wordmark, metadata, consent copy
  shortName: string; // 'SmartClub': receipt title and welcome sentence
  stackName: string; // 'SmartClub' → stack id `SmartClub-<stage>`
  groupName: 'Farmaenlace';
  tagline: string;
  rewardCodePrefix: 'SC';
  theme: ThemeTokens; // §3.3
  businesses: BusinessDefinition[];
  streaks: StreakDefinition[]; // the ligas
}

export interface StreakDefinition {
  // ...all SPEC-000 §4.1 fields, plus:
  name: string; // ≤ 20 chars so the receipt title fits 32 columns (§2.3)
  displayOrder: number; // NEW: unique integer ≥ 0
}
```

**Businesses:** all five businesses from SPEC-000 §2.11, with the same `businessId`s, names and categories, in one list.

**Ligas:**

| `streakId`      | `name`        | `displayOrder` | `businessIds`                                   | Tiers and rewards                                                 | `version` |
| --------------- | ------------- | -------------- | ----------------------------------------------- | ----------------------------------------------------------------- | --------- |
| `liga-ahorro`   | Liga Ahorro   | 1              | `farmacias-economicas`                          | As implemented in `tenants/ecoclub.ts`, plus the D3 caps (§4.4)   | 2         |
| `liga-wellness` | Liga Wellness | 2              | `medicity`, `wellderma`, `mascotas`, `ambiente` | As implemented in `tenants/farmaclub.ts`, plus the D3 caps (§4.4) | 2         |

`streakId`, `tierId`, `rewardId` and `benefitId` values **MUST NOT** change. Reward instance IDs and the migration (§8) depend on them.

Adding a liga is a **data-only change** that needs no code. Example: a single-business liga for Mascotas:

```ts
{ streakId: 'liga-mascotas', name: 'Liga Mascotas', displayOrder: 3,
  businessIds: ['mascotas'], tiers: [/* ... */], active: true, version: 1, /* ... */ }
```

`programConfigSchema` (it replaces `tenantConfigSchema`) **MUST** enforce:

- unique `businessId`s, `streakId`s and `displayOrder`s;
- every liga `businessIds` entry exists in `businesses`;
- every `benefit.businessIds` is a subset of its liga's `businessIds`;
- liga `name` is 20 characters or fewer;
- every SPEC-000 streak invariant, plus the D3 benefit invariants (§4.1).

### 2.3 Shared package

- `types.ts`: remove `TenantId` and `TenantConfig`. Add `ProgramConfig` and `StreakDefinition.displayOrder`. Add `ProgressSummary.businessIds: string[]` (the liga's businesses, for "Visitaste X de N"). Add `CustomerRewardDto.streakId`, `streakName` and `redeemableAt: string[]` (business IDs from §2.1 rule 3; for `PENDING_CHOICE`, the union across options).
- `ProgramDto` becomes `{ program: { id, displayName, shortName, tagline }, streaks: StreakDefinition[] /* active, sorted */, businesses: BusinessDefinition[] }`.
- `rewardDto(r, now, liga?)` resolves `streakName` and `redeemableAt` from the liga definition. When the liga is unknown it falls back to `streakId` and `benefit.businessIds ?? []`.
- `codeSchema`: `^(SC|ECO|FRM)-[0-9A-HJKMNP-TV-Z]{8}$`. New codes always use `SC`. Legacy prefixes stay accepted for migrated rewards.
- `tables.ts`: `localTableNames()` takes no argument and returns `smartclub-local-<LogicalName>`.
- **Receipt:** the title becomes `{SHORTNAME} - {LIGA NAME}`, uppercased and ASCII-folded (e.g., `SMARTCLUB - LIGA AHORRO`). `buildProgressMessage` takes `brandName` (the program's `shortName`) and `ligaName` in place of `displayName`. The welcome sentence becomes `¡Bienvenido a SmartClub! …`. All other sentence rules from SPEC-000 §2.10 are unchanged.

**Golden tests (replace SPEC-000 §2.10).** The `message` stays **verbatim** as in SPEC-000. Only the title line of the width-40 block changes (23 characters, so the left padding is `floor(17/2) = 8`):

```
----------------------------------------
        SMARTCLUB - LIGA AHORRO
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

### 2.4 API

- **`config/env.ts`:** remove `TENANT_ID`. Local defaults are `smartclub-local-*`. Everything else is unchanged.
- **`container.ts`:** use `PROGRAM` (and seed `PROGRAM.businesses` and `PROGRAM.streaks` for the memory driver). The reward code prefix comes from `PROGRAM.rewardCodePrefix`.
- **`lib/jwt.ts`:** issue `{ sub: ci }` with `iss: 'smartclub'`, `aud: 'smartclub'`, HS256, 30 days. Verification **MUST** require that issuer and audience. Tokens without them (including legacy `tid` tokens) return 401.
- **`ProgressService.get`:** sort ligas (§2.1 rule 4). Filter `newRewards` per liga by `streakId`. Use the first liga containing the business as the receipt's primary.
- **`ProgressService.history`:** return every active liga (§6).
- **`RewardService.redeem`:** enforce redemption scope (§2.1 rule 3) and D3 (§4.2).
- **`requirePos`:** unchanged. The business must exist, be active and belong to at least one active liga.
- `server.ts` startup log: `{ port }` with message `SmartClub API ready`. Remove the `tenant` field.

### 2.5 UI

- **One build:** remove `.env.ecoclub` and `.env.farmaclub`, `--mode <tenant>` and `dist/<tenant>`. `vite build` outputs `dist/`. Public metadata lives in `packages/ui/.env` (`VITE_APP_TITLE`, `VITE_APP_DESCRIPTION`, `VITE_THEME_COLOR`; public values only). In `.gitignore`, replace the two `!packages/ui/.env.<tenant>` exceptions with `!packages/ui/.env`. Remove `VITE_TENANT` everywhere, including `vitest.config.ts`.
- `theme.ts` exports `program = PROGRAM` and `applyTheme(PROGRAM)`.
- **Storage keys:** `smartclub-session` (localStorage) and `smartclub-pos` (sessionStorage).
- **Landing (`/`):** add a "Ligas" section with one tab per liga (`role="tablist"`). Each tab shows the liga name, its businesses ("Medicity, Wellderma, Mascotas y Ambiente") and its tier cards. "Marcas smart" (§3.5) groups business tiles by liga.
- **Dashboard (`/mi-club`):** add a summary strip with one compact card per liga (name, month total, tier badge, gap to next tier) and a `tablist` that opens one liga's detail: progress bar, `StreakTracker`, "Así sale en tu factura", and "Visitaste X de N marcas" with N = `summary.businessIds.length`. The default tab is the liga with the highest total this month (ties go to `displayOrder`). A liga with no purchases in the look-back window shows "Aún no compras en esta liga" plus its businesses (cross-selling prompt).
- **Rewards (`/recompensas`):** keep the status tabs and add liga filter chips (Todas / one per liga). `RewardCard` shows the liga name, "Canjeable en: {business names}" and the cap line from D3.
- **History (`/historial`):** add a liga `tablist`. Bars and threshold lines use the selected liga's tiers. The purchase list covers all ligas and shows the business name.
- **POS (`/caja`):** the gate lists all five businesses. The header shows the business and its ligas. A `WRONG_BUSINESS` result shows "Este código se canjea en: {names}".

### 2.6 Infrastructure

- `bin/app.ts` creates exactly one `ClubStack` with id `SmartClub-<stage>`. Remove the `tenants` context. If it is passed, fail with `"-c tenants" was removed in SPEC-001`. `ClubStackProps` becomes `{ program: ProgramConfig; stage; webAssetPath? }` with the default `../ui/dist`.
- Tags: `app=smartclub` and `stage`. Lambda env: remove `TENANT_ID`.
- HTTP API stage throttling becomes **rate 100, burst 200**. One API now serves the combined traffic of the two previous APIs (50/100 each).
- Outputs keep the same keys (`WebUrl`, `ApiUrl`, table names, secret ARNs).
- **GitHub OIDC stack:** keep the construct id `Club-GithubOidc`. Renaming it would try to create a second `token.actions.githubusercontent.com` provider, which AWS rejects (one per URL per account). Change the `DescribeStacks` and table `PutItem`/`BatchWriteItem` resource patterns to `SmartClub-*`. The `EcoClub-*` and `FarmaClub-*` patterns **MAY** stay until the old stacks are removed (§8.3). An operator **MUST** redeploy this stack manually before the first CI deploy of `SmartClub-prod`.

### 2.7 Scripts, CI/CD and naming

- Root `package.json`: `name: "smartclub"`. `dev` runs the API and UI together. Remove `dev:ecoclub` and `dev:farmaclub`. `build` builds the single UI.
- The internal workspace scope `@club/*` **stays**. It is not user-facing, and renaming it would only add churn to imports.
- `seed`: remove `--tenant`. It reads outputs from `SmartClub-<stage>` (or `--local`) and keeps `--demo`, which is still refused for `--stage prod`. `db:setup`: remove `--tenant`.
- `deploy.yml`: run `pnpm --filter @club/api seed --stage prod`. `deployment-summary.mjs` prints one link titled "SmartClub 2.0".
- **Demo data (replaces SPEC-000 §12 `--demo`, relative to the current month M):**

| CI           | Email                     | Seeded activity                                                                          | Demo moment                                                                                                                             |
| ------------ | ------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `1700000001` | `demo.socio1@example.com` | Ahorro: Plata in M−2 and M−1, $12 in M                                                   | $3 at Farmacias Económicas unlocks the Plata choice. The Bronze 5% code (cap $1) demonstrates D3: a $50 ticket yields a $1,00 discount. |
| `1700000019` | —                         | Ahorro: $18 in M                                                                         | Golden receipt. Customer has no email.                                                                                                  |
| `0900000001` | —                         | Registered, no purchases                                                                 | CI-only registration.                                                                                                                   |
| `1700000027` | `demo.socio2@example.com` | Wellness: Oro in M−2 and M−1 across Medicity + Mascotas, $100 in M. **Ahorro: $8 in M.** | **One login, two ligas.** $20 at Medicity unlocks the Oro choice. $2 at Económicas reaches Bronce in Ahorro.                            |
| `0900000019` | —                         | Wellness: Bronce at Wellderma only                                                       | Cross-selling prompt.                                                                                                                   |

`1700000035` and `1700000043` stay unregistered for the registration flows.

---

## 3. D2: SmartClub 2.0 brand and design language

### 3.1 Naming and copy

- **"SmartClub 2.0"** (`displayName`) is used in `<title>`, Open Graph tags, the wordmark `aria-label`, the landing hero, "Bienvenido a SmartClub 2.0" on `/registro`, the privacy notice and the consent scripts.
- **"SmartClub"** (`shortName`) is used where space or tone calls for it: the receipt title and the welcome sentence.
- **Wordmark:** lowercase text **smart** (700) + club (400), followed by a small "2.0" pill badge. Drop the "por Farmaenlace" line. In running text the name is always written "SmartClub 2.0".
- **Tone:** follow smartclub.ec. Use "smart" as an adjective in section titles ("Marcas smart", "Beneficios smart"), short warm sentences, informal "tú". **Write original copy.** Do not reuse smartclub.ec slogans verbatim. Draft tagline: "Tus compras suman. Tu constancia gana." (open question B5).
- Footer: `© {year} SmartClub 2.0 · Ecuador`, plus the Privacidad and Acceso caja links.

### 3.2 Source palette (extracted 2026-10-08 from computed styles on https://smartclub.ec)

| Source color | Hex                   | Where it appears on the site                  |
| ------------ | --------------------- | --------------------------------------------- |
| Smart orange | `#ff3e00`             | Header, footer, step 1, main brand surface    |
| Orange       | `#ff6700` / `#ff5d00` | Hero gradient bands, "Mi Cashback" text       |
| Amber        | `#fe9c01`             | Lightest hero arcs, accent borders            |
| Magenta      | `#ff009e`             | "Únete al club" band, "Marcas smart" heading  |
| Raspberry    | `#da1375`             | Section headings on cream                     |
| Burgundy     | `#9e0412`             | Step 2, CTA text on cream pills, promo card   |
| Cream        | `#f9f4e1`             | Page background; body text on orange          |
| Cream strong | `#f7f1d6`             | Pill buttons, borders                         |
| Ink          | `#171717`             | App section background, body text (70% alpha) |

Typography on the site: **Source Sans 3** (300 body and display, 700 emphasis) and **Work Sans** (500, uppercase, ~1px tracking for navigation; 700 for CTAs).

### 3.3 Design tokens (replace SPEC-000 §7.1 token sets)

The token _names_ stay, so components keep using semantic classes. Only the values change, and a few tokens are added. All ratios below were computed with the WCAG 2.1 formula.

| Token                                             | Value                                                         | Rule                                                                                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--brand-primary`                                 | `#ff3e00`                                                     | Header and footer bars, hero, progress fill, step 1. Text on it: `--ink` at any size (5.07:1). Cream or white **only for large text** (3.21:1 / 3.53:1). Never used as a text color on cream. |
| `--brand-primary-strong`                          | `#b83300`                                                     | Primary buttons, links, small brand text. 5.43:1 on cream, 5.98:1 on white. Cream text on it: 5.43:1.                                                                                         |
| `--brand-on-strong`                               | `#f9f4e1`                                                     | Text on `primary-strong`, `brand-deep`, `brand-secondary` and `brand-dark`.                                                                                                                   |
| `--brand-secondary`                               | `#b80f62`                                                     | Headings h1–h3 (5.80:1 on cream). This is a deeper shade of the site's raspberry `#da1375`, which reaches only 4.40:1 and is therefore large-text only.                                       |
| `--brand-accent`                                  | `#ff009e`                                                     | Decorative bands and chevron segments. Ink text on it is fine (4.91:1). Never used as a text color.                                                                                           |
| `--brand-deep` (new)                              | `#9e0412`                                                     | CTA text on cream pills (7.46:1), chevron step 2, tiles. Cream on it: 7.68:1.                                                                                                                 |
| `--brand-warm` (new)                              | `#fe9c01`                                                     | Hero arcs and decorative borders only (1.91:1 on cream). Ink text on it: 8.51:1.                                                                                                              |
| `--brand-soft`                                    | `#f7f1d6`                                                     | Soft cards and header pills.                                                                                                                                                                  |
| `--brand-dark` (new)                              | `#171717`                                                     | Dark bands (receipt callout, POS receipt frame). Cream text: 16.27:1.                                                                                                                         |
| `--brand-gradient`                                | `linear-gradient(135deg,#ff3e00 0%,#ff6700 60%,#fe9c01 100%)` | Decorative hero backgrounds only. **Text over it MUST be `--ink`.** Cream on `#ff6700` is 2.65:1 and fails.                                                                                   |
| `--surface`                                       | `#f9f4e1`                                                     | Page background (cream, replacing white).                                                                                                                                                     |
| `--surface-raised` (new)                          | `#ffffff`                                                     | Cards and form panels.                                                                                                                                                                        |
| `--surface-muted`                                 | `#f7f1d6`                                                     | Muted panels.                                                                                                                                                                                 |
| `--ink`                                           | `#171717`                                                     | Body text (16.27:1 on cream).                                                                                                                                                                 |
| `--ink-muted`                                     | `#57534e`                                                     | Secondary text (6.92:1 on cream).                                                                                                                                                             |
| `--line`                                          | `#857b74`                                                     | Input borders (3.75:1 on cream, 4.13:1 on white; meets the 3:1 non-text minimum).                                                                                                             |
| `--line-subtle`                                   | `#e6dcc0`                                                     | Decorative dividers and progress track.                                                                                                                                                       |
| `--danger`                                        | `#c8102e`                                                     | Errors (5.34:1 on cream).                                                                                                                                                                     |
| `--success`                                       | `#1d7a3e`                                                     | Confirmations (4.88:1 on cream).                                                                                                                                                              |
| `--tier-bronze` / `--tier-silver` / `--tier-gold` | unchanged                                                     | Chip text is `--ink` (≥ 5.3:1). Chips **MUST** have a 1px `--ink` border, because silver and gold against cream are below 3:1.                                                                |

Focus indicators use `--ink` (16.27:1 on cream, 5.07:1 on orange) and replace the `outline-secondary` focus ring. **Rule of thumb:** on any orange or amber surface, text below 24px (or below 18.66px bold) is `--ink`.

### 3.4 Typography

- Replace `@fontsource/poppins` and `@fontsource/roboto` with **`@fontsource/source-sans-3`** (300, 400, 700) and **`@fontsource/work-sans`** (500, 700). Fonts stay self-hosted, with no third-party requests (CSP unchanged).
- `--font-display` and `--font-sans` are Source Sans 3. New `--font-label` is Work Sans, uppercase, `letter-spacing: 0.06em`, used for navigation, eyebrows, tabs and chips.
- **Mixed-weight display headings**, the site's signature style: a light (300) phrase with one or two bold (700) keywords, e.g. `Tus compras <strong>suman</strong>. Tu constancia <strong>gana</strong>.`. Weight 300 is allowed only at 32px and above.
- Keep the **18px base** (`html { font-size: 112.5% }`) and 400-weight body text from SPEC-000. The site's 15px, 300-weight body text is too faint for this program's older-adult audience.

### 3.5 Shapes and motifs

1. **Header:** a solid `--brand-primary` bar. The wordmark is cream at large size. Actions are cream pills (radius 11px) with `--brand-deep` text, mirroring the site's "Mi Cashback" button.
2. **Hero:** a `--brand-primary` field with sweeping concentric **arc bands** in `#ff6700` and `--brand-warm`, drawn as an **original inline SVG**. Arcs sit only outside text areas or under `--ink` text. The headline is large cream text in mixed weight. The CTA is a full pill (radius 999px), cream with `--brand-deep` bold text and a "›" chevron.
3. **Surfaces:** cream page. Cards use `--surface-raised` with radius 20px and at most a subtle `0 1px 2px` shadow.
4. **Chevron step strip** ("Cómo funciona"): three arrow-shaped segments in `--brand-primary`, `--brand-deep` and `--brand-soft`, each with a large numeral, built with `clip-path` in the stylesheet. Below 640px the segments stack vertically as rounded blocks.
5. **Squircle tiles** ("Marcas smart", benefit icons): squares with `border-radius: 30%` and solid fills cycling through `--brand-primary-strong`, `--brand-deep`, `--brand-secondary` and `--brand-dark`, with cream text (≥ 5.43:1). Businesses appear as **text names, not logos**.
6. **Dark band:** `--brand-dark` with cream text for "Así sale en tu factura" and the POS receipt frame.
7. **Buttons** (min-height 48px, unchanged):
   - primary: `--brand-primary-strong` pill with cream text;
   - on orange surfaces: cream pill with `--brand-deep` text;
   - secondary: transparent pill with a 2px `--brand-deep` border;
   - ghost: unchanged.
8. **Assets:**
   - **Do not copy, hotlink or embed** logos, photos, illustrations or background images from smartclub.ec.
   - The favicon becomes an original `packages/ui/public/favicon.svg` (orange rounded square with a cream lowercase "s"). Delete `public/tenants/*`.
   - If official SmartClub assets are supplied later, they go in `packages/ui/public/brand/`.
9. `index.html`: title `SmartClub 2.0`, `theme-color` `#ff3e00`, Open Graph values from `packages/ui/.env`, `lang="es-EC"`.

No hard-coded hex values in components (unchanged).

---

## 4. D3: Discount caps

**Goal:** a customer must not be able to earn a percentage reward with a small monthly spend and then redeem it on a high ticket for an outsized discount.

### 4.1 Model and invariants

```ts
export interface BenefitDefinition {
  // ...SPEC-000 fields, plus:
  maxDiscountCents?: number; // NEW: integer, 1..1_000_000
}
```

The schema invariants (in `benefitSchema`) **MUST** hold:

| `type`                                      | `percent` | `amountCents`              | `maxDiscountCents` |
| ------------------------------------------- | --------- | -------------------------- | ------------------ |
| `PERCENT_DISCOUNT`, `SPECIAL_DAYS_DISCOUNT` | required  | forbidden                  | **required**       |
| `FIXED_DISCOUNT`                            | forbidden | required (it _is_ the cap) | forbidden          |
| all others                                  | forbidden | forbidden                  | forbidden          |

Benefits are snapshotted at issuance (SPEC-000 §2.8), so a cap change affects only rewards issued afterwards.

### 4.2 Discount computation (shared, pure)

Add `packages/shared/src/domain/discounts.ts`:

```ts
export interface DiscountResult {
  purchaseAmountCents: number; // gross ticket before this reward
  discountCents: number; // exact amount the POS MUST deduct
  capCents: number; // maxDiscountCents (percent) or amountCents (fixed)
  capped: boolean; // true when the cap, not the percent, set the value
}
export function isDiscountBenefit(b: BenefitDefinition): boolean;
export function computeDiscount(b: BenefitDefinition, purchaseAmountCents: number): DiscountResult;
```

- **Percent:** `raw = Math.floor(purchaseAmountCents * percent / 100)` in integer math (inputs are at most 10⁶ × 100). `discountCents = min(raw, maxDiscountCents)` and `capped = raw > maxDiscountCents`.
- **Fixed:** `discountCents = min(amountCents, purchaseAmountCents)` and `capped = false`. A coupon never makes a ticket negative.
- Throws for non-discount benefits.

| Benefit       | Ticket | `discountCents` | `capped`                                             |
| ------------- | ------ | --------------- | ---------------------------------------------------- |
| 5%, cap 100   | 1000   | 50              | false                                                |
| 5%, cap 100   | 2000   | 100             | false                                                |
| 5%, cap 100   | 5000   | 100             | true                                                 |
| 5%, cap 100   | 19     | 0               | false (redemption rejects with `PURCHASE_TOO_SMALL`) |
| 25%, cap 1250 | 4000   | 1000            | false                                                |
| 25%, cap 1250 | 50000  | 1250            | true                                                 |
| fixed 200     | 150    | 150             | false                                                |
| fixed 200     | 1000   | 200             | false                                                |

### 4.3 Redemption API

- **`POST /api/pos/rewards/lookup`** body: `{ code, purchaseAmountCents? }`. It returns the DTO plus `discount?: DiscountResult` (a preview) when the resolved benefit is a discount and an amount was given. It never changes state.
- **`POST /api/pos/rewards/redeem`** body: `{ code, transactionId?, benefitId?, purchaseAmountCents? }`, where `purchaseAmountCents` is an integer in `1..1_000_000`. Validation runs in this order:
  1. Body schema check, then lookup (`404 REWARD_NOT_FOUND`).
  2. Existing state checks: `ALREADY_REDEEMED`, `EXPIRED`, `NOT_YET_VALID`.
  3. Resolve the benefit: the chosen one, or `benefitId` for `PENDING_CHOICE` (otherwise `PENDING_CHOICE`).
  4. Scope check (§2.1 rule 3): `WRONG_BUSINESS`.
  5. If the benefit is a discount:
     - a missing amount returns **`400 PURCHASE_AMOUNT_REQUIRED`** (new error code);
     - otherwise compute the discount; `discountCents === 0` returns `409 REWARD_NOT_REDEEMABLE` with the new reason **`PURCHASE_TOO_SMALL`**, so the code is not burned for nothing.
  6. Conditional update (unchanged) that also stores `redeemedPurchaseAmountCents` and `appliedDiscountCents`.
- The response is the DTO plus `discount?: DiscountResult`. For non-discount benefits, `purchaseAmountCents` is ignored and not stored.
- **Legacy snapshots** (rewards issued before this change, without `maxDiscountCents`): redemption takes the cap from the current liga definition for the same `(streakId, rewardId, benefitId)`. If none exists, it fails with `500 INTERNAL_ERROR` and logs `invalid reward snapshot`. An uncapped percent is **never** applied.
- **POS flow (document in README):** redeem first, deduct `discountCents` from the ticket, then record the purchase with the **net** amount (assumption A7 unchanged).

### 4.4 Seed values

Rule of thumb for the caps: `cap = percent × (2 × tier.minMonthlyCents)`. These values are pending business confirmation (B3).

| Liga     | Tier   | `benefitId`       | Percent | `maxDiscountCents` | Title (≤ 40)                   | `receiptTeaser` (when the tier's teaser mentions it) |
| -------- | ------ | ----------------- | ------- | ------------------ | ------------------------------ | ---------------------------------------------------- |
| Ahorro   | BRONZE | `cashback`        | 5       | 100                | `5% de cashback, hasta $1`     | `5% de cashback (hasta $1) en tu próxima compra`     |
| Ahorro   | GOLD   | `dias-especiales` | 25      | 1250               | `Hasta 25% en Días Especiales` | unchanged (`un cupón de envío a domicilio gratis`)   |
| Wellness | BRONZE | `cashback`        | 5       | 300                | `5% de cashback, hasta $3`     | `5% de cashback (hasta $3) y un café de cortesía`    |

Descriptions state the cap in full, e.g. "5% de descuento en tu próxima compra, con un máximo de $1. Un solo uso." The golden test is unaffected: it uses the Ahorro Gold teaser.

### 4.5 UI

- `RewardCard` and the landing tier cards show "Descuento máximo: $1" for discount benefits (via `formatMoney`).
- POS **Canje**: after the lookup, if the resolved benefit (or the selected option) is a discount, show a required "Monto de la compra ($)" field (`dollarsToCents`). The local preview **MAY** use `computeDiscount`, but the redeem response is authoritative and shown as "Descuento a aplicar: $1,00 · tope alcanzado".

---

## 5. D4: Optional email

### 5.1 Rules

- **The cédula is the only required data field.** Email is optional in self-service, assisted registration and purchase-time registration.
- **Consent stays mandatory** (LOPDP). The web checkbox and the cashier's verbal confirmation are legal acceptance, not data fields. Do not remove them.
- When email is provided, validation is unchanged (trim, lowercase, ≤ 254, valid). A blank or whitespace-only string means _absent_.
- No profile editing (unchanged). A customer who registers without email cannot add one in this version (B7). Assisted registration still **never** overwrites an existing customer.

### 5.2 Schemas and API

```ts
export const optionalEmailSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  emailSchema.optional(),
);
registrationSchema = { ci, email: optionalEmailSchema, acceptPrivacyPolicy: z.literal(true), source? };
posCustomerSchema  = { ci, email: optionalEmailSchema, acceptPrivacyPolicy: z.literal(true) };
purchaseSchema     = { /* SPEC-000 fields without `email` */,
  registration: z.object({ acceptPrivacyPolicy: z.literal(true), email: optionalEmailSchema }).optional() };
```

- **Purchase step 2 (replaces SPEC-000 §6.5 step 2):** resolve the customer by CI.
  - If the customer is missing and `registration` is present, register them (`channel = POS`, `consent.channel = POS_VERBAL`, email if given) and set `registeredNow = true`.
  - If the customer is missing and `registration` is absent, return `404 CUSTOMER_NOT_FOUND`.
  - If the customer exists, ignore `registration` entirely.
  - A legacy top-level `email` is stripped by zod. Without `registration`, an unknown CI therefore gets 404, so registration without explicit consent cannot happen.
- `Customer.email?: string`. The attribute is omitted in DynamoDB when absent (`removeUndefinedValues`).
- `CustomerDto.emailMasked: string | null`, and `customerDtoSchema` is updated to match. `customerDto()` calls `maskEmail` only when an email exists.
- `PRIVACY_POLICY_VERSION` **MUST** change (e.g., `2026-10-08.2`) because the notice text changes. Stored consent records keep their original version.

### 5.3 UI and copy

- `/registro`: CI (required); "Correo electrónico (opcional)" with no `required` attribute and the helper "Para ingresar solo necesitas tu cédula."; consent checkbox (required) reading "Acepto el uso de mi cédula (y de mi correo, si lo ingreso) para SmartClub 2.0 según la política de privacidad." Footnote: "Solo necesitas tu cédula. Sin costo de inscripción."
- **POS unknown customer:** "Correo (opcional)" field plus the script "¿Autoriza el uso de su cédula (y su correo, si lo da) para el programa SmartClub 2.0, según nuestra política de privacidad?" and a required "El cliente aceptó" checkbox. The request sends `registration: { acceptPrivacyPolicy: true, email? }`.
- Landing FAQ: add "¿Necesito correo? No. Solo tu cédula." Update the step copy to match.
- `/privacidad`: data collected is the cédula (required), email (optional) and purchases. It stays marked "pendiente de revisión legal".

---

## 6. API contract delta

| Endpoint                           | Change                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                  | `{ status: 'ok', app: 'smartclub', version: '2.0.0' }`. `tenant` is removed.                                           |
| `GET /api/program`                 | `{ program: { id, displayName, shortName, tagline }, streaks /* sorted */, businesses }`. `tenant` is removed.         |
| `POST /api/auth/register`          | `email` is optional. Tokens carry `iss`/`aud` = `smartclub`.                                                           |
| `POST /api/auth/login`             | Same token change.                                                                                                     |
| `GET /api/me`                      | `emailMasked: string \| null`                                                                                          |
| `GET /api/me/progress`             | Every active liga, sorted. `ProgressSummary.businessIds` is added.                                                     |
| `GET /api/me/history?months=6`     | `{ ligas: Array<{ streakId, streakName, months: Array<{ monthKey, monthLabel, totalCents, purchaseCount, tier }> }> }` |
| `GET /api/me/rewards`              | DTO adds `streakId`, `streakName` and `redeemableAt`. New codes start with `SC-`.                                      |
| `POST /api/pos/customers`          | `{ ci, acceptPrivacyPolicy: true, email? }`                                                                            |
| `POST /api/pos/customers/progress` | Body unchanged. Returns the ligas containing the POS business.                                                         |
| `POST /api/pos/purchases`          | `email` is removed. `registration?: { acceptPrivacyPolicy: true, email? }` is added (§5.2).                            |
| `POST /api/pos/rewards/lookup`     | `{ code, purchaseAmountCents? }` returns the DTO plus `discount?`.                                                     |
| `POST /api/pos/rewards/redeem`     | `{ code, transactionId?, benefitId?, purchaseAmountCents? }` returns the DTO plus `discount?`.                         |

New error code: `PURCHASE_AMOUNT_REQUIRED` (400). New `REWARD_NOT_REDEEMABLE` reason: `PURCHASE_TOO_SMALL`. `WRONG_BUSINESS` now also covers liga scope.

---

## 7. Data model delta

| Table                                               | Change                                                                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Customers`                                         | `email` becomes optional. Migrated records **MAY** carry `legacy: Array<{ tenant, createdAt, consent }>` (§8.2). No emails are stored in it. |
| `Streaks`                                           | Items gain `displayOrder`. Discount benefits gain `maxDiscountCents`. `name` becomes "Liga …". `version: 2`.                                 |
| `CustomerRewards`                                   | Adds `redeemedPurchaseAmountCents?` and `appliedDiscountCents?`. Benefit snapshots carry `maxDiscountCents`. New codes use the `SC-` prefix. |
| `Businesses`, `CustomerStreakProgress`, `Purchases` | No attribute change. All five businesses live in one table.                                                                                  |
| Physical                                            | One table set per stage in `SmartClub-<stage>`. Local names are `smartclub-local-<LogicalName>`. No new GSIs.                                |

---

## 8. Migration and rollout

### 8.1 Fresh environments

Deploy `SmartClub-<stage>` and seed it. No migration is needed.

### 8.2 Existing EcoClub/FarmaClub data (SHOULD, only if that data must be kept)

Add `packages/api/scripts/migrate-tenants.ts` (`pnpm --filter @club/api migrate:tenants --stage <dev|prod> [--apply]`). It is run **manually with operator credentials**, because the CI role lacks `Scan` on the old tables by design.

- Resolve the old (`EcoClub-<stage>`, `FarmaClub-<stage>`) and new (`SmartClub-<stage>`) table names from the stack outputs.
- **Dry run by default:** print counts and conflicts. Write only with `--apply`. Every write uses `attribute_not_exists`, so the script is safe to re-run.
- `Businesses` and `Streaks` are **not** copied: the v2 seed writes the catalog.
- **`Customers`:** merge by `ci` with a pure, unit-tested `mergeCustomers(records)`:
  - `createdAt` = earliest;
  - `registrationChannel`, `registeredAtBusinessId` and `consent` come from the earliest record;
  - `email` = the most recently created record that has one (otherwise absent);
  - `lastLoginAt` = latest;
  - `legacy` keeps every source's `{ tenant, createdAt, consent }` as consent evidence.
- **`CustomerStreakProgress`, `Purchases`:** copy verbatim. Their keys are disjoint across tenants because `streakId` and `businessId` differ. Assert this and abort on any collision.
- **`CustomerRewards`:** copy verbatim, keeping `ECO-`/`FRM-` codes. Check `byCode` in the new table before each put and abort on collision. For unredeemed discount rewards, backfill `maxDiscountCents` from the v2 definitions, including in `PENDING_CHOICE` options.
- Log counts only, never raw CIs or emails.

### 8.3 Cut-over

1. Redeploy `Club-GithubOidc` with the `SmartClub-*` patterns (§2.6).
2. Merge to `main`. CI deploys `SmartClub-prod` and seeds catalog v2.
3. If §8.2 applies:
   - stop POS traffic to the old APIs (delete or rotate the old POS key secrets);
   - run the dry run, then `--apply`;
   - compare counts per table.
4. Repoint the POS/Vendix configuration and QR material to the new `WebUrl`. Customers log in again with their CI: old JWTs fail because of the new secret and claims.
5. Decommission `EcoClub-*` and `FarmaClub-*` **manually** once old links and posters are replaced. Prod tables are retained and deletion-protected, so `cdk destroy` leaves them behind; delete them only after a final backup. CI never deletes them, and `cdk deploy --all` no longer references them.

### 8.4 Known risk: URLs change

There is no custom domain, so the CloudFront hostname changes, and printed QR posters and shared links point at the old domains. Before destroying the old distributions, operators **SHOULD** upload a static redirect page to each old bucket. A custom domain stays future work but would prevent a repeat.

---

## 9. Tests

Coverage thresholds are unchanged: shared ≥ 90%, API ≥ 80%, UI ≥ 60%.

**shared**

- `programConfigSchema`:
  - accepts `PROGRAM`;
  - rejects duplicate `streakId`/`displayOrder`/`businessId`, unknown liga businesses, `benefit.businessIds` outside the liga, and a liga name over 20 characters.
- Benefit invariants (§4.1): every allowed and forbidden combination.
- `computeDiscount`: the §4.2 table, plus a throw for non-discount benefits.
- Golden tests: the message (verbatim, unchanged) and the new block (§2.3). Every liga's title fits widths 32, 40 and 48.
- `codeSchema` accepts `SC-`, `ECO-` and `FRM-` and rejects others. `generateRewardCode('SC', …)` is covered.
- `tierForTotal` boundaries per liga (same values as SPEC-000 §9.4).
- `optionalEmailSchema`: blank → undefined, invalid → error.

**api (memory driver + supertest)**

- One login (`1700000027`):
  - `/me/progress` returns both ligas in `displayOrder`;
  - `/me/history` returns both;
  - `/me/rewards` mixes ligas with the correct `streakId`.
- Receipts with a fixture where one business belongs to two ligas: the primary is the lowest `displayOrder`, and the receipt lists only that liga's new rewards (regression for `progress-service.ts:39`).
- Registration without email returns 201 with `emailMasked: null`. `email: ''` is treated as absent; an invalid email returns 400.
- POS purchase for an unknown CI:
  - with `registration` and no email: 201, `registeredNow`;
  - without `registration`: 404;
  - with only a top-level `email`: 404.
- Redemption:
  - capped discount (`$50` ticket, 5% cap 100 → 100, `capped: true`);
  - `PURCHASE_AMOUNT_REQUIRED`;
  - `PURCHASE_TOO_SMALL`;
  - Ahorro code at Medicity → `WRONG_BUSINESS`;
  - a `PENDING_CHOICE` choice + redeem picking a discount option requires the amount;
  - a legacy `ECO-` reward without a snapshot cap uses the definition cap;
  - an undefined cap → 500.
- JWT: a token without `iss`/`aud`, or a legacy `tid` token, is rejected.
- `/api/health` and `/api/program` have no `tenant` key. Logs still contain no raw CI or email.
- `mergeCustomers` cases from §8.2. The migration dry run performs no writes (repository spy).

**api (DynamoDB Local integration):** update to the single table set. The concurrency and replay tests are unchanged. Add a round-trip for a customer without email.

**ui (Vitest + RTL + MSW)**

- `applyTheme(PROGRAM)` sets the §3.3 values. `packages/ui/.env` matches `PROGRAM` (title, description, `theme-color`).
- Registration succeeds with an empty email field.
- The dashboard renders a card per liga, the tab switch, and "Visitaste 1 de 4 marcas" for Wellness.
- `RewardCard` shows the liga, "Canjeable en" and "Descuento máximo".
- POS unknown customer shows an _optional_ email and a required consent checkbox, and sends `registration`.
- POS Canje of a discount reward requires the amount and shows the discount.

**infra**

- Synth emits exactly one app stack, `SmartClub-dev` / `SmartClub-prod`, with 6 tables, tag `app=smartclub`, no `TENANT_ID` in the Lambda env and throttle 100/200.
- `-c tenants=...` throws.
- The OIDC policy references `SmartClub-*`.
- All SPEC-000 §9.4 security assertions still hold.

---

## 10. Implementation plan (each milestone ends green on `lint`, `typecheck`, `test`)

1. **Shared:**
   - `program/` config and types;
   - schemas (program, benefit caps, optional email, purchase `registration`, lookup/redeem, `codeSchema`);
   - `discounts.ts`;
   - `rewardDto` and progress additions;
   - receipt title and the golden-test update;
   - delete `tenants/`.
2. **API:**
   - env, container, JWT, routes and services (§2.4, §4.3, §5.2);
   - demo data (§2.7), seed and `db:setup` without `--tenant`;
   - tests.
3. **UI:**
   - tokens, fonts, wordmark, favicon, metadata (§3);
   - multi-liga landing, dashboard, rewards and history (§2.5);
   - registration and POS changes (§4.5, §5.3);
   - tests.
4. **Infra and CI/CD:**
   - single stack, throttle, OIDC patterns;
   - workflows and deployment summary;
   - `pnpm synth` and `pnpm synth:prod`.
5. **Migration:** `migrate-tenants.ts` with dry-run, merge tests and runbook (§8).
6. **Docs:**
   - rewrite README for SmartClub 2.0: overview, `pnpm dev`, demo walkthrough (§2.7), API table (§6), "Add a liga" (replacing "Add a tenant"), redeem-then-record POS flow, cut-over runbook, assumptions;
   - add a one-line banner at the top of SPEC-000: "Amended by SPEC-001 (SmartClub 2.0)".

Use conventional commits, as in SPEC-000.

---

## 11. Acceptance criteria

1. `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm synth && pnpm synth:prod` pass on a clean checkout.
2. `git grep -niE "ecoclub|farmaclub|TENANT_ID|VITE_TENANT"` matches only `spec/`, `scripts/migrate-tenants.ts`, the OIDC transition patterns and legacy-code tests.
3. `cdk synth` produces exactly one application stack, `SmartClub-<stage>`, with 6 tables, a private BPA bucket with OAC, CloudFront → HTTP API → Lambda (Node 22, arm64), throttle 100/200, and no Route 53 or ACM resources.
4. Local `pnpm dev` with demo data: a **single login** as `1700000027` shows Liga Ahorro and Liga Wellness on `/mi-club`, each with its own total, tier and "Visitaste X de N".
5. Registering `1700000035` **without email** (consent checked) lands on `/mi-club` with $0 in every liga. `GET /api/me` returns `emailMasked: null`.
6. In `/caja`, a purchase for unregistered `1700000043` with consent and no email registers the customer and counts the purchase in one call. Without consent it returns `CUSTOMER_NOT_FOUND`.
7. Redeeming `1700000001`'s Bronze 5% code at Farmacias Económicas with a $50 ticket returns `discountCents: 100`, `capped: true`. With no amount it returns `PURCHASE_AMOUNT_REQUIRED`. At Medicity it returns `WRONG_BUSINESS`.
8. The golden message passes verbatim. The width-40 block matches §2.3. Every liga's receipt fits 32, 40 and 48 columns.
9. The UI shows "SmartClub 2.0" with the §3.3 tokens, self-hosted Source Sans 3 and Work Sans, no third-party requests, and the §3.3 contrast rules (verified by a token unit test plus a manual check of header, hero and buttons).
10. Legacy `ECO-`/`FRM-` codes can still be looked up and redeemed (test fixture).
11. No raw CI or email in logs; no unmasked email in responses; no secrets in the repo or synthesized templates (unchanged).

---

## 12. Assumptions and open questions

SPEC-000 A1 (tenant mapping) and A9 (tenant-wide POS key) are superseded by B1 and B6. A2–A8, A10 and A11 still apply.

| #   | Assumption (implemented)                                                                                                                               | Open question for the business                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| B1  | The two existing programs become **Liga Ahorro** and **Liga Wellness**. IDs are unchanged.                                                             | Final liga names? Is a group-wide liga (all five businesses) wanted?                                            |
| B2  | Rewards are redeemable only within the issuing liga, or narrower.                                                                                      | Should rewards be redeemable at any SmartClub business?                                                         |
| B3  | Caps follow `percent × 2 × tier threshold`: Ahorro Bronce up to $1, Ahorro Oro up to $12,50, Wellness Bronce up to $3. The cap applies per redemption. | Confirm the values. Is one discount reward per ticket required? (Today two codes can be stacked on one ticket.) |
| B4  | Discount = floor of percent × gross ticket, capped. Zero-value redemptions are rejected.                                                               | Is rounding down acceptable?                                                                                    |
| B5  | "SmartClub 2.0" in the UI; "SmartClub" on receipts. Draft tagline "Tus compras suman. Tu constancia gana."                                             | Confirm the receipt naming and the tagline.                                                                     |
| B6  | One POS key for the whole program (previously one per tenant), so the blast radius is larger.                                                          | Should per-business POS keys move up from future work?                                                          |
| B7  | Email is optional and cannot be added later (no profile edits).                                                                                        | Should a cashier be able to add an email to an existing customer in person?                                     |
| B8  | SmartClub 2.0 streaks are free and independent of smartclub.ec's paid membership ($20/year) and cashback app. No account linking.                      | Should 2.0 integrate with existing SmartClub accounts or the cashback wallet?                                   |
| B9  | BYD remains a partner experience, not a participating business, even though smartclub.ec lists it under "Marcas smart".                                | Should BYD purchases count toward a liga?                                                                       |
| B10 | No smartclub.ec logos or images are copied: text wordmark and an original favicon.                                                                     | Can official brand assets be provided?                                                                          |
| B11 | "Government ID" means the Ecuadorian cédula (SPEC-000 §2.2). Passports and RUC are not supported.                                                      | Are non-cédula IDs needed (e.g., foreign customers)?                                                            |
| B12 | The privacy notice keeps Farmaenlace as data controller, pending legal review.                                                                         | Confirm the controller entity for SmartClub 2.0.                                                                |

**Still out of scope:** custom domain, per-business POS keys, email sending, profile edits, admin UI, refunds, integration with the existing SmartClub membership or cashback.

---

## Appendix A: change inventory by file

| Area   | Files                                                                                                                                                    | Change                 |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| shared | `src/tenants/*` → `src/program/{types,smartclub,index}.ts`                                                                                               | §2.2, §2.3             |
| shared | `src/schemas/index.ts`, `src/tables.ts`, `src/constants.ts`, `src/index.ts`                                                                              | §2.3, §4.1, §5.2       |
| shared | `src/domain/{rewards,progress,receipt}.ts`, new `src/domain/discounts.ts`, `src/domain/domain.test.ts`                                                   | §2.3, §4.2, §9         |
| api    | `src/config/env.ts`, `src/container.ts`, `src/lib/jwt.ts`, `src/server.ts`, `src/app.ts`                                                                 | §2.4, §6               |
| api    | `src/services/{customer,purchase,progress,reward}-service.ts`, `src/demo.ts`                                                                             | §2.4, §2.7, §4.3, §5.2 |
| api    | `scripts/{seed,setup-local-tables}.ts`, new `scripts/migrate-tenants.ts`, `.env.example`, `package.json`                                                 | §2.7, §8.2             |
| api    | `test/api.test.ts`, `test/integration/dynamo.test.ts`                                                                                                    | §9                     |
| ui     | `.env.ecoclub` + `.env.farmaclub` → `.env`; `index.html`; `public/tenants/*` → `public/favicon.svg`; `package.json` (scripts, fonts); `vitest.config.ts` | §2.5, §3.4, §3.5       |
| ui     | `src/theme.ts`, `src/main.tsx`, `src/styles.css`, `src/api/client.ts`, `src/components/{ui,AppShell}.tsx`                                                | §3                     |
| ui     | `src/pages/{Landing,Dashboard,Rewards,History,Register,Pos,Privacy}.tsx`, `test/ui.test.tsx`                                                             | §2.5, §4.5, §5.3, §9   |
| infra  | `bin/app.ts`, `lib/club-stack.ts`, `lib/constructs/api-service.ts`, `lib/github-oidc-stack.ts`, `test/club-stack.test.ts`                                | §2.6                   |
| root   | `package.json`, `.gitignore`, `.github/workflows/deploy.yml`, `.github/scripts/deployment-summary.mjs`, `README.md`, `spec/SPEC-000.md` (banner only)    | §2.7, §10              |
