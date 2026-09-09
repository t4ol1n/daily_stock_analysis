---
kind: frontend_style
name: Tailwind CSS v4 + HSL Design Tokens Theme System (dsa-web)
category: frontend_style
scope:
    - '**'
source_files:
    - apps/dsa-web/tailwind.config.js
    - apps/dsa-web/src/index.css
    - apps/dsa-web/src/App.css
    - apps/dsa-web/src/components/theme/ThemeProvider.tsx
    - apps/dsa-web/src/components/theme/ThemeToggle.tsx
    - apps/dsa-web/package.json
    - apps/dsa-web/tests/index.theme-bootstrap.test.ts
    - apps/dsa-web/tests/login-theme-tokens.test.ts
    - apps/dsa-web/tests/ui_governance.test.ts
---

## Overview

The frontend styling lives in `apps/dsa-web/`, a React + Vite SPA built with **Tailwind CSS v4** (`@tailwindcss/vite` plugin, `tailwindcss@^4.1.18`). The app uses a **CSS custom properties (HSL) design-token system** to drive both light and dark themes, with Tailwind utility classes composing the UI.

## Core Stack

- **Framework**: React 19 + TypeScript, built via Vite.
- **Styling engine**: Tailwind CSS v4 imported through `@import "tailwindcss"; @config "../tailwind.config.js";` at the top of `src/index.css`. The config file is referenced explicitly so that theme extensions live in `tailwind.config.js` rather than inline CSS `@theme` blocks.
- **Theme provider**: `next-themes` wrapped in a local `ThemeProvider.tsx` that sets `attribute="class"`, `defaultTheme="dark"`, `enableSystem`, and `disableTransitionOnChange`. Components toggle the `dark` class on `<html>`.
- **Utility helpers**: `clsx` + `tailwind-merge` for conditional class composition; a shared `cn()` helper lives under `src/utils/cn.ts`.
- **Icons**: `lucide-react` and `@remixicon/react`.
- **Animations**: Tailwind `animate-*` utilities plus custom keyframes defined in `tailwind.config.js` (`fadeIn`, `slideUp`, `slideInRight`, `floatIn`, `pulseGlow`) and duplicated as plain CSS `@keyframes` in `index.css` for components that animate directly.

## Design Token Architecture

All visual tokens are declared as CSS custom properties in `src/index.css`:

- **Base palette** (`:root`): `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`, `--elevated`, `--hover`, `--secondary-text`, `--muted-text` — all expressed as HSL values.
- **Semantic color aliases**: `--color-cyan`, `--color-purple`, `--color-success`, `--color-warning`, `--color-danger`, plus glow variants (`--color-*-glow`) and dim variants (`--color-*-dim`).
- **Design token layer**: raw sources `--bg-subtle-raw`, `--border-dim-raw`, `--border-subtle-raw` derive from `--foreground`; derived tokens like `--bg-subtle`, `--border-dim`, `--border-subtle`, `--surface-1/2/3`, `--overlay-hover`, `--overlay-selected` provide ready-to-use HSL strings.
- **Feature-scoped tokens**: large blocks dedicated to `home-*`, `chat-*`, `backtest-*`, `login-*`, `settings-*`, `nav-*`, `input-*` — each feature gets its own namespace of variables so cross-feature leakage is limited.
- **Dark mode**: a `.dark` block redefines every base and derived variable, giving a full alternate palette (cyan primary shifts to `190 100% 50%`, backgrounds become deep navy, glows intensify).

`tailwind.config.js` maps these CSS variables into Tailwind's color scale via `hsl(var(--...))` references, adding domain-specific palettes (`cyan`, `purple`, `success`, `warning`, `danger`, `base`, `elevated`, `hover`, `secondary-bg`, `muted-bg`, `secondary-text`, `muted-text`) and extended utilities for `boxShadow`, `borderRadius`, `fontSize`, `spacing`, `backgroundImage`, and `animation`.

## Responsive Strategy

- Tailwind's default breakpoints are used; a custom `container.center` with `padding: 1.5rem` and an explicit `2xl: 1400px` breakpoint is configured.
- No custom media queries beyond Tailwind's built-ins; component responsiveness is achieved via Tailwind responsive prefixes (`sm:` etc.) and CSS `min-width: 320px` / `min-height: 100vh` on `body`.

## Component Styling Conventions

- **Global styles** live in `src/index.css` under `@layer base` and `@layer components`, defining shared primitives like `.input-surface`, `.badge`, `.list-item`, `.feed-item`, `.glass-panel`, `.gauge-ring`, sentiment-driven data-attribute selectors (`[data-sentiment=...]`, `[data-sentiment-stroke=...]`, `[data-sentiment-glow=...]`, `[data-sentiment-text=...]`, `[data-sentiment-label=...]`), and reusable animations.
- **Component-level styles** are primarily composed via Tailwind utility classes in JSX; bespoke CSS classes are reserved for complex stateful or animated elements (gauges, inputs, glass panels).
- **Theming pattern**: components read from CSS variables (e.g., `var(--primary)`, `var(--bg-card)`, `var(--shadow-soft-card)`) rather than hardcoding colors, so switching the `dark` class automatically restyles them.
- **Sentiment indicators** use data attributes (`data-sentiment="greed|neutral|fear"`) to switch between cyan/purple/danger colors and glow effects without per-component logic.

## Theme Toggle

`components/theme/ThemeToggle.tsx` exposes three modes — `light`, `dark`, `system` — rendered as a dropdown menu using `next-themes`' `useTheme()`. It supports multiple visual variants (`default`, `nav`, `rail`) and integrates with the i18n context (`UiLanguageContext`) for labels.

## Tests Enforcing Style Governance

The `apps/dsa-web/tests/` directory contains style-related tests that assert the theme system works end-to-end:
- `tests/index.theme-bootstrap.test.ts` — verifies the root theme CSS loads correctly.
- `tests/login-theme-tokens.test.ts` — asserts login page tokens exist.
- `tests/home-mobile-scroll-styles.test.ts` — checks mobile scroll behavior.
- `tests/ui_governance.test.ts` — likely validates that components use the token system rather than hardcoded colors.

These tests act as a guardrail ensuring new components consume design tokens instead of ad-hoc colors.