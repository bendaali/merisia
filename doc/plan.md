# Merisia Production Plan
This checklist keeps the production work small enough to track without losing the bigger security goal: Merisia must safely host user data, keep projects separated by owner, and make saving/loading designs reliable.
 

## Guiding Rules

- [x] Every private API route must know who the current user is.
- [x] Every folder and design query must be scoped to the current user.
- [x] Client input must never decide project ownership.
- [x] A user must never be able to read, update, delete, list, or infer another user's private designs.
- [x] Security fixes should include tests when the risk is user data exposure.

## Milestone 1: Project Structure And Baseline

Goal: make the prototype easier to evolve without mixing bootstrap code, route logic, and production behavior.

- [x] Move database initialization out of `server.js` into a dedicated migration/setup path.
- [x] Add a repeatable migration command.
- [ ] Split server code into small modules:
  - [x] database connection
  - [x] auth helpers
  - [x] auth routes
  - [x] project/folder routes
  - [x] middleware
- [x] Add a `.env.example` documenting required environment variables.
- [ ] Remove hardcoded production credentials from deployment configuration.
- [x] Keep demo seed data separate from production startup.

Done means: the app still starts locally, but schema changes are explicit and no longer hidden inside normal server boot.

## Milestone 2: User Accounts

Goal: support real registration and login with safe password storage.

- [x] Add a `users` table.
- [x] Add unique normalized email storage.
- [x] Add password hashing with a slow password KDF (`scrypt` for now).
- [x] Implement `POST /api/auth/register`.
- [x] Implement `POST /api/auth/login`.
- [x] Implement `POST /api/auth/logout`.
- [x] Implement `GET /api/me`.
- [x] Update `auth.html` to submit to the real login API.
- [x] Add a registration page or registration form.
- [x] Show useful login/register errors without exposing internals.

Done means: a user can create an account, log in, refresh the page, and still be recognized.

## Milestone 3: Sessions And Route Protection

Goal: make private screens and APIs inaccessible without authentication.

- [ ] Choose the session model:
  - [ ] signed JWT access tokens plus refresh strategy
