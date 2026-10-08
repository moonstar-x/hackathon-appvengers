# SmartClub 2.0: Brand and Design System

> **Audience:** anyone (human or coding agent) writing UI, copy, slides or receipts for SmartClub 2.0.
> **Status:** v1.0 (2026-10-08). Built from an analysis of https://smartclub.ec (live HTML, stylesheets and screenshots taken 2026-10-08) and the Farmaenlace challenge deck.
> **Relation to the specs:** this file explains the _why_ and the full system. The token values are the same as [SPEC-001 §3](spec/SPEC-001.md#3-d2-smartclub-20-brand-and-design-language); if the two ever disagree, SPEC-001 wins and this file must be updated in the same change.

---

## 1. Brand analysis: what smartclub.ec is today

### 1.1 Positioning

SmartClub is Farmaenlace's paid, cross-brand membership (USD 20/year, up to 5% cashback at Económicas, Medicity, Wellderma, Mascotas, Ambiente and BYD, plus 14 external partners). The brand's job, in Farmaenlace's own words, is _"no fidelizar a una sola marca, sino fidelizar a todo un ecosistema"_. The site sells **belonging and everyday smartness**, not discounts:

| Site line                         | What it signals                     |
| --------------------------------- | ----------------------------------- |
| "El club que te conecta"          | Ecosystem, connection across brands |
| "Vivir bien es vivir smart"       | Wellbeing + being clever with money |
| "Simple, rápido y a tu ritmo"     | Low effort, no pressure             |
| "Ser smart nunca fue tan simple"  | Simplicity as a promise             |
| "Un toque smart para cada día"    | Daily, habitual use                 |
| "Únete al club que lo tiene todo" | Breadth of the ecosystem            |

**"smart" is the brand's verbal device**: it is used as an adjective on everything ("Marcas smart", "promos smart", "productos smart", "App smart", "beneficios smart").

### 1.2 Personality

Energetic, warm, urban and playful. It borrows Medicity/Económicas' "close and optimistic" personality but pushes it younger: saturated orange fields, sweeping arcs, cut-out models with sneakers and a cat in sunglasses.

### 1.3 Visual language (observed)

| Element | Observation                                                                                                                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Logo    | Cream rounded-square symbol with an orange hand-drawn mark, plus the lowercase wordmark **smart** (bold) **club** (light), cream on orange.                                                                                                                                    |
| Color   | Orange `#ff3e00` dominates every first impression. A warm ramp (`#ff6700`, `#fe9c01`) builds depth; magenta `#ff009d` and raspberry `#da1375` lead secondary sections; burgundy `#9e0412` anchors price and CTAs; cream `#f9f4e1` replaces white.                              |
| Type    | **Source Sans 3** for display and body (300 and 400, 700 for keywords) and **Work Sans** for navigation (uppercase, tracked) and button labels (700). Headings default to weight 400; the signature is a light phrase with bold keywords: "Vivir **bien** es **vivir smart**". |
| Shapes  | Pills everywhere (radius 99px+), 10px on small chips. Large **squircle tiles** (~30% radius) for benefits. Partner cards are white "blob" shapes with an orange offset shadow. Concentric **arc bands** sweep across heroes.                                                   |
| Buttons | Cream pill with orange/burgundy bold text and a "›" chevron ("Quiero ser socio ›"); outlined cream pill on orange ("Descargar App").                                                                                                                                           |
| Icons   | Thin cream line icons (coins in hand, gift, price tag, handshake) centered on solid squircles.                                                                                                                                                                                 |
| Imagery | Cut-out lifestyle photography on flat color: young adults, a middle-aged man holding the app, pets. No clinical or pharmacy imagery.                                                                                                                                           |
| Numbers | Huge, heavy price figures ("$20 al año", "50%", "2,99$") in orange or cream.                                                                                                                                                                                                   |

### 1.4 What to keep and what to fix

Keep: the orange field, cream instead of white, mixed-weight headlines, pills, squircles, arcs, "smart" as an adjective, informal _tú_.

Fix (improvement opportunities, not criticism):

1. **Contrast.** Cream or white small text on `#ff3e00` (3.2–3.5:1) and on the `#ff6700` gradient (2.65:1) fails WCAG AA. Our rule: small text on orange is ink.
2. **Faint body text.** 15px at weight 300 is hard to read for _Cuidadores del hogar_ and older chronic patients, the members who buy most often. We use 18px base and 400 body.
3. **Audience fit.** The imagery is Gen Z; Farmaenlace's core buyers are middle and lower-middle income families, 72.8% of Económicas customers pay in cash. Our visuals show the real customer: a mother at the counter, an older adult with a receipt, a pet owner.
4. **Promise vs experience.** "Simple, rápido" sits next to a redemption that needs the app, a code and the physical _cédula_. Our design must make the simple promise true: the receipt and the cashier carry the message, not only the app.
5. **Number formatting.** The site mixes "2,99$", "3.99$" and "$20". We always write es-EC currency as `$2,99`.

---

## 2. SmartClub 2.0: brand platform

### 2.1 Idea

SmartClub rewards each purchase. **SmartClub 2.0 rewards the habit.** Monthly spending across the club places you in a tier inside a **liga** (Liga Ahorro, Liga Wellness); keep it up and the reward grows. It moves the brand from "transacción" to "relación", which is Farmaenlace's own thesis.

- **Tagline (draft, open question B5):** "Tus compras suman. Tu constancia gana."
- **Promise:** you see your progress on every receipt, even if you never open an app.
- **Proof points:** progress printed on the receipt, rewards in the first month, a cashier who can tell you in one sentence what you are missing.

### 2.2 Audience

| Archetype (Farmaenlace)                     | What they need from the design                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| _Ahorrador inteligente_ (Económicas)        | Exact dollars: "Te faltan $6,00 para Plata". No vague points.                 |
| _Cuidador del hogar_                        | Large type, one clear next step, works on a cheap phone or on paper.          |
| _Resolutivo de urgencia_                    | Zero friction: identify with cédula, no sign-up wall at the counter.          |
| Wellness / pet / home buyer (Liga Wellness) | Feeling of belonging and recognition, a reason to come back to another brand. |
| _Dependiente de mostrador_ (cashier)        | One line to say, big buttons, no decisions.                                   |

### 2.3 Personality

**Cercano, claro, optimista, smart.** Like a neighbor who knows the deals, not a bank. Never pushy, never guilt-tripping.

### 2.4 Voice and copy

- Spanish (es-EC), informal **tú**, short sentences (≤ 15 words), active voice.
- Lead with what the customer gains, then the number: "Vas muy bien: te faltan **$4,00** para Oro."
- "smart" as an adjective in section titles only ("Beneficios smart", "Ligas smart"); never more than once per screen.
- Celebrate progress, never shame lapses: "Este mes vuelves a empezar en Bronce. ¡Tú puedes!" not "Perdiste tu nivel".
- Money is always exact and formatted `$1.234,50`. Tiers are **Bronce, Plata, Oro**.
- Write original copy. Do not reuse smartclub.ec slogans verbatim.
- Receipts: uppercase ASCII, ≤ 40 characters per line (SPEC-000 §2.10).

| Do                                          | Don't                                     |
| ------------------------------------------- | ----------------------------------------- |
| "Tus compras de este mes: $18,40"           | "Has acumulado 1.840 puntos"              |
| "Compra $6,00 más y desbloqueas Plata"      | "Sigue comprando para obtener beneficios" |
| "Tu premio te espera en cualquier Medicity" | "Canjea tu reward en el POS"              |
| "Bienvenido a SmartClub 2.0"                | "Registro exitoso de cliente"             |

---

## 3. Identity

### 3.1 Wordmark

The official smartclub logo (cream symbol + wordmark, `packages/ui/public/brand/smartclub-logo.svg`, from smartclub.ec), followed by a small **2.0** pill (Work Sans 700, radius 999px, `--brand-soft` with `--brand-deep` text). Only on orange or dark surfaces, since the logo is cream; 44px high on desktop, 34px on phones. `aria-label="SmartClub 2.0 inicio"`, image `alt=""`. In running text the name is always "SmartClub 2.0" (short form "SmartClub" on receipts).

### 3.2 Symbol and favicon

The official smartclub.ec favicon, stored locally as `public/brand/smartclub-favicon.png` (32×32, also the apple-touch-icon). **Never copy, hotlink or trace** smartclub.ec photos or illustrations. Exceptions: the official smartclub logo and favicon (§3.1, stored locally), and the partner brand tiles in "Marcas smart" load the official brand squircles from smartclub.ec (listed in `packages/ui/src/brandLogos.ts`). Other official assets, if supplied, go in `packages/ui/public/brand/`.

### 3.3 Clear space and misuse

Clear space = the height of the "s" on every side. Don't stretch, outline, recolor outside the palette, put it on the gradient's light end, or set it below 20px height.

---

## 4. Color

### 4.1 Tokens

All ratios use the WCAG 2.1 formula. Components use semantic classes only, **never raw hex**.

| Token                       | Value                                     | Role                                                                                                 |
| --------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `--brand-primary`           | `#ff3e00`                                 | Header, footer, hero, progress fill. Text on it: `--ink` (5.07:1); cream only ≥ 24px / 18.66px bold. |
| `--brand-primary-strong`    | `#b83300`                                 | Primary buttons, links, small brand text (5.43:1 on cream).                                          |
| `--brand-on-strong`         | `#f9f4e1`                                 | Text on strong, deep, secondary and dark fills.                                                      |
| `--brand-secondary`         | `#b80f62`                                 | Headings h1–h3 on cream (5.80:1). Deeper shade of the site's `#da1375`.                              |
| `--brand-accent`            | `#ff009e`                                 | Decorative bands, chevron segments. Never text.                                                      |
| `--brand-deep`              | `#9e0412`                                 | CTA text on cream pills (7.46:1), tiles, price callouts.                                             |
| `--brand-warm`              | `#fe9c01`                                 | Hero arcs, decorative borders only.                                                                  |
| `--brand-soft`              | `#f7f1d6`                                 | Soft cards, header pills.                                                                            |
| `--brand-dark`              | `#171717`                                 | Dark bands, receipt frame.                                                                           |
| `--brand-gradient`          | `135deg, #ff3e00 → #ff6700 60% → #fe9c01` | Decorative backgrounds only; text over it is `--ink`.                                                |
| `--surface`                 | `#f9f4e1`                                 | Page background (cream, never pure white).                                                           |
| `--surface-raised`          | `#ffffff`                                 | Cards, form panels.                                                                                  |
| `--surface-muted`           | `#f7f1d6`                                 | Muted panels.                                                                                        |
| `--ink`                     | `#171717`                                 | Body text (16.27:1 on cream). Focus ring.                                                            |
| `--ink-muted`               | `#57534e`                                 | Secondary text (6.92:1).                                                                             |
| `--line`                    | `#857b74`                                 | Input borders (≥ 3:1).                                                                               |
| `--line-subtle`             | `#e6dcc0`                                 | Dividers, progress track.                                                                            |
| `--danger`                  | `#c8102e`                                 | Errors.                                                                                              |
| `--success`                 | `#1d7a3e`                                 | Confirmations.                                                                                       |
| `--tier-bronze/silver/gold` | unchanged                                 | Tier chips; `--ink` text and 1px `--ink` border.                                                     |

### 4.2 Proportion

Roughly **60% cream, 25% orange family, 10% ink, 5% magenta/burgundy**. Orange owns the first screen and the header; content lives on cream. Use magenta at most once per screen.

### 4.3 Rule of thumb

On any orange or amber surface, text below 24px (or 18.66px bold) is `--ink`. Status is never conveyed by color alone: pair it with a word or icon. Exception: the landing hero follows smartclub.ec with cream copy, which is therefore set large (≥ 24px, or ≥ 19px bold).

---

## 5. Typography

Self-hosted `@fontsource/source-sans-3` (300, 400, 700) and `@fontsource/work-sans` (500, 700). No third-party font requests.

| Role               | Font / weight                      | Size (18px base)         | Notes                                      |
| ------------------ | ---------------------------------- | ------------------------ | ------------------------------------------ |
| Display (hero)     | Source Sans 3, 300 + 700           | 48–64px, lh 1.05         | Mixed weight: light phrase, bold keywords. |
| H1                 | Source Sans 3, 300 + 700           | 36–40px, lh 1.15         | `--brand-secondary` on cream.              |
| H2                 | Source Sans 3, 700                 | 28px, lh 1.2             |                                            |
| H3                 | Source Sans 3, 700                 | 22px, lh 1.3             |                                            |
| Body               | Source Sans 3, 400                 | 18px, lh 1.5             | Never 300 below 32px.                      |
| Small              | Source Sans 3, 400                 | 15px                     | Legal and helper text only.                |
| Label / nav / chip | Work Sans, 500, uppercase          | 14px, tracking 0.06em    | `--font-label`.                            |
| Button             | Work Sans, 700                     | 17px                     | Sentence case.                             |
| Numbers            | Source Sans 3, 700, `tabular-nums` | 40–72px for hero amounts | Money, tier thresholds, progress.          |

Mixed-weight example: `Tus compras <strong>suman</strong>. Tu constancia <strong>gana</strong>.`

---

## 6. Layout, shape and elevation

- **Grid:** mobile first, single column to 640px, 12-column above; max content width 1120px; 16px side gutter on phones, no horizontal scroll.
- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48, 64, 96px.
- **Radii:** pill `999px` (buttons, badges), `11px` (header pills), `20px` (cards), `30%` (squircle tiles).
- **Elevation:** flat. Cards get at most `0 1px 2px rgb(0 0 0 / 0.08)`. The site's playful offset shadow (a solid `--brand-primary` shape 8px below a white card) is allowed on landing benefit cards only.
- **Touch targets:** ≥ 48px high, ≥ 8px apart.

---

## 7. Motifs

1. **Ribbon bands:** wide, round-capped sweeping ribbons (smartclub.ec style) drawn as an original inline SVG (`components/Ribbons.tsx`). `orange` variant (`#ff6700` → `--brand-warm` gradients) on the hero and closing band; `soft` (`--line-subtle`, 50%) full-bleed behind cream sections; `dark` (cream, 6%) inside the receipt band. They drift slowly (20–28s) and sit behind content.
2. **Chevron step strip** ("Cómo funciona"): three arrow segments (`--brand-primary`, `--brand-deep`, `--brand-soft`) with large numerals, via `clip-path`; stacked rounded blocks below 640px.
3. **Squircle tiles:** solid fills cycling `--brand-primary-strong`, `--brand-deep`, `--brand-secondary`, `--brand-dark`, cream line icon + cream label. Businesses use their official brand squircle (logo in brand colors, `alt` = business name) from `brandLogos.ts`; a business without one, or whose image fails to load, falls back to a text-name tile in these fills.
4. **Dark band:** `--brand-dark` + cream for "Así sale en tu factura" and the POS receipt frame.
5. **The receipt** is a brand surface: monospace, paper-white card with a torn edge, showing the exact printed lines.

---

## 8. Components

| Component         | Spec                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header            | smartclub.ec-style navbar: cream symbol + wordmark left; uppercase Work Sans section links in white like smartclub.ec (a deliberate exception to §4.3; ink inside the mobile menu panel) stacked over pills (cream "Ingresar", outlined "Únete gratis"); a translucent white band. Overlays the hero on the landing; solid `--brand-primary` elsewhere. Below 900px the landing collapses to logo + menu button with a cream panel. |
| Primary button    | `--brand-primary-strong` pill, cream Work Sans 700, optional "›".                                                                                                                                                                                                                                                                                                                                                                   |
| Button on orange  | smartclub.ec "Quiero ser socio" pill: cream (`--brand-on-strong`) with `--brand-primary` Source Sans 600 text at ≥ 24px (orange on cream is 3.2:1, so it must stay large), thin "›", soft shadow. Header pills use the same colors at 19px bold.                                                                                                                                                                                    |
| Secondary button  | Transparent pill, 2px `--brand-deep` border.                                                                                                                                                                                                                                                                                                                                                                                        |
| Liga card         | `--surface-raised`, radius 20px; liga name as label; current monthly total in large tabular numbers; tier chip; progress bar; one sentence of next step.                                                                                                                                                                                                                                                                            |
| Progress bar      | 12px track `--line-subtle`, fill `--brand-primary`, tier ticks labelled Bronce / Plata / Oro with amounts; value also in text.                                                                                                                                                                                                                                                                                                      |
| Streak dots       | 3 circles for the 3-month streak: filled `--brand-deep`, empty with `--line` border; label "Mes 2 de 3".                                                                                                                                                                                                                                                                                                                            |
| Tier chip         | Pill, tier color fill, `--ink` text, 1px `--ink` border.                                                                                                                                                                                                                                                                                                                                                                            |
| Reward card       | Squircle icon + reward name + where it is redeemable + expiry; status in words ("Disponible", "Usado").                                                                                                                                                                                                                                                                                                                             |
| CI field / inputs | smartclub.ec document field: white pill (radius 999px), 52px high, 2px light border, centered 18px text, `--brand-primary-strong` placeholder (keeps ≥ 4.5:1), orange border + soft halo on focus. Numeric keypad, 10 digits, inline validation message in words, not just red.                                                                                                                                                     |
| Toast / alert     | Cream raised card, 4px left bar in status color, icon + text.                                                                                                                                                                                                                                                                                                                                                                       |
| Footer            | `--brand-primary`, ink text: `© {year} SmartClub 2.0 · Ecuador` · Privacidad · Acceso caja.                                                                                                                                                                                                                                                                                                                                         |

### 8.1 POS / cashier surface ("Acceso caja")

Frontline intelligence: the cashier screen is **utilitarian**, not a marketing page. Cream background, no arcs or imagery, 20px base text, one primary action per screen, and a single highlighted sentence the cashier can read aloud ("Dígale: le faltan $6,00 para Plata este mes"). It must work on low-end hardware and slow networks.

---

## 9. Iconography and imagery

- **Icons:** 1.75px stroke line icons, rounded caps, cream on fills or `--ink` on cream. One icon set only (e.g., Lucide). Icons accompany labels; they never replace them.
- **Photography (when used):** real Ecuadorian customers in everyday moments (the counter, home care, pets, the receipt in hand), cut out on flat orange or cream. Diverse ages; include older adults and families. Demo images are licensed or generated, never from smartclub.ec.
- **Illustration:** flat shapes from the palette, arcs and squircles; no gradients except `--brand-gradient`.
- **Health data:** no imagery or copy that reveals a medical condition. Demo data is fictitious.

---

## 10. Motion

Short and purposeful: 150–250ms `ease-out` for UI feedback. The landing uses smartclub.ec-style scroll reveals: elements fade and slide in from the left, right or bottom (700ms, staggered 150ms) once, via `useReveal` and `data-reveal`. Progress fills animate once on load; tier-up gets one celebratory moment (chip scales 1 → 1.08 → 1, confetti in palette colors ≤ 1s). Respect `prefers-reduced-motion`: no animation, final state only.

---

## 11. Accessibility checklist

- [ ] Body text ≥ 18px, weight 400; 300 only ≥ 32px.
- [ ] All text pairs ≥ 4.5:1 (≥ 3:1 for large text and UI borders); small text on orange is `--ink`.
- [ ] Visible `--ink` focus ring on every interactive element.
- [ ] Status never by color alone; tiers and progress also in words and numbers.
- [ ] `lang="es-EC"`, labels on every input, errors announced (`aria-live`).
- [ ] Touch targets ≥ 48px; works at 320px wide and at 200% zoom.

---

## 12. Implementation notes

- Tokens live in `packages/ui/src/styles.css` (`@theme` maps `--color-*` to the tokens above) and are set by `applyTheme(PROGRAM)` in `packages/ui/src/theme.ts`.
- `index.html`: title "SmartClub 2.0", `theme-color` `#ff3e00`, `lang="es-EC"`, Open Graph from `packages/ui/.env`.
- No hard-coded hex in components; add a token here and in SPEC-001 §3.3 first.
