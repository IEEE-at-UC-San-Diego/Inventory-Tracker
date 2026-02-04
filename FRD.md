# Functional Requirements Document (FRD)

## Inventory Tracker with Blueprint-Based Location System

Framework: TanStack Start + TanStack Router/Query • Backend: Convex (DB + Storage) • Auth: Logto
Scope: Single organization, multi-user, role-based access, realtime multi-client sync

---

## 1. Purpose

Build a multi-user inventory tracking system where physical parts are tracked by category and transactions (check-in/out/move), and are also mapped to a 2D “blueprint” representing drawers/compartments. Users can click a part to highlight its drawer/compartment on the blueprint, and click a compartment to view its contents.

---

## 2. Goals & Non-Goals

### 2.1 Goals

* Multi-user inventory tracking under one organization
* 2D blueprint editor + viewer for drawers/compartments
* Part → location mapping with highlight + “zoom to location”
* Check-in/out, moves, adjustments, and full audit history
* Realtime updates across clients (Convex subscriptions)
* Strong authentication via Logto, with reliable user identity in Convex
* Role-based access control (RBAC): admin / manager / member / viewer
* Works well with TanStack Router + TanStack Query patterns

### 2.2 Non-Goals (v1)

* Cross-org multi-tenancy (explicitly single org)
* Google-Docs style collaborative blueprint editing (CRDT/OT)
* Advanced warehouse logistics (pick waves, shipments, vendor POs) beyond basic inventory

---

## 3. User Personas

* **Admin**: manages users, roles, blueprint edit permissions, global settings.
* **Manager**: manages inventory, creates parts, edits locations/blueprints (if allowed), reviews audits.
* **Member**: checks items in/out, views inventory and locations.
* **Viewer**: read-only, can locate parts.

---

## 4. Key Concepts & Definitions

* **Blueprint**: a 2D layout representing a physical storage system.
* **Drawer**: a high-level container shape on the blueprint.
* **Compartment**: sub-region within a drawer, where parts are stored.
* **Part**: a type of component (e.g., “M3x8 screw”).
* **Stock**: quantity + optional serial/lot metadata.
* **Location Assignment**: mapping of part (or stock lot) to compartment with quantity.
* **Transaction**: append-only record of inventory changes, including check-in/out/move/adjust.

---

## 5. Authentication & Identity Sync (Logto ↔ Convex)

### 5.1 Requirements

* Logto is the source of truth for authentication and user identity.
* Convex must store a local user record that is **linked** to Logto’s user identity.
* Users must be “provisioned” into Convex on first login (JIT provisioning).
* Role changes in Logto must propagate to Convex (webhook-based).
* Convex role changes (admin actions in app) must propagate back to Logto (admin API-based), where feasible.

### 5.2 Identity Model

* **Canonical user id**: Logto user ID (`logtoUserId`).
* Convex maintains:

  * `users` table with `logtoUserId`, email, name, avatar, status, roles.
  * Optional `orgMembership` (since single org, can be simplified into `users.orgRole`).

### 5.3 Sync Mechanisms

**A) Logto → Convex (required)**

1. **On login (client)**:

   * Obtain Logto ID token / access token.
   * Call a TanStack Start server function (or API route) to:

     * Verify token with Logto JWKS.
     * Upsert user into Convex (`upsertUserFromLogto` mutation).
2. **On role change / user updates**:

   * Configure Logto webhook events (user updated, role assigned, role removed).
   * Webhook handler validates signature, then calls Convex mutation:

     * `applyLogtoUserUpdate(logtoUserId, claims/roles/metadata)`.

**B) Convex → Logto (required “vice versa”)**

* Admin actions inside the app that modify roles must:

  * Update Convex user role.
  * Call Logto Admin API to assign/remove corresponding Logto roles.
* Ensure **idempotency**:

  * If Logto already has the role, no-op.
  * If Logto call fails, mark Convex user as `syncPending` and retry.

### 5.4 Failure & Recovery

* If Logto API is down: allow Convex role change to be staged but mark user `roleSyncStatus = pending`.
* Background retries:

  * Implement a Convex scheduled function (or Start cron job) to retry pending Logto sync actions.
* Audit every role change in `auditLog`.

### 5.5 Authorization in Convex

* Every mutation and sensitive query checks:

  * authenticated identity from verified Logto token
  * mapped Convex user record + role
  * per-resource rules (e.g., blueprint edit)

---

## 6. Functional Requirements

### 6.1 Inventory Catalog

**FR-INV-001** Users can create, edit, archive parts (admin/manager).
**FR-INV-002** Parts include fields:

* name, SKU (unique), category, description, tags
* unit (pcs, meters, etc.)
* optional image (stored in Convex storage)
* optional manufacturer/vendor fields (v1 optional)

**FR-INV-003** Users can search parts by name, SKU, category, tags.
**FR-INV-004** Parts list supports pagination/virtualization (50+ parts, scalable).

### 6.2 Stock & Location Tracking

**FR-STK-001** Each part has stock quantities, optionally across multiple compartments.
**FR-STK-002** A part can be assigned to one or many compartments with `quantityInCompartment`.
**FR-STK-003** Clicking a part highlights all compartments where it exists and outlines the parent drawer(s).
**FR-STK-004** Clicking a compartment shows:

* parts stored there
* quantities
* last transaction timestamps
* quick actions (check-out/check-in/move) based on permissions

### 6.3 Transactions (Check-in/out/move/adjust)

**FR-TXN-001** System supports transaction types:

* CHECK_IN (increase stock)
* CHECK_OUT (decrease stock)
* MOVE (transfer quantity between compartments)
* ADJUST (admin correction)
* CREATE_PART / ARCHIVE_PART (audit events)
* BLUEPRINT_EDIT (audit events)

**FR-TXN-002** Every transaction stores:

* id, timestamp
* actor (user id)
* part id
* delta (+/-)
* fromCompartmentId / toCompartmentId (as applicable)
* reason/notes

**FR-TXN-003** Transactions are append-only; current stock is derived/updated atomically server-side.

**FR-TXN-004** Concurrency rules:

* Prevent negative stock (server-side validation).
* Atomically apply changes in Convex mutations.
* For conflicts, mutation fails with user-visible error.

### 6.4 Blueprint Viewer

**FR-BP-001** Users can view the blueprint (read-only for members/viewers).
**FR-BP-002** Canvas supports pan/zoom, grid, and hover tooltips for compartments.
**FR-BP-003** Highlight states:

* selected part highlights compartments
* selected compartment highlights itself and shows details
* search result highlight & “zoom to” first match

### 6.5 Blueprint Editor

**FR-BP-101** Admin/Managers can create/edit blueprint(s).
**FR-BP-102** Editor tools:

* create drawer rectangle
* create compartments inside drawer (free draw + snap-to-grid)
* resize/move/rotate shapes (if rotation needed; optional v1)
* label drawers/compartments
* delete shapes (if empty or with warnings)
* snap-to-grid toggle

**FR-BP-103** Saving persists geometry into Convex:

* drawers and compartments with stable IDs
* versioning: blueprint has `version` increment on save
* optionally keep `blueprintRevisions` for undo/rollback (recommended)

**FR-BP-104** Multiuser editing policy (v1):

* **edit lock** at blueprint level (recommended):

  * one editor at a time with heartbeat
  * others see “read-only, currently being edited by X”

### 6.6 Organization & Roles (Single Org)

**FR-ORG-001** Single org exists; all users belong to it.
**FR-ORG-002** Roles: admin, manager, member, viewer.
**FR-ORG-003** Admin can invite users (via Logto invitation or app-driven invite email).
**FR-ORG-004** Role changes sync to Logto and Convex (see §5).

### 6.7 Audit & Activity

**FR-AUD-001** Every transaction and admin action is logged.
**FR-AUD-002** Audit log view supports filters:

* date range, user, part, transaction type, compartment/drawer
  **FR-AUD-003** Export audit log to CSV (optional v1).

### 6.8 Storage & Media

**FR-MED-001** Parts can have images stored in Convex storage.
**FR-MED-002** Blueprint optional background image upload (e.g., photo of cabinet) for tracing (optional v1).

---

## 7. User Flows

### 7.1 First Login (Provisioning)

1. User logs in via Logto
2. Client receives tokens
3. Client calls Start server function `syncUser()`
4. Server verifies token and calls Convex `upsertUserFromLogto`
5. App loads with user role/permissions from Convex

### 7.2 Locate a Part

1. User searches/selects part in list
2. UI queries assignments (Convex query)
3. Blueprint highlights compartments + drawer outlines
4. “Zoom to location” centers canvas on compartment bounding box
5. Side panel shows location details and actions

### 7.3 Check Out

1. User selects part → location (or selects compartment)
2. Input quantity + optional note
3. Client calls Convex mutation `checkOut(partId, compartmentId, qty)`
4. Mutation validates stock, appends transaction, updates derived stock state
5. Realtime updates propagate; UI refreshes via subscription

### 7.4 Blueprint Edit (Lock)

1. Manager clicks “Edit Blueprint”
2. Mutation `acquireBlueprintLock(blueprintId)` succeeds → lock owner set
3. User edits in canvas
4. Save triggers `saveBlueprint(blueprintId, drawers, compartments)` mutation
5. Lock released on exit or timeout