- [x] Store auth state in `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
- [x] Add auth middleware for private API routes.
- [x] Protect `/dashboard`.
- [x] Protect `/editor/:id`.
- [x] Redirect unauthenticated users to `/auth`.
- [x] Redirect authenticated users away from `/auth` when appropriate.
- [x] Add logout UI from the dashboard.

Done means: opening dashboard/editor while logged out does not expose project data.

## Milestone 4: Ownership-Aware Data Model

Goal: folders and designs belong to users.

- [x] Add `owner_user_id` to `folders`.
- [x] Add `owner_user_id` to `designs`.
- [x] Add foreign keys from folders/designs to users.
- [x] Add indexes for common user-scoped queries.
- [x] Update folder creation/seeding to attach records to a user.
- [x] Ensure a design's `folder_id`, when present, belongs to the same user.
- [ ] Decide how to handle existing prototype data:
  - [ ] remove it in production, or
  - [ ] migrate it to a demo account

Done means: the database can represent many users without shared global project lists.

## Milestone 5: Authorization On Every Project API

Goal: close the biggest current vulnerability: project IDs must not grant access by themselves.

- [x] Scope `GET /api/folders` to `req.user.id`.
- [x] Scope `GET /api/designs` to `req.user.id`.
- [x] Set `owner_user_id` during `POST /api/designs`.
- [x] Scope `GET /api/designs/:id/xml` to `req.user.id`.
- [x] Scope `PUT /api/designs/:id/xml` to `req.user.id`.
- [x] Scope `DELETE /api/designs/:id` to `req.user.id`.
- [x] Return consistent 404/403 behavior for unauthorized project IDs.
- [x] Add tests proving User A cannot access User B's designs.

Done means: guessing another design ID cannot reveal or modify anything.

## Milestone 6: Reliable Server-Side Saving

Goal: make project saving trustworthy, not dependent on browser-local state.

- [x] Decide canonical storage format:
  - [x] structured JSON in the database
- [x] Keep XML export/import as a user feature even if JSON becomes canonical.
- [x] Update editor load to treat the server design as the source of truth.
- [x] Avoid applying old global `localStorage` state across different projects.
- [x] Save design metadata such as title, status, kind, and updated time.
- [x] Add an explicit save state in the editor:
  - [x] unsaved
  - [x] saving
  - [x] saved
  - [x] failed
- [ ] Add autosave with debounce after core auth is stable.
- [x] Add version or `updated_at` conflict detection for stale saves.

Done means: opening Project A and Project B in the same browser never mixes their content.

## Milestone 7: Dashboard Project Flow

Goal: make the dashboard a real project manager for the current user.

- [x] Ensure the Designs button opens the authenticated user's dashboard.
- [x] Ensure each design row opens the correct `/editor/:id`.
- [x] Add empty-state behavior for new users.
- [x] Add project title editing.
- [x] Add folder creation.
- [x] Add moving a design between folders.
- [x] Add archive/unarchive behavior or remove archive UI until supported.
- [x] Fix share behavior:
  - [x] implement explicit share links with permissions

Done means: a normal user can create, find, open, rename, organize, and delete their own designs.

## Milestone 8: Input Validation, Realtime Validation, And XSS Hardening

Goal: user-controlled HTTP data, imported design data, and websocket collaboration messages should never become executable HTML, unsafe database input, or trusted editor state without validation.

- [ ] Add request validation with `zod` or a similar schema library for HTTP routes.
- [x] Validate auth payloads.
- [x] Validate folder payloads.
- [x] Validate design metadata payloads.
- [x] Validate design XML/JSON size and shape.
- [ ] Extract one shared canonical diagram schema for:
  - [x] `PUT /api/designs/:id`
  - [ ] JSON import
  - [ ] XML import payloads
  - [x] websocket `diagram` messages
- [x] Validate websocket message envelopes by `type`.
- [x] Reject websocket messages with unknown `type` values.
- [x] Clamp websocket `presence.cursor` to finite numeric coordinates.
- [x] Limit websocket `presence.selection` length and ID size.
- [x] Limit websocket `presence.editing` length and allowed shape.
- [x] Validate websocket `diagram` payload size before accepting or broadcasting.
- [x] Validate websocket `request_edit` messages against current role and authenticated identity.
- [x] Ensure guests can only send safe read-only websocket messages such as `ping` and bounded presence.
- [ ] Add tests for malformed websocket messages:
  - [ ] invalid JSON
  - [ ] oversized presence
  - [ ] oversized diagram payload
  - [ ] viewer/guest mutation attempts
  - [ ] unknown message type
- [x] Replace dashboard `innerHTML` rendering for user-controlled values or escape values safely.
- [x] Review all alert/error rendering for unsafe text insertion.
- [ ] Add tests or manual checks for project/folder/module/entity titles containing HTML/script text.
- [ ] Add tests or manual checks for collaborator names/emails rendered in presence toasts and cursors.
- [ ] Add tests or manual checks for note text, entity attributes, association names, and module labels containing HTML/script text.

Done means: malicious names, notes, imported JSON/XML, and live collaboration messages render as inert text or get rejected before they can affect another user.

## Milestone 9: Platform Security Basics, Sessions, And Realtime Transport

Goal: apply common web protections to both HTTP and websocket traffic before calling the app production-ready.

- [x] Add `helmet`.
- [x] Add auth route rate limiting.
- [x] Add CSRF protection for cookie-based HTTP mutations.
- [x] Lock down CORS to known origins.
- [x] Set strict JSON/body size limits for HTTP requests.
- [x] Add centralized error handling.
- [x] Avoid leaking stack traces or database errors to clients.
- [x] Serve only intended public/build assets in production.
- [x] Remove broad `express.static(__dirname)` exposure.
- [x] Confirm cookies are `Secure` behind HTTPS in production.
- [x] Enforce strict websocket origin checks during upgrade.
- [x] Require authenticated session cookies for private websocket rooms.
- [ ] Require signed share tokens for guest websocket rooms.
- [x] Re-check design access and role during websocket connection setup.
- [x] Re-check design access before accepting editor-only websocket messages.
- [x] Ensure viewers and guests cannot broadcast diagram mutations.
- [x] Add websocket connection rate limiting per IP/session.
- [x] Add websocket message rate limiting per connection.
- [x] Add websocket max message size limits.
- [x] Add websocket ping/pong heartbeat.
- [x] Clean up stale websocket presence.
- [x] Close websocket rooms cleanly when access is revoked.
- [x] Close websocket rooms cleanly when a design is deleted.
- [ ] Avoid broadcasting sensitive emails to guests or unauthorized viewers.
- [ ] Review presence payloads for least-privilege exposure.
- [ ] Add structured security logs for:
  - [ ] failed auth
  - [ ] forbidden HTTP project access
  - [ ] rejected websocket upgrade
  - [ ] rejected websocket mutation
  - [ ] websocket rate-limit events
- [ ] Add deployment proxy guidance for websocket upgrades.
- [ ] Confirm production HTTPS also serves websocket traffic over `wss://`.

