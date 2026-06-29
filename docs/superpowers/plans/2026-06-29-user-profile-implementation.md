# User Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une page Profil permettant de modifier un nom d'utilisateur unique, un avatar, l'adresse email et la visibilite future dans les classements.

**Architecture:** `public.profiles` reste la source des informations de profil, Supabase Auth reste la source de l'email et un bucket public `avatars` stocke uniquement les images publiques. Une API React dediee masque Supabase derriere des operations testables, tandis que la base impose l'unicite du nom, le delai de 30 jours et la propriete des fichiers.

**Tech Stack:** React 19, TypeScript, React Query, React Hook Form, Zod, Supabase Auth/Postgres/Storage, Vitest, Testing Library, Docker Compose.

---

## File Map

- Create via CLI: `supabase/migrations/*_profile_identity_and_avatars.sql` - schema, username guard, Auth trigger fix, avatar bucket and RLS.
- Modify: `supabase/tests/rls.test.sql` - profile and avatar security coverage.
- Modify: `src/lib/database.types.ts` - generated profile columns.
- Create: `src/features/profile/profileApi.ts` - profile/Auth/Storage access boundary.
- Create: `src/features/profile/profileApi.test.ts` - API unit tests.
- Create: `src/features/profile/avatarImage.ts` - image validation and browser resize.
- Create: `src/features/profile/avatarImage.test.ts` - validation tests.
- Create: `src/features/profile/ProfilePage.tsx` - profile UI.
- Create: `src/features/profile/ProfilePage.test.tsx` - page behavior tests.
- Modify: `src/features/admin/ProfileMenu.tsx` - add the profile link and avatar/name rendering.
- Create: `src/features/admin/ProfileMenu.test.tsx` - profile identity, link and fallback tests.
- Modify: `src/app/App.tsx` and `src/app/App.test.tsx` - lazy protected route.
- Modify: `src/styles/global.css` - profile desktop/mobile styles.

### Task 1: Profile schema and avatar security

**Files:**
- Create via CLI: `supabase/migrations/*_profile_identity_and_avatars.sql`
- Modify: `supabase/tests/rls.test.sql`
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1: Generate the migration with the Supabase CLI**

Run:

```powershell
npx supabase migration new profile_identity_and_avatars
```

Expected: one new file ending in `_profile_identity_and_avatars.sql`. Use that exact generated file for every SQL step below.

- [ ] **Step 2: Add failing pgTAP assertions**

Add assertions covering the new columns, case-insensitive uniqueness, the 30-day guard, Auth email-only synchronization, bucket configuration and avatar write isolation. Use fixed UUID users already created by the test fixture and include checks equivalent to:

```sql
select has_column('public', 'profiles', 'username_changed_at');
select has_column('public', 'profiles', 'leaderboard_visible');

select throws_ok(
  $$ update public.profiles set display_name = 'AlreadyUsed' where id = '20000000-0000-0000-0000-000000000002' $$,
  '23505',
  null,
  'usernames are unique without case sensitivity'
);

select throws_ok(
  $$ update public.profiles set display_name = 'SecondChange' where id = auth.uid() $$,
  'P0001',
  'username can only be changed once every 30 days',
  'username cooldown is enforced by Postgres'
);
```

Add Storage tests proving that an authenticated user can write only under `<auth.uid()>/...` and cannot update or delete another user's object.

- [ ] **Step 3: Run the migration test harness to observe the expected failure**

Run:

```powershell
npm run test:migrations
```

Expected: static migration validation remains green; pgTAP execution is documented as pending because this project intentionally does not run the local Supabase stack. Do not start a second local database.

- [ ] **Step 4: Implement the migration**

The migration must:

