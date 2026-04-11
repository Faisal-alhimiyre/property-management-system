# Storage & Supabase tables backlog

Numbered backlog for moving off `localStorage` and wiring every Supabase table the app should use. Check items as you complete them.

**Legend:** Done = API + UI aligned for main flows. Partial = mixed sources. Not connected = table exists but app still local or API unused.

**Architecture note (2026):** The Messages **screen** lists **`maintenance_requests`** only (`GET /api/maintenance` — description + `owner_reply`). There is **no** separate free-form messaging product feature. A Supabase `messages` table is **optional** and **not** used by the app.

---

## Priority A — Core money & property (high impact)

1. [ ] **Payments (`payments` + `payment_installments`)**  
   Replace `walajna_payments` in owner-building, finance-summary, payment-options-page, and related JS with `GET/PATCH` flows against existing `/api` payment routes only.

2. [ ] **Apartments cache (`apartments`)**  
   Stop using `walajna_apartments` as source of truth; load/save via `/api/apartments` only, with optional in-memory cache if needed (no persistent duplicate).

3. [ ] **Documents (`documents`)**  
   Remove `walajna_documents` reads/writes; use document API for list/upload/delete; fix owner-building delete path so it does not rely on local document arrays.

4. [ ] **Buildings (`buildings`)**  
   Remove API-failure fallback to `walajna_buildings` in owner-building (or show empty state + retry). Point finance-summary at `/api/buildings` (and related) instead of local arrays.

---

## Priority B — Messaging, history, notifications

5. [x] **Messages tab vs `messages` table** — **N/A (product)**  
   Inbox UI = **`maintenance_requests` only**. Removed `/api/messages`, `inbox-messages-api.js`, and `message_routes.py`. Optional: drop unused `public.messages` in Supabase.

6. [ ] **Apartment history (`apartment_history`)**  
   Add API routes backed by `apartment_history` (or agreed schema), migrate `apartment-history.js` / history details off embedded `tenantHistory` on `walajna_apartments`.

7. [ ] **Notifications (`notifications`)**  
   Wire UI (nav badge, list, mark read) to existing `GET /api/notifications` and `PUT /api/notifications/{id}/read`; remove any duplicate “notification” state from local storage if present.

---

## Priority C — Users & auth consistency

8. [ ] **Users (`users`)**  
   Point `settings.js` profile/password flows at API only; remove reliance on `walajna_users` as master copy (keep session mirror in `sessionStorage` as today if desired).

9. [ ] **Password reset (no table)**  
   Replace local OTP flow (`walajna_reset_*`, `forgetpass.js`, `reset-password.js` against `walajna_users`) with a real reset path (email/SMS + API) or document as demo-only.

---

## Priority D — Costs & extras

10. [ ] **Costs (no Supabase table yet)**  
    If costs must be shared across devices, add a `costs` (or `building_costs`) table + API, then replace `walajna_costs` in apartment-costs, owner-building, finance-summary, apartment-history.

11. [ ] **Support / misc (`support.js`)**  
    Decide: persist support threads in DB or keep explicitly client-only.

---

## Already in good shape (verify only)

12. [x] **Tenant ↔ owner requests (`maintenance_requests`)** — Core flows use `/api/maintenance`; `walajna_requests` removed from behavior; optional one-time purge of old local key.

13. [x] **Auth session** — Cookie + JWT; `walajna_current_user` / `activeRole` are client mirrors, not the canonical store.

14. [x] **Contracts & tenants (core)** — Created/updated via API from apartment flows; remaining gap is **historical** data (see item 6).

15. [x] **Messages page (`messages.js`)** — Lists **requests only** from `/api/maintenance`; mark read via maintenance `PATCH`; `hydrateSession` + session user.

---

## Browser-only (usually keep)

- [ ] **Language / theme** (`walajna_language`, `walajna_theme`) — OK as local prefs unless you add `users.settings` JSON later.

- [ ] **Owner building pins** (`sessionStorage` / `walajna_owner_building_pins`) — UI-only; no table required unless you want cross-device pins.

---

## Quick reference: localStorage keys to eliminate or shrink

| Key | Target |
|-----|--------|
| `walajna_payments` | API payments + installments |
| `walajna_apartments` | API apartments only |
| `walajna_documents` | API documents |
| `walajna_buildings` | API buildings |
| `walajna_costs` | New costs table + API (if needed) |
| `walajna_messages` | Not used by Messages page (requests-only); safe to ignore or clear |
| `walajna_users` | API users + session |
| `walajna_requests` | Already deprecated; delete leftover data in browser if any |

---

*Last updated: 2026 — Messages tab aligned to `maintenance_requests` only; `messages` table optional.*
