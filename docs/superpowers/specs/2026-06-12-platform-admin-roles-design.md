# Platform Admin Roles Design

Date: 2026-06-12

## Objective

Add a global user administration model that is separate from collection ownership.

The system must support:

- multiple platform admins;
- one root super-admin account tied to `marc.roger@outlook.fr`;
- irreversible protection of that root super-admin role through normal application and database flows;
- future administration UI without changing the collection role model.

This design explicitly does **not** include the flag-country highlighting work yet.

## Scope

In scope:

- global role data model;
- SQL migration(s);
- RLS and trigger protections;
- backend/frontend role resolution helpers;
- minimal admin-facing read/write capabilities for future UI integration;
- tests for the new security rules.

Out of scope:

- visual flag-country highlighting;
- full admin dashboard UX;
- moderation workflows beyond role assignment;
- audit logging beyond timestamps.

## Current State

The application currently has:

- per-collection roles only: `owner` and `editor`;
- public official collections modeled via `visibility = public_readonly`;
- one-off ownership reassignment for official public collections through migration;
- no global platform-level role model;
- no app-level notion of a root administrator.

This means collection governance and platform governance are currently mixed together, which is fine for bootstrapping but too weak for long-term administration.

## Recommended Approach

Use a dedicated global role table: `public.user_roles`.

Why this approach:

- it cleanly separates platform authorization from collection authorization;
- it scales to multiple elevated roles without polluting `profiles`;
- it allows strict database-side protections around the root super-admin;
- it keeps future admin UI straightforward.

Rejected alternatives:

- adding `is_admin` / `is_super_admin` columns to `profiles`: simpler short-term, but mixes profile data and security state;
- environment-variable or hardcoded email lists in app/functions: too fragile and not queryable from the app.

## Data Model

### New enum

`public.platform_role`:

- `admin`
- `super_admin`

### New table

`public.user_roles`

Columns:

- `user_id uuid not null references public.profiles(id) on delete cascade`
- `role public.platform_role not null`
- `created_at timestamptz not null default timezone('utc', now())`
- `updated_at timestamptz not null default timezone('utc', now())`

Constraints:

- primary key on `(user_id, role)`
- optional unique partial policy is not required because one user may hold exactly one platform role in practice, but for clarity the implementation should enforce one row per user by role policy and API usage

Recommended simplification:

- allow at most one platform role row per user by making `user_id` the primary key and storing one `role` value.

Final recommended shape:

- `user_id uuid primary key references public.profiles(id) on delete cascade`
- `role public.platform_role not null`
- timestamps

This is simpler and matches the current requirement set.

## Root Super-Admin Rule

The root super-admin is the account whose auth email is:

- `marc.roger@outlook.fr`

The database migration must:

1. find the matching row in `auth.users`;
2. seed or upsert a `public.user_roles` row with `role = 'super_admin'`;
3. keep this row protected from downgrade or deletion by normal SQL flows.

## Database Helpers

Add SQL helpers:

- `public.is_platform_admin() returns boolean`
- `public.is_super_admin() returns boolean`

Behavior:

- `is_super_admin()` returns true when the authenticated user has role `super_admin`;
- `is_platform_admin()` returns true when the authenticated user has role `admin` or `super_admin`.

These helpers will be used by RLS and by future API paths.

## Protection Rules

### RLS

Enable RLS on `public.user_roles`.

Policies:

- authenticated users can read their own role row;
- platform admins can read all role rows;
- only super-admin can insert admin role rows;
- only super-admin can update role rows;
- only super-admin can delete role rows;

This keeps the first version simple and strict.

### Trigger-level protection

RLS alone is not enough for the root account protection requirement. Add a trigger function that prevents:

- deleting the `super_admin` role row for the root account;
- changing the root row from `super_admin` to anything else;
- changing the `user_id` on that row.

The trigger should compare against the root account by current database identity, not by front-end input.

Recommended implementation:

