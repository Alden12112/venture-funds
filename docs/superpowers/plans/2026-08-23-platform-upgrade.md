# Platform Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the AD88 front office, market trading workbench, admin console, and deploy readiness into a more polished product.

**Architecture:** Keep the current React/Vite single-page app and local adapter pattern. Add project-local visual assets, localStorage-backed paper trading and credit workflows, and focused UI improvements without introducing a backend.

**Tech Stack:** React 19, React Router 7, TypeScript, Vite, lucide-react, browser localStorage.

**Spec:** User-approved chat request on 2026-08-23.

## Global Constraints

- Preserve the existing app routes and local adapter architecture.
- No real trading, real funds movement, or backend mutation; all trading and points workflows remain sandbox/localStorage.
- Verify with `npm run build` and local route checks.
- If GitHub or Render need account authorization, stop at the authorization screen and report the blocker.

---

### Task 1: Brand And Visual Asset Upgrade

**Files:**
- Create: `public/assets/trading-workstation-hero.png`
- Modify: `src/pages/LandingPage.tsx`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: reusable `.media-hero`, `.brand-lockup__mark` and visual panel classes.

- [x] Add a realistic financial workstation image to project assets.
- [x] Apply the image to homepage and dashboard surfaces.
- [x] Upgrade the logo mark to feel like a real financial product badge.
- [x] Keep mobile layout polished.

### Task 2: Market Trading Workbench Upgrade

**Files:**
- Modify: `src/types.ts`
- Modify: `src/pages/MarketPage.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: `PaperPosition.remainingLots`, `closedLots`, `status`, `closedAt`, partial close controls, SL/TP edit controls.

- [x] Show long/short side clearly on every sandbox position.
- [x] Add one-by-one close and close-all controls.
- [x] Allow partial closes in `0.01` lot increments for positions such as `0.10`.
- [x] Allow editing SL/TP after clicking into a position.
- [x] Improve chart framing, price labels, order ticket hierarchy, and long/short controls.

### Task 3: Points Workflow Upgrade

**Files:**
- Modify: `src/types.ts`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/adapters/admin-adapter.ts`
- Modify: `src/pages/AdminPage.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: `CreditAccount`, `CreditRequest`, localStorage keys `creditAccounts`, `creditRequests`.

- [x] Front office can request points.
- [x] User can see balance, available points, pending requests, and recent grants.
- [x] Admin can search an account and grant a custom point amount.
- [x] Admin can approve pending requests.
- [x] Admin tables show balances and credit activity.

### Task 4: Admin Polish And Verification

**Files:**
- Modify: `src/pages/AdminPage.tsx`
- Modify: `src/styles/global.css`

- [x] Improve admin tab layout, search surface, metrics, and action buttons.
- [x] Run `npm run build`.
- [x] Check homepage, market, dashboard, and admin routes locally.
- [x] Prepare GitHub/Render deployment steps.
