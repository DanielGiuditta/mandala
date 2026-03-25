# Supabase workspace

Put local config, migrations, seeds, and policy SQL here.

## Rules

- Never change schema in production first.
- Create migrations locally and commit them.
- Keep seed data useful for the main V1 workflows.
- Treat RLS and storage rules as required deliverables.

## Auth setup notes

- The web app signs in through Supabase Auth with email/password.
- Account-backed people are invited through Supabase Auth and complete onboarding by opening the invite email, then setting a password at `/join`.
- The authenticated email must exactly match `public.user_accounts.email`.
- The app's authorization layer still resolves from `public.user_accounts`, `public.role_assignments`, and `public.client_project_access`.
- Creating an Auth user alone is not enough; the matching authorization rows must also exist.
- Local invite emails use `supabase/templates/invite.html`. Hosted projects must carry the same invite-template behavior in the Supabase dashboard so the invite lands on `/join?token_hash=...&type=invite`.
