# Platform Admin Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add global platform roles with a protected root super-admin for `marc.roger@outlook.fr`, while keeping collection roles unchanged.

**Architecture:** Introduce a dedicated `user_roles` table plus SQL helper functions, RLS, and root-protection triggers in Supabase. Expose role-aware admin APIs in the frontend and add minimal route-level/admin-page support without coupling platform governance to collection ownership.

**Tech Stack:** Supabase Postgres + RLS + triggers, React, TypeScript, TanStack Query, Vitest, SQL pgTAP tests.

---

## File Structure

### Database

- Create: `supabase/migrations/20260612xxxxxx_platform_admin_roles.sql`
  - add enum `platform_role`
  - add table `user_roles`
  - add helper functions
  - add RLS policies
  - add trigger protection
  - seed root super-admin if user exists
- Modify: `supabase/tests/rls.test.sql`
  - add coverage for platform role reads/writes and root protection

### Generated types

- Modify: `src/lib/database.types.ts`
  - add `platform_role` enum references
  - add `user_roles` table definitions
  - add any new helper function signatures if generated types already include functions

### Frontend data access

- Create: `src/features/admin/adminApi.ts`
  - current role fetch
  - list platform users
  - assign/remove admin role
- Create: `src/features/admin/adminKeys.ts`
  - query key helpers
- Create: `src/features/admin/adminContext.ts`
  - lightweight current-platform-role context types/hooks if needed
- Create: `src/features/admin/AdminPage.tsx`
  - minimal admin UI
- Create: `src/features/admin/AdminPage.test.tsx`
  - gating and user-role interactions
- Create: `src/features/admin/adminApi.test.ts`
  - admin API unit tests

### App integration

- Modify: `src/app/App.tsx`
  - add `/admin` route under authenticated shell
- Modify: `src/features/auth/AuthProvider.tsx` only if current user role is added there (prefer not to)
- Modify: `src/features/atlas/AtlasPage.tsx` or shared topbar host later only if a visible admin link is shown
- Modify: `src/app/App.test.tsx`
  - route coverage for admin access

### Docs

- Modify: `README.md`
  - document admin-role model and required migration push

---

### Task 1: Add failing SQL coverage for platform roles

**Files:**
- Modify: `supabase/tests/rls.test.sql`
- Test: `supabase/tests/rls.test.sql`

- [ ] **Step 1: Write failing SQL tests for the new table and root protections**

Add assertions for:

```sql
select has_table('public', 'user_roles', 'user_roles table exists');
select has_type('public', 'platform_role', 'platform_role enum exists');
select has_function('public', 'is_platform_admin', array[]::text[], 'platform admin helper exists');
select has_function('public', 'is_super_admin', array[]::text[], 'super admin helper exists');
```

Add behavioral tests patterned after the existing RLS suite:

```sql
select lives_ok(
  $$ insert into public.user_roles (user_id, role)
     values ('10000000-0000-0000-0000-000000000002', 'admin') $$,
  'super admin can create admin role'
);

select throws_ok(
  $$ delete from public.user_roles
      where user_id = '10000000-0000-0000-0000-000000000001' $$,
  '23514',
  'root super admin role is protected'
);
```

- [ ] **Step 2: Run SQL tests to verify they fail**

Run:

```bash
npx supabase test db
```

Expected: FAIL with missing `user_roles`, missing helper functions, or missing policies.

- [ ] **Step 3: Commit the failing-test checkpoint**

```bash
git add supabase/tests/rls.test.sql
git commit -m "test: add failing coverage for platform admin roles"
```

### Task 2: Implement platform roles migration

**Files:**
- Create: `supabase/migrations/20260612xxxxxx_platform_admin_roles.sql`
- Test: `supabase/tests/rls.test.sql`

- [ ] **Step 1: Create the migration file**

Run:

```bash
npx supabase migration new platform_admin_roles
```

Expected: a new timestamped SQL file appears under `supabase/migrations`.

- [ ] **Step 2: Write the enum, table, updated_at trigger, helper functions, RLS, and root-protection trigger**

Use this structure in the new migration:

```sql
create type public.platform_role as enum ('admin', 'super_admin');

create table public.user_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role public.platform_role not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger user_roles_set_updated_at
before update on public.user_roles
for each row execute function public.set_updated_at();

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = 'super_admin'
  );
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;
```

Add a root-protection trigger along these lines:

```sql
create or replace function public.protect_root_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_user_id uuid;
begin
  select id into root_user_id
  from auth.users
  where lower(email) = 'marc.roger@outlook.fr'
  limit 1;

  if root_user_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if old.user_id = root_user_id then
    if tg_op = 'DELETE' then
      raise exception using errcode = '23514', message = 'root super admin role is immutable';
    end if;

    if new.user_id is distinct from old.user_id or new.role <> 'super_admin' then
      raise exception using errcode = '23514', message = 'root super admin role is immutable';
    end if;
  end if;

  return new;
end;
$$;
```

Seed root role idempotently:

```sql
insert into public.user_roles (user_id, role)
select id, 'super_admin'::public.platform_role
from auth.users
where lower(email) = 'marc.roger@outlook.fr'
on conflict (user_id) do update
set role = 'super_admin',
    updated_at = timezone('utc', now());
```

- [ ] **Step 3: Add grants and RLS policies**

Add:

```sql
grant select, insert, update, delete on public.user_roles to authenticated;
alter table public.user_roles enable row level security;

create policy "users can read own platform role"
on public.user_roles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "platform admins can read all platform roles"
on public.user_roles for select
to authenticated
using ((select public.is_platform_admin()));

create policy "super admin can insert platform roles"
on public.user_roles for insert
to authenticated
with check ((select public.is_super_admin()));

create policy "super admin can update platform roles"
on public.user_roles for update
to authenticated
using ((select public.is_super_admin()))
with check ((select public.is_super_admin()));

create policy "super admin can delete platform roles"
on public.user_roles for delete
to authenticated
using ((select public.is_super_admin()));
```

- [ ] **Step 4: Run SQL tests to verify the migration works**

Run:

```bash
npx supabase test db
```

Expected: PASS for new platform-role coverage and existing RLS suite remains green.

- [ ] **Step 5: Commit the migration**

```bash
git add supabase/migrations supabase/tests/rls.test.sql
git commit -m "feat: add protected platform admin roles"
```

### Task 3: Regenerate types and add frontend admin API tests

**Files:**
- Modify: `src/lib/database.types.ts`
- Create: `src/features/admin/adminApi.test.ts`
- Test: `src/features/admin/adminApi.test.ts`

- [ ] **Step 1: Regenerate database types**

Run:

```bash
npx supabase gen types typescript --local > src/lib/database.types.ts
```

Expected: `user_roles` and `platform_role` appear in generated types.

- [ ] **Step 2: Write failing admin API tests**

Create `src/features/admin/adminApi.test.ts` with tests like:

```ts
import { describe, expect, it, vi } from "vitest";
import { createAdminApi } from "./adminApi";

describe("adminApi", () => {
  it("returns the current platform role", async () => {
    const client = {
      getCurrentRole: vi.fn().mockResolvedValue("super_admin"),
      listUsers: vi.fn(),
      setRole: vi.fn(),
      removeRole: vi.fn(),
    };

    await expect(createAdminApi(client).getCurrentPlatformRole()).resolves.toBe("super_admin");
  });

  it("lists users with optional platform role", async () => {
    const client = {
      getCurrentRole: vi.fn(),
      listUsers: vi.fn().mockResolvedValue([
        { id: "user-1", display_name: "Marc", avatar_url: null, user_roles: { role: "super_admin" } },
      ]),
      setRole: vi.fn(),
      removeRole: vi.fn(),
    };

    await expect(createAdminApi(client).listPlatformUsers()).resolves.toEqual([
      expect.objectContaining({ id: "user-1", role: "super_admin" }),
    ]);
  });
});
```

- [ ] **Step 3: Run the admin API test to verify it fails**

Run:

```bash
npm test -- src/features/admin/adminApi.test.ts
```

Expected: FAIL because `adminApi.ts` does not exist yet.

- [ ] **Step 4: Commit the failing frontend test checkpoint**

```bash
git add src/lib/database.types.ts src/features/admin/adminApi.test.ts
git commit -m "test: add failing frontend coverage for platform admin API"
```

### Task 4: Implement frontend admin API

**Files:**
- Create: `src/features/admin/adminApi.ts`
- Create: `src/features/admin/adminKeys.ts`
- Test: `src/features/admin/adminApi.test.ts`

- [ ] **Step 1: Implement a minimal admin API factory**

