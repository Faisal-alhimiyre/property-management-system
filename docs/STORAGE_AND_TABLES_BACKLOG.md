# Storage & Supabase tables backlog

Numbered backlog for moving off `localStorage` and wiring every Supabase table the app should use. Check items as you complete them.

**Legend:** Done = API + UI aligned for main flows. Partial = mixed sources. Not connected = table exists but app still local or API unused.

**Architecture note (2026):** The Messages **screen** lists **`maintenance_requests`** only (`GET /api/maintenance` — description + `owner_reply`). There is **no** separate free-form messaging product feature. A Supabase `messages` table is **optional** and **not** used by the app.

---

## Priority A — Core money & property (high impact)

1. [x] **Payments (`payments` + `payment_installments`)**  
   Owner/finance/payment-options/apartment page use **`GET /api/payments`** via `js/main/payments-api.js` (`WalajnaPaymentsApi.listMapped`); installments still use contract endpoints + `PATCH /api/payment-installments/{id}`. **`walajna_payments`** no longer read/written there. **`WalajnaPaymentsStorage`** remains for apartment payments **history / offline** paths only (`apartment-payments.js` when not server mode).

2. [x] **Apartments cache (`apartments`)**  
   **`GET /api/apartments`** is canonical when logged in; UI reads **`walajna_apartments_session`** (and `getApartments()` in `apartment-storage.js`) after `WalajnaApartmentsApi.refreshForSession()`. **`walajna_apartments`** in localStorage remains for demo/offline only (`saveApartments` skips it when authed).

3. [x] **Documents (`documents`)**  
   Logged-in flows use **`GET/POST/DELETE /api/documents`** via `js/main/documents-api.js` (`WalajnaDocumentsApi`); apartment page refreshes per-unit list; auto-lease HTML and uploads persist to Supabase (`backend/sql/documents_table_2026.sql`). **`walajna_documents`** remains only when **not** authenticated (demo/offline). Owner-building delete calls **`DELETE /api/documents/by-apartment/{id}`** when logged in.

4. [x] **Buildings (`buildings`)**  
   Owner-building no longer falls back to `walajna_buildings` on API failure (shows empty state + retry). Finance-summary now resolves building context from `/api/buildings` path and no longer uses local buildings/apartments fallback as source.

---

## Priority B — Messaging, history, notifications

5. [x] **Messages tab vs `messages` table** — **N/A (product)**  
   Inbox UI = **`maintenance_requests` only**. Removed `/api/messages`, `inbox-messages-api.js`, and `message_routes.py`. Optional: drop unused `public.messages` in Supabase.

6. [ ] **Apartment history (`apartment_history`)**  
   **Partial:** API route exists (`GET /api/apartments/{apartment_id}/tenant-history` in `apartment_routes.py`) and history screens call it, but UI still merges/falls back to embedded `tenantHistory` from apartment cache. Keep open until local fallback is removed and API is sole source.

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

11. [x] **Support / misc (`support.js`)**  
    **Decided:** keep explicitly client-only for now (`walajna_support_chat` in localStorage). No Supabase table/API required in current scope.

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
| `walajna_payments` | Deprecated for main flows; optional legacy in `WalajnaPaymentsStorage` |
| `walajna_apartments` | Session mirror + API; local key demo/offline only |
| `walajna_documents` | Deprecated when authed; API documents + session cache |
| `walajna_buildings` | API buildings |
| `walajna_costs` | New costs table + API (if needed) |
| `walajna_messages` | Not used by Messages page (requests-only); safe to ignore or clear |
| `walajna_users` | API users + session |
| `walajna_requests` | Already deprecated; delete leftover data in browser if any |

---

## Priority E — API performance & fetch efficiency (do last)

**Intent:** Cut latency and duplicate work (fewer Supabase round trips, less data per screen). This is **separate** from storage migration: it can start in small slices anytime, but treat **full** alignment (scoped endpoints + reconcile review) as **after** Priority A–D items that touch the same routes and pages—so you do not thrash `owner-building`, `apartment_routes`, and finance flows twice.

**Rough effort:** quick wins (indexes, one scoped read + client switch) are **short**; deeper changes (aggregated “building dashboard” response, reconcile-on-read policy) are **medium** and need regression checks on lease status and `maintenance_id` sync.

### Plan (ordered)

1. [ ] **Measure** — In the browser Network tab, note TTFB and payload size for `GET /api/apartments`, `GET /api/buildings`, `GET /api/maintenance`, and `GET /api/contracts/.../installments` on the owner building and apartment detail flows. Optionally add simple timing logs around Supabase calls in FastAPI for the same routes.

2. [ ] **Database indexes** — In Supabase, confirm indexes exist on columns the API filters often (at minimum: `apartments.owner_id`, `apartments.building_id`, `apartments.tenant_user_id`, FK-style columns used in joins/filters). Add missing indexes; re-measure list endpoints.

3. [ ] **Scoped apartment reads** — Add a server route that returns apartments **for one `building_id` only** (with the same auth rules as today: owner must own the building). Example shape: `GET /api/buildings/{building_id}/apartments` or `GET /api/apartments?building_id=...`. Implement the same response shape / reconciliation behavior as `GET /api/apartments` for owners, but **only for rows in that building**, so payload and work shrink.

4. [ ] **Wire owner building page** — Point `owner-building.js` at the scoped apartments call (and keep `GET /api/buildings` as today). Stop downloading the full owner apartment list for that screen when a building id is known. Align with checklist item 4 when you remove local building fallbacks.

5. [ ] **Optional: building “summary” bundle** — If still slow, add one read that returns building + apartments (+ minimal finance hints) in **one** handler and one round trip from the browser; use only where it clearly wins over (3)+(4).

6. [ ] **Reconcile policy** — Review `_reconcile_owner_apartment_statuses` and `_reconcile_owner_apartment_maintenance_pointers` on `GET /api/apartments`: avoid **writing** to `apartments` on every list request if reads can stay correct with computed fields or less frequent sync (detail page, PATCH flows, or a periodic job). Any change here needs explicit tests for overdue / maintenance pointer behavior.

7. [ ] **Installments / finance** — Prefer **one** batched installments query for many contracts (or server-side aggregation) over N calls to `GET /api/contracts/{id}/installments` from the client for the same page load.

8. [ ] **Re-verify UI** — After backend changes, confirm apartment detail action buttons, finance cards, and tenant vs owner views still match; keep any client-side “don’t block UI on slow sub-requests” patterns you already added.

---

*Last updated: 2026 — Added Priority E (API performance plan). Priority A item 2: apartments list from `/api/apartments` + session (`walajna_apartments_session`); item 1 (payments) wired to `/api/payments` + installments.*