```sql
alter table public.profiles
  add column if not exists username_changed_at timestamptz,
  add column if not exists leaderboard_visible boolean not null default true;

update public.profiles
set display_name = left(
  coalesce(nullif(btrim(display_name), ''), split_part(coalesce(email, 'user'), '@', 1), 'user'),
  21
) || '-' || substr(id::text, 1, 8)
where char_length(btrim(display_name)) not between 3 and 30
   or exists (
     select 1
     from public.profiles duplicate
     where duplicate.id <> profiles.id
       and lower(btrim(duplicate.display_name)) = lower(btrim(profiles.display_name))
   );

alter table public.profiles drop constraint if exists profiles_display_name_length;
alter table public.profiles
  add constraint profiles_display_name_length
  check (char_length(btrim(display_name)) between 3 and 30);

create unique index if not exists profiles_display_name_ci_unique_idx
on public.profiles (lower(btrim(display_name)));

create or replace function public.enforce_profile_username_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.display_name := btrim(new.display_name);
  if new.display_name is distinct from old.display_name then
    if old.username_changed_at is not null
       and old.username_changed_at > statement_timestamp() - interval '30 days' then
      raise exception 'username can only be changed once every 30 days';
    end if;
    new.username_changed_at := statement_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_username_change on public.profiles;
create trigger profiles_enforce_username_change
before update of display_name on public.profiles
for each row execute function public.enforce_profile_username_change();

revoke all on function public.enforce_profile_username_change() from public;
```

Create a trigger that changes `username_changed_at` only when `display_name` changes and raises `username can only be changed once every 30 days` if the previous timestamp is less than 30 days old. Preserve the first voluntary change by leaving normalized rows with `username_changed_at = null`.

Replace the current Auth trigger with two explicit behaviors:

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_name text;
  candidate_name text;