---

## 8. UI / Routing Requirements (TanStack Start)

### 8.1 Routes

* `/` dashboard
* `/parts` list + filters
* `/parts/$partId` detail + transactions + locations
* `/blueprint` viewer
* `/blueprint/edit` editor (requires role)
* `/locations` (optional) list of drawers/compartments
* `/audit` audit log
* `/admin/users` user management (admin only)
* `/settings` org settings (admin)

### 8.2 TanStack Router Requirements

* Route-level auth guards:

  * loader checks session (Logto token presence) and role from Convex user
  * redirects unauthorized users
* Route loaders should prefetch:

  * parts list query
  * blueprint query
  * user profile query

### 8.3 TanStack Query Requirements

* Use Query for:

  * parts lists (cached + paginated)
  * part detail + transactions
  * blueprint geometry
  * compartment contents
* Mutations:

  * check-in/out/move/adjust
  * blueprint edits + lock acquire/release
  * user role updates (admin)
* Invalidation strategy:

  * Prefer Convex realtime queries where possible (minimal manual invalidation)
  * For non-realtime views (exports), invalidate on successful mutations

### 8.4 Realtime UI Expectations

* Inventory quantities update without refresh when another user performs a transaction
* Blueprint highlights update instantly when location assignments change
* Locks show presence (“Edited by …”)

---

## 9. Data Requirements (Convex Schema – High Level)

Tables (conceptual):

* `users`
* `parts`
* `blueprints`
* `drawers`
* `compartments`
* `locationAssignments` (partId ↔ compartmentId ↔ qty)
* `transactions`
* `blueprintLocks`
* `roleSyncQueue` (for Convex → Logto retry)
* `auditLog` (may be same as transactions depending on design)

Indexes:

* parts by SKU, category, name
* assignments by partId, compartmentId
* transactions by partId, compartmentId, timestamp
* compartments by drawerId, blueprintId

---

## 10. Permission Matrix

| Action                    | Admin | Manager |               Member |       Viewer |
| ------------------------- | ----: | ------: | -------------------: | -----------: |
| View parts/blueprint      |     ✅ |       ✅ |                    ✅ |            ✅ |
| Check-in/out/move         |     ✅ |       ✅ |                    ✅ |            ❌ |
| Create/edit/archive parts |     ✅ |       ✅ |                    ❌ |            ❌ |
| Edit blueprint            |     ✅ |       ✅ |                    ❌ |            ❌ |
| Manage users/roles        |     ✅ |       ❌ |                    ❌ |            ❌ |
| View audit log            |     ✅ |       ✅ | ✅ (limited optional) | ✅ (optional) |

---

## 11. Non-Functional Requirements

### 11.1 Performance

* Supports 50+ concurrent users without UI degradation
* Blueprint supports 500–2,000 compartments with acceptable pan/zoom (Konva-based)
* Search results within 200ms (excluding network)

### 11.2 Reliability

* No negative stock
* All mutations are validated server-side
* Audit log is append-only and immutable

### 11.3 Security

* All Convex mutations validate identity and role
* Logto tokens verified server-side (JWKS)
* Webhooks validated with signatures/secrets
* Least-privilege roles

### 11.4 Observability

* Transaction logs accessible in-app
* Server logs capture sync failures (Convex ↔ Logto)
* Admin panel shows “role sync pending” and retry controls

---

## 12. Acceptance Criteria (Testable)

* A newly logged-in Logto user appears in Convex `users` on first visit.
* Admin changes a user role in-app → role is updated in Convex and reflected in Logto.
* Role changed in Logto → within webhook processing window, Convex role updates.
* Two browsers open: one checks out stock → the other updates quantities and highlights without refresh.
* Clicking a part highlights correct compartments and drawers on the blueprint.
* Blueprint edit lock prevents second user from editing simultaneously.
* MOVE transaction transfers quantities between compartments atomically and audit log reflects it.

---

## 13. Open Design Decisions (defaults recommended)

* **Blueprint geometry storage**: absolute coordinates in blueprint units (recommended).
* **Multiple blueprints**: allow multiple (recommended) or single active blueprint (simpler).
* **Assignments**: allow part across multiple compartments (recommended).
* **Serial numbers/lots**: optional; defer unless you need it.

---

## 14. Implementation Notes (Guidance)

* Keep Logto token verification in TanStack Start server functions for secure identity bootstrap.
* Use Convex queries for realtime state: parts, assignments, blueprint, lock state.
* Use Konva for canvas; treat blueprint as a persistent model, editor state as ephemeral.
* Start with blueprint-level locking; evolve to per-object locking later if needed.