- resolve the root user id from `auth.users` where `email = 'marc.roger@outlook.fr'`;
- if `old.user_id` matches that id and the operation is delete or downgrade, raise an exception.

This ensures nobody can remove root control through the application or ordinary SQL updates.

## App Data Access

### Frontend role resolution

Expose the current platform role through a small query layer in the app.

Recommended shape:

- `getCurrentPlatformRole(): Promise<"admin" | "super_admin" | null>`
- `listPlatformUsers(): Promise<...>` for a later admin screen
- `setPlatformRole(userId, role)`
- `removePlatformRole(userId)`

These should live in a separate admin API module rather than inside the collection API.

### User listing

For the first version, user administration should read from:

- `profiles`
- joined `user_roles`

If email display is needed, use either:

- a secure server-side function that returns emails for admins;
- or a dedicated mirrored email column in `profiles`.

Recommendation:

Do not expand this into full email exposure yet unless the first admin UI truly needs it.

For now, the root seed may still rely on `auth.users` in migration code only.

## Application Behavior

### Standard users

- no access to platform admin UI;
- no visibility into global roles;
- existing collection permissions unchanged.

### Admins

- can access future admin area;
- can view platform users;
- can manage standard user admin elevation only if permitted by final UI rules;
- cannot alter the root super-admin row.

### Super-admin

- full platform role management;
- full visibility of platform users and admins;
- protected from removal or downgrade.

## UI Surface

First implementation should only prepare minimal UI integration points rather than building a full module.

Recommended first surface:

- add role awareness to the authenticated shell;
- optionally expose a hidden or future route placeholder like `/admin`;
- do not block main product progress on a complete admin dashboard.

If a visible admin page is built in the same implementation cycle, keep it minimal:

- user list;
- current platform role;
- promote to admin;
- revoke admin;
- show root super-admin badge for `marc.roger@outlook.fr`.

## Collection Relationship

Platform roles must remain independent from collection ownership.

That means:

- an admin is not automatically owner of all private collections;
- public official collection administration can later be widened for admins through separate rules if desired;
- current collection `owner/editor` semantics stay intact.

For now, do not automatically make all platform admins collection owners. That would create hidden coupling and surprising behavior.

## Testing

### SQL tests

Add database tests covering:

- root `super_admin` seed exists when the target account exists;
- authenticated non-admin cannot read all `user_roles`;
- admin can read all `user_roles`;
- non-super-admin cannot insert/update/delete platform roles;
- super-admin can create and revoke `admin`;
- root `super_admin` row cannot be deleted;
- root `super_admin` row cannot be downgraded.

### Frontend tests

Add focused tests for:

- role fetch returning `null`, `admin`, `super_admin`;
- admin UI gating if a route/component is added;
- no regression for collection flows.

## Migration Plan

1. Create enum `platform_role`
2. Create table `user_roles`
3. Add helper functions
4. Add RLS policies
5. Add root-protection trigger
6. Seed `marc.roger@outlook.fr` as `super_admin`
7. Regenerate TypeScript database types
8. Add app-side admin API helpers
9. Add minimal UI gating or admin page
10. Add tests

## Risks

### Email dependency for root seed

The root role depends on the presence of `marc.roger@outlook.fr` in `auth.users`.

Mitigation:

- seed idempotently;
- no-op cleanly if the user does not exist yet;
- allow rerunning after the account exists.

### Overexposing user data

Global admin features can accidentally widen profile/email visibility.

Mitigation:

- keep admin-specific reads narrow;
- avoid exposing raw `auth.users` directly to the client;
- prefer SQL helpers and explicit server-side joins.

### Mixing platform and collection permissions

Admins may be expected to manage content everywhere.

Mitigation:

- keep the first version explicit: platform roles do not automatically rewrite collection ownership.

## Recommendation Summary

Implement a dedicated `user_roles` table with `admin` and `super_admin`, seed `marc.roger@outlook.fr` as the protected root `super_admin`, secure the model with both RLS and trigger-level protections, and keep platform governance separate from collection roles.