Create `src/features/admin/adminApi.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { getSupabaseClient } from "../../lib/supabase";

type Role = Database["public"]["Enums"]["platform_role"];
type Tables = Database["public"]["Tables"];

export type PlatformUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role | null;
};

export type AdminDataClient = {
  getCurrentRole(): Promise<Role | null>;
  listUsers(): Promise<Array<
    Pick<Tables["profiles"]["Row"], "id" | "display_name" | "avatar_url"> & {
      user_roles: Pick<Tables["user_roles"]["Row"], "role"> | null;
    }
  >>;
  setRole(userId: string, role: Role): Promise<void>;
  removeRole(userId: string): Promise<void>;
};

export function createAdminApi(client: AdminDataClient) {
  return {
    getCurrentPlatformRole() {
      return client.getCurrentRole();
    },
    async listPlatformUsers(): Promise<PlatformUser[]> {
      const rows = await client.listUsers();
      return rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        role: row.user_roles?.role ?? null,
      }));
    },
    async setPlatformRole(userId: string, role: Role) {
      await client.setRole(userId, role);
    },
    async removePlatformRole(userId: string) {
      await client.removeRole(userId);
    },
  };
}
```

- [ ] **Step 2: Add the Supabase-backed client**

Extend the same file with:

```ts
export function createSupabaseAdminDataClient(
  supabase: SupabaseClient<Database>,
): AdminDataClient {
  return {
    async getCurrentRole() {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) return null;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.role ?? null;
    },
    async listUsers() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, user_roles(role)")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as Array<
        Pick<Tables["profiles"]["Row"], "id" | "display_name" | "avatar_url"> & {
          user_roles: Pick<Tables["user_roles"]["Row"], "role"> | null;
        }
      >;
    },
    async setRole(userId, role) {
      const { error } = await supabase
        .from("user_roles")
        .upsert({ user_id: userId, role });
      if (error) throw error;
    },
    async removeRole(userId) {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
    },
  };
}

export const getAdminApi = () =>
  createAdminApi(createSupabaseAdminDataClient(getSupabaseClient()));
```

- [ ] **Step 3: Add query-key helpers**

Create `src/features/admin/adminKeys.ts`:

```ts
export const adminKeys = {
  role: () => ["admin", "role"] as const,
  users: () => ["admin", "users"] as const,
};
```

- [ ] **Step 4: Run frontend tests**

Run:

```bash
npm test -- src/features/admin/adminApi.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the admin API**

```bash
git add src/features/admin/adminApi.ts src/features/admin/adminKeys.ts src/features/admin/adminApi.test.ts
git commit -m "feat: add frontend platform admin API"
```

### Task 5: Add minimal admin page and route gating

**Files:**
- Create: `src/features/admin/AdminPage.tsx`
- Create: `src/features/admin/AdminPage.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Create `src/features/admin/AdminPage.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AdminPage } from "./AdminPage";

it("renders platform users for a super admin", async () => {
  const api = {
    getCurrentPlatformRole: vi.fn().mockResolvedValue("super_admin"),
    listPlatformUsers: vi.fn().mockResolvedValue([
      { id: "user-1", displayName: "Marc", avatarUrl: null, role: "super_admin" },
      { id: "user-2", displayName: "Alice", avatarUrl: null, role: "admin" },
    ]),
    setPlatformRole: vi.fn(),
    removePlatformRole: vi.fn(),
  };

  render(
    <QueryClientProvider client={new QueryClient()}>
      <AdminPage api={api as never} />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("Administration")).toBeVisible();
  expect(screen.getByText("Marc")).toBeVisible();
  expect(screen.getByText("Alice")).toBeVisible();
});
```

Add route coverage in `src/app/App.test.tsx` for authenticated access to `/admin`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/features/admin/AdminPage.test.tsx src/app/App.test.tsx
```

Expected: FAIL because `AdminPage` and `/admin` route do not exist.

- [ ] **Step 3: Implement a minimal admin page**

Create `src/features/admin/AdminPage.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getAdminApi, type PlatformUser } from "./adminApi";
import { adminKeys } from "./adminKeys";