begin
  base_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'user'
    ),
    30
  );

  if char_length(base_name) not between 3 and 30
     or exists (
       select 1 from public.profiles profile
       where lower(btrim(profile.display_name)) = lower(btrim(base_name))
     ) then
    candidate_name := left(base_name, 21) || '-' || substr(new.id::text, 1, 8);
  else
    candidate_name := base_name;
  end if;

  insert into public.profiles (id, display_name, avatar_url, email)
  values (
    new.id,
    candidate_name,
    new.raw_user_meta_data ->> 'avatar_url',
    nullif(btrim(new.email), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = nullif(btrim(new.email), '')
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_email_updated on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create trigger on_auth_user_email_updated
after update of email on auth.users
for each row execute function public.sync_profile_email();
```

The INSERT branch must first try the trimmed email prefix when it is between 3 and 30 characters and not already used. Otherwise it must generate `left(prefix, 21) || '-' || substr(new.id::text, 1, 8)`. This prevents a duplicate email prefix from aborting account creation after the unique index is active.

Create the bucket and policies exactly around the authenticated user's first path segment:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users upload own avatars" on storage.objects;
create policy "users upload own avatars"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "users update own avatars" on storage.objects;
create policy "users update own avatars"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "users delete own avatars" on storage.objects;
create policy "users delete own avatars"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
```

Do not expose profile emails through a new SELECT policy.

- [ ] **Step 5: Update generated TypeScript types**

Add to all `profiles` Row/Insert/Update shapes:

```ts
username_changed_at: string | null;
leaderboard_visible: boolean;
```

Use optional properties in Insert and Update.

- [ ] **Step 6: Validate and commit the database foundation**

Run:

```powershell
npm run test:migrations
npm run typecheck
```

Expected: both commands pass.

Commit only the generated migration, SQL tests and generated types:

```powershell
git add supabase/migrations supabase/tests/rls.test.sql src/lib/database.types.ts
git commit -m "feat: add public user profile settings"
```

### Task 2: Profile API and avatar processing

**Files:**
- Create: `src/features/profile/profileApi.ts`
- Create: `src/features/profile/profileApi.test.ts`
- Create: `src/features/profile/avatarImage.ts`
- Create: `src/features/profile/avatarImage.test.ts`

- [ ] **Step 1: Write failing API tests**

Define tests for loading the current profile, trimming a username, updating visibility, requesting an email change, replacing an avatar and cleaning the uploaded object when the profile update fails.

The test client contract must be:

```ts
export type ProfileDataClient = {
  getCurrentUser(): Promise<{ id: string; email: string | null }>;
  getProfile(userId: string): Promise<ProfileRow>;
  updateProfile(userId: string, input: ProfileUpdate): Promise<ProfileRow>;
  updateEmail(email: string): Promise<void>;
  uploadAvatar(path: string, file: Blob): Promise<void>;
  removeAvatar(paths: string[]): Promise<void>;
  getPublicAvatarUrl(path: string): string;
};
```

Run:

```powershell
npm test -- src/features/profile/profileApi.test.ts
```

Expected: FAIL because `profileApi.ts` does not exist.

- [ ] **Step 2: Implement the profile API**

Expose:

```ts
export type UserProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
  email: string;
  usernameChangedAt: string | null;
  leaderboardVisible: boolean;
};

export type ProfileApi = {
  load(): Promise<UserProfile>;
  updateUsername(username: string): Promise<UserProfile>;
  updateLeaderboardVisibility(visible: boolean): Promise<UserProfile>;
  requestEmailChange(email: string): Promise<void>;
  replaceAvatar(file: Blob, extension: "webp"): Promise<UserProfile>;
  removeAvatar(): Promise<UserProfile>;
};
```

Store the full public Storage URL in `profiles.avatar_url` so existing collection and administration screens can continue using it directly. `replaceAvatar` must upload `<userId>/<crypto.randomUUID()>.webp`, resolve its public URL, update `profiles.avatar_url`, then remove the previous object. Add `extractAvatarStoragePath(url)` and only delete an old object when the URL belongs to the configured `avatars` bucket. If update fails, remove the new object and rethrow the original error.

Map Postgres codes to stable application codes: `username_taken`, `username_cooldown`, `profile_update_failed`, `avatar_upload_failed`, `email_update_failed`.

- [ ] **Step 3: Write failing avatar validation tests**

Test these pure guards:

```ts
expect(validateAvatarFile({ type: "image/gif", size: 10 })).toEqual({
  valid: false,
  reason: "format",
});
expect(validateAvatarFile({ type: "image/png", size: 6 * 1024 * 1024 })).toEqual({
  valid: false,
  reason: "size",
});
```

- [ ] **Step 4: Implement avatar validation and conversion**

Expose:

```ts
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateAvatarFile(file: Pick<File, "type" | "size">) {
  if (!AVATAR_TYPES.has(file.type)) {
    return { valid: false, reason: "format" } as const;
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { valid: false, reason: "size" } as const;
  }
  return { valid: true } as const;
}

export async function prepareAvatar(file: File): Promise<Blob> {
  const validation = validateAvatarFile(file);
  if (!validation.valid) {
    throw Object.assign(new Error("Avatar invalide."), {
      code: `avatar_${validation.reason}`,
    });
  }

  const image = await createImageBitmap(file);
  const sourceSize = Math.min(image.width, image.height);
  const sourceX = (image.width - sourceSize) / 2;
  const sourceY = (image.height - sourceSize) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) {
    image.close();
    throw new Error("Canvas indisponible.");
  }
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    512,
    512,
  );
  image.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Conversion impossible.")),
      "image/webp",
      0.86,
    );
  });
}
```

Use `createImageBitmap`, crop around the image center, draw into a 512x512 canvas and call `canvas.toBlob(..., "image/webp", 0.86)`. Reject when conversion returns `null`.

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npm test -- src/features/profile/profileApi.test.ts src/features/profile/avatarImage.test.ts
npm run typecheck
```

Expected: all tests pass.

```powershell
git add src/features/profile
git commit -m "feat: add profile data API"
```

### Task 3: Profile page

**Files:**
- Create: `src/features/profile/ProfilePage.tsx`
- Create: `src/features/profile/ProfilePage.test.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write failing page tests**

Render the page with an injected `ProfileApi` and assert:

```tsx
expect(await screen.findByDisplayValue("Marco78270")).toBeInTheDocument();
expect(screen.getByDisplayValue("marc@example.test")).toBeInTheDocument();
expect(screen.getByRole("checkbox", { name: /apparaitre dans les classements/i })).toBeChecked();
```

Add interactions for username save, cooldown display, email confirmation notice, avatar paste/file selection, avatar removal and visibility toggle.

Run:

```powershell
npm test -- src/features/profile/ProfilePage.test.tsx
```

Expected: FAIL because the page is missing.

- [ ] **Step 2: Implement query and mutation state**

Use React Query keys:

```ts
export const profileKeys = {
  all: ["profile"] as const,
  current: () => [...profileKeys.all, "current"] as const,
};
```

Load once, update the cache from every successful mutation and disable only the form currently saving. Translate stable API errors into French messages adjacent to the relevant field.

- [ ] **Step 3: Implement the page layout**

Use the existing top bar and theme. The main area contains:

```tsx
<main className="profile-page">
  <section className="profile-identity-card" />
  <section className="profile-settings-grid">
    <form aria-labelledby="username-heading" />
    <form aria-labelledby="email-heading" />
    <section aria-labelledby="leaderboard-privacy-heading" />
  </section>
</main>
```

The avatar action accepts file picker, drag/drop and pasted image. Show a circular preview, supported formats and the 5 Mo source limit. The email form must explicitly state that Supabase sends a confirmation email.

- [ ] **Step 4: Add responsive styling**

Desktop: identity card plus two-column settings grid. Mobile under 760px: one column, full-width controls, compact top spacing and no horizontal overflow.

- [ ] **Step 5: Run tests and commit**

```powershell
npm test -- src/features/profile/ProfilePage.test.tsx
npm run typecheck
npm run lint
```

Expected: all commands pass.

```powershell
git add src/features/profile src/styles/global.css
git commit -m "feat: add user profile page"
```

### Task 4: Route and profile menu integration

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/features/admin/ProfileMenu.tsx`
- Create: `src/features/admin/ProfileMenu.test.tsx`

- [ ] **Step 1: Write failing navigation tests**

Assert that `/profile` renders inside `RequireSession`, anonymous access redirects to `/login`, and every account menu contains:

```tsx
expect(screen.getByRole("menuitem", { name: /mon profil/i })).toHaveAttribute("href", "/profile");
```

- [ ] **Step 2: Add the protected lazy route**

Add:

```tsx
const ProfilePage = lazy(async () => {
  const module = await import("../features/profile/ProfilePage");
  return { default: module.ProfilePage };
});
```

and `<Route path="/profile" element={<ProfilePage />} />` within the protected collection workspace.

- [ ] **Step 3: Add `Mon profil` to the account menu**

Use `CircleUserRound` and close the popover on navigation. Preserve admin visibility rules and sign-out behavior.

Load the current profile through the shared React Query key exported by `profileApi.ts`. Show `profile.username` instead of the email in the trigger and render the avatar when present, with the existing user icon as fallback. Keep the email visible only inside the private popover. Tests must prove that a failed profile query falls back to the current email without breaking sign-out.

- [ ] **Step 4: Verify and commit**

```powershell
npm test -- src/app/App.test.tsx src/features/admin/ProfileMenu.test.tsx
npm run typecheck
```

```powershell
git add src/app/App.tsx src/app/App.test.tsx src/features/admin/ProfileMenu.tsx src/features/admin/ProfileMenu.test.tsx
git commit -m "feat: expose profile navigation"
```

### Task 5: Production verification and deployment

**Files:**
- No new source files.

- [ ] **Step 1: Run the complete frontend verification**

```powershell
npm test
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: all commands pass; Vite may retain its existing MapLibre chunk-size warning.

- [ ] **Step 2: Review the remote migration before applying**

```powershell
npx supabase migration list
npx supabase db push --dry-run
```

Expected: the profile migration is the only new remote migration. Do not start local Supabase.

- [ ] **Step 3: Apply the migration**

```powershell
npx supabase db push
```

Expected: profile columns, avatar bucket, policies and triggers are applied successfully.

- [ ] **Step 4: Rebuild Docker and smoke-test**

```powershell
docker compose up -d --build
docker compose ps
(Invoke-WebRequest -UseBasicParsing http://localhost:5173/profile).StatusCode
```

Expected: both containers are `Up` and HTTP status is `200`.

- [ ] **Step 5: Manual smoke checks**

Verify with a standard user:

- username update succeeds once and then displays the 30-day lock;
- avatar survives reload and appears in the account area;
- email change shows a confirmation notice without resetting username/avatar;
- leaderboard visibility can be toggled;
- admin menu entry remains available only to admins.
