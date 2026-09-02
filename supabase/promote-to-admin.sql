-- ============================================================
-- Promote an existing account to administrator.
--
-- Run this in the Supabase SQL Editor AFTER the account exists under
-- Authentication → Users. It does not create accounts and never touches a
-- password: creating the login is a dashboard action, this only sets the role.
--
-- WHY THIS SCRIPT EXISTS
-- public.handle_new_user() assigns a role from the text BEFORE the "@" in the
-- email — 'admin', 'warehouse', 'procurement', 'site' or 'management' — and
-- anything else falls through to 'warehouse'. That mapping was written for the
-- seeded demo logins. A real member of staff (jdelacruz@, msantos@, …) therefore
-- lands on 'warehouse' however senior they are, so creating the account is only
-- half the job of making an administrator. This is the other half.
--
-- Safe to re-run, and safe to run before the person has ever signed in.
--
-- ON THE ROLE GUARD: profiles_guard_role stops a user changing their own role,
-- but exempts callers whose auth.uid() is null — which is what the SQL Editor
-- is. So this succeeds here and would be rejected from the browser, which is
-- the intended asymmetry. See guard_role_change() in schema.sql.
-- ============================================================

-- >>> Put the address between the quotes, then run. Nothing else to edit. <<<
with target as (
  select lower(trim('SOMEONE@megawide.com.ph')) as email
),

-- ONE upsert, not an INSERT followed by an UPDATE. The signup trigger normally
-- creates the profile row, but if it did not — account predates the trigger, or
-- its insert was rolled back — a bare UPDATE would silently match nothing, and
-- an INSERT in a sibling CTE would not rescue it, because data-modifying CTEs
-- all run against one snapshot and cannot see each other's rows. Upserting
-- covers both cases in a single statement.
--
-- On a profile that already exists only role and access_level are written, so a
-- name and department someone has filled in are left alone.
promoted as (
  insert into public.profiles (id, email, full_name, role, department, access_level)
  select u.id,
         u.email,
         initcap(split_part(u.email, '@', 1)),
         'admin'::wms_role,
         '—',
         'Full'
    from auth.users u, target t
   where lower(u.email) = t.email
  on conflict (id) do update
    set role         = 'admin'::wms_role,
        access_level = 'Full'
  returning public.profiles.email,
            public.profiles.full_name,
            public.profiles.role,
            public.profiles.access_level
)
select
  case when exists (select 1 from promoted)
       then 'OK — this account is now an administrator.'
       else 'NO ACCOUNT WITH THAT EMAIL. Create it first under '
            || 'Authentication → Users, then re-run. Check for typos.'
  end                                   as result,
  (select email        from promoted)   as email,
  (select full_name    from promoted)   as full_name,
  (select role::text   from promoted)   as role,
  (select access_level from promoted)   as access_level;


-- ------------------------------------------------------------
-- Optional: set the display name shown in the account menu and on the Users
-- screen. The statement above derives that name from the address itself
-- (jdelacruz@… becomes "Jdelacruz"), which is a placeholder, not a name.
--
--   update public.profiles
--      set full_name = 'Full Name Here', department = 'Procurement'
--    where email = 'someone@megawide.com.ph';
--
-- Optional: confirm who currently holds admin.
--
--   select email, full_name, role, status from public.profiles
--    where role = 'admin' order by email;
-- ------------------------------------------------------------