export function AdminPage({ api = getAdminApi() }: { api?: ReturnType<typeof getAdminApi> }) {
  const [selectedRole, setSelectedRole] = useState<Record<string, "admin" | "super_admin">>({});
  const queryClient = useQueryClient();
  const roleQuery = useQuery({ queryKey: adminKeys.role(), queryFn: () => api.getCurrentPlatformRole() });
  const usersQuery = useQuery({ queryKey: adminKeys.users(), queryFn: () => api.listPlatformUsers() });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    await queryClient.invalidateQueries({ queryKey: adminKeys.role() });
  };

  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "admin" | "super_admin" }) => api.setPlatformRole(userId, role),
    onSuccess: refresh,
  });

  const removeRole = useMutation({
    mutationFn: (userId: string) => api.removePlatformRole(userId),
    onSuccess: refresh,
  });

  if (roleQuery.isLoading || usersQuery.isLoading) return <main role="status">Chargement de l'administration…</main>;
  if (roleQuery.data !== "admin" && roleQuery.data !== "super_admin") return <main role="alert">Accès administrateur requis.</main>;

  return (
    <main className="app-shell atlas-module-page">
      <section className="panel">
        <h1>Administration</h1>
        <p>Rôle actuel : {roleQuery.data === "super_admin" ? "Super-admin" : "Admin"}</p>
        <ul>
          {(usersQuery.data ?? []).map((user: PlatformUser) => (
            <li key={user.id}>
              <strong>{user.displayName}</strong> <span>{user.role ?? "standard"}</span>
              {roleQuery.data === "super_admin" ? (
                <>
                  <select
                    value={selectedRole[user.id] ?? "admin"}
                    onChange={(event) =>
                      setSelectedRole((current) => ({
                        ...current,
                        [user.id]: event.target.value as "admin" | "super_admin",
                      }))
                    }
                  >
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super-admin</option>
                  </select>
                  <button type="button" onClick={() => setRole.mutate({ userId: user.id, role: selectedRole[user.id] ?? "admin" })}>
                    Enregistrer
                  </button>
                  <button type="button" onClick={() => removeRole.mutate(user.id)}>
                    Retirer
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Add the authenticated `/admin` route**

Modify `src/app/App.tsx` to add:

```tsx
const AdminPage = lazy(async () => {
  const module = await import("../features/admin/AdminPage");
  return { default: module.AdminPage };
});
```

And route:

```tsx
<Route
  path="/admin"
  element={
    <CollectionWorkspace api={collectionApi}>
      <AdminPage />
    </CollectionWorkspace>
  }
/>
```

- [ ] **Step 5: Run UI tests**

Run:

```bash
npm test -- src/features/admin/AdminPage.test.tsx src/app/App.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the admin UI slice**

```bash
git add src/features/admin src/app/App.tsx src/app/App.test.tsx
git commit -m "feat: add minimal platform administration page"
```

### Task 6: Verify end-to-end role behavior and document rollout

**Files:**
- Modify: `README.md`
- Test: `supabase/tests/rls.test.sql`
- Test: `src/features/admin/adminApi.test.ts`
- Test: `src/features/admin/AdminPage.test.tsx`

- [ ] **Step 1: Document the new admin-role model**

Add a short section to `README.md`:

```md
## Administration plateforme

- les rôles globaux sont stockés dans `public.user_roles`
- `admin` peut accéder à l'administration plateforme
- `super_admin` peut gérer les autres rôles
- `marc.roger@outlook.fr` est seedé comme super-admin racine et son rôle ne peut pas être retiré par les flux normaux
```

- [ ] **Step 2: Run targeted test suite**

Run:

```bash
npx supabase test db
npm test -- src/features/admin/adminApi.test.ts src/features/admin/AdminPage.test.tsx src/app/App.test.tsx
npm run typecheck
```

Expected: PASS across SQL, frontend tests, and typecheck.

- [ ] **Step 3: Smoke-check local app paths**

Run:

```bash
docker compose up -d
```

Then verify manually:

- `http://localhost:5173/login`
- `http://localhost:5173/admin` as non-admin => blocked
- `http://localhost:5173/admin` as seeded super-admin => visible

Expected: admin route is gated by role and main flows still work.

- [ ] **Step 4: Commit docs and verification pass**

```bash
git add README.md
git commit -m "docs: describe platform admin role model"
```

## Self-Review

- Spec coverage:
  - dedicated global role table: Task 2
  - protected `marc.roger@outlook.fr` root role: Task 2 + Task 1 SQL coverage
  - helper functions and RLS: Task 2
  - frontend role resolution: Task 4
  - minimal admin surface: Task 5
  - tests: Tasks 1, 3, 5, 6
- Placeholder scan:
  - no `TODO`, `TBD`, or deferred implementation markers remain in tasks
- Type consistency:
  - plan consistently uses `user_roles`, `platform_role`, `getCurrentPlatformRole`, `listPlatformUsers`, `setPlatformRole`, and `removePlatformRole`