Done means: HTTP and websocket collaboration share the same trust boundaries, role checks, transport protections, and observability.

## Milestone 10: Tests And Verification

Goal: make regressions visible before deploy.

- [x] Add a test runner. (node:test + supertest)
- [x] Add auth tests:
  - [x] register
  - [x] login
  - [x] logout
  - [x] `/api/me`
- [x] Add authorization tests:
  - [x] cross-user list isolation
  - [x] cross-user read blocked
  - [x] cross-user update blocked
  - [x] cross-user delete blocked
- [x] Add project CRUD tests.
- [x] Add editor save/load API tests.
- [ ] Add build check to CI.
- [ ] Add test command to CI.

Done means: the most sensitive user-data paths are covered by automated checks.

## Milestone 11: Deployment Readiness

Goal: make production hosting predictable and recoverable.

- [ ] Add production Docker configuration.
- [ ] Use strong generated secrets in production.
- [ ] Run behind HTTPS.
- [ ] Use managed Postgres or a hardened VPS Postgres.
- [ ] Add database backups.
- [ ] Add basic structured logging.
- [ ] Add health checks.
- [ ] Add simple monitoring for errors and failed auth attempts.
- [ ] Document deployment steps.
- [ ] Document rollback steps.

Done means: the service can be deployed, monitored, and restored without guesswork.

## Later, After Core Trust Is Solid

These are useful, but should not distract from auth, ownership, and reliable saving.

- [ ] Account deletion.
- [ ] Data export.
- [ ] Team workspaces.
- [ ] Project version history.

## Current Priority

Start here:

- [x] Finish the remaining Milestone 1 cleanup: route module split.
- [x] Add automated auth and cross-user authorization tests.
- [x] Add editor save-state UI and stale-save conflict detection.
- [x] Add folder/project management UI: folder creation, title editing, moving designs, archive.
- [x] Add security middleware: `helmet`, rate limiting, CSRF protection, and locked CORS.
- [x] Decide whether to upgrade Vite/esbuild now or track the current moderate dev-server audit finding until the toolchain upgrade can be tested. **Decision: defer.** Vite is 5.4.21 (latest 8.x); jumping three majors with `@vitejs/plugin-react@4` also requires plugin major bump. The audit finding only affects the dev server, not the served production bundle. Re-evaluate once the toolchain is covered by tests.
- [x] Link designs by UUID instead of guessable sequential ids (URLs and API IDs).
- [x] Realtime collaboration: presence list, cursor, current selection/modification broadcast.
- [x] Undo button + `Ctrl+Z` history in the editor.
- [x] Shared project links with explicit permissions.
- [ ] Password reset flow.
- [ ] Email verification.
- [ ] Login with Google (OAuth).
- [ ] Admin dashboard.

## Critical Priority
- [ ] Groups should be user specific even on shared designs
- [ ] Show a mention on the dashboard if the design is shared or owned
- [ ] Sharing button should be hidden if the design isnt owned
- [ ] Replace emojis with react icons
- [ ] Add copy-paste and cut (with shortcuts)
- [ ] Add redo shortcut (ctrl+shift+z, ctrl+y)
- [ ] redo the security hardening plan (added new collab features that could be vulnerable)



The first production checkpoint is complete only when a logged-in user can create and save their own design, and another logged-in user cannot access it by URL, API call, or guessed ID.
