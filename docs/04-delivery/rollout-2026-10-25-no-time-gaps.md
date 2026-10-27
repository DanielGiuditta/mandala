# Production rollout: no time gaps (migration 20261024210000, website fix, Agent 1.0.18)

Status (27 October 2026, UTC). Each gate needs the owner's explicit OK.

| Gate | State |
| --- | --- |
| A | Done 25 Oct. Results in `local-resources/rollout-2026-10-25/GATE-A-RESULTS.md`. |
| B | Applied 25 Oct 16:19 UTC from `685d1f6`; verify passed. |
| C | Live 25 Oct 16:42 UTC as `dpl_4z8XBrWD7RXqZeojUWQdy2h6gj2K`; the owner's signed-in check passed (Atlantis 28.01 h). |
| B4 watch | Read-only script `local-resources/rollout-2026-10-25/b4-watch.sh`, run on the first India working days. |
| Agent 1.0.18 candidate | Windows CI run 40375253887 passed at `ce2c2dc` with publishing off: 13 exact receipts, 0 duplicates, 0 production requests. Restart resume was checked on real Windows: a forced stop while tracking with the gateway down, a restart after Stop, and a forced stop while idle-paused with the gateway down. |
| D, E | Not started. |
| D4 | Applied 27 Oct 01:02 UTC; verify and the public API probe passed. Results in `local-resources/rollout-2026-10-26-d4/D4-AND-WEB-RESULTS.md`. |
| Website fixes | Live 27 Oct 01:05 UTC from `5c6291f` as `dpl_5wptdsBbiGB6wTtTxShs5oFggchT`; the rollback target is `dpl_4z8XBrWD7RXqZeojUWQdy2h6gj2K`. The owner's signed-in check is pending. |

## Hard constraint: Windows changes are expensive (owner, 25 October 2026)

- **The people:** the owner works from New York and has no Windows machine. The employees and their Windows PCs are in India.
- **The overlap:** about 10 minutes a day of working-time overlap.
- **How a PC is reached:** remote desktop, UTM → UltraViewer → STP80 → NetSupport → the employee PC. Access is arranged asynchronously by IT, with roughly a 24-hour delay.
- **What follows:**
  - Every change to software on the PCs (the Windows agent, and the LAN gateway on STP80) costs a remote session.
  - Fix as much as possible on the server and website, which change from New York with no PC visit.
  - When the agent must change, ship **one** patch, **once**. Prove it in CI on real Windows beforehand, and install it in a single visit.
  - **Never plan on-site test loops.** Verify afterwards from New York, using production data from normal work.
  - An agent rollback means another visit, so the patch must be right before it ships.

## What changes, in two phases

All changes are on branch `claude/no-time-gaps`.

**Phase 1: server and website only. No PC is touched.**
- **Database migration `20261024210000_keep_all_desktop_time`** (also adds `agent_version` and `device_name` receipt columns, filled in by 1.0.18):
  - A Start is never refused because a session was left open on another PC; the old session closes at its last known activity + 5 minutes.
  - That PC can still upload its own stop, up to the moment the new session began.
  - Installed 1.0.17 agents get this immediately. This is what unblocks Ruksana, Sabith and Jabir.
- **Website:** project and people hours are read live (no stale cache), and project detail uses the same SQL total as the Projects list.

**What stays wrong with 1.0.17 until Phase 2** (agent-side, so the server can't fix it):
- Closing the agent window stops tracking until the agent is reopened.
- A Start whose response is lost or slow is saved as 0 h.
- No Start while the network or gateway is down.
- Up to 15 s lost when Windows shuts down.
- The project-switch dialog race.

**Interim mitigation** (no PC change, sent to employees via WhatsApp):
> Keep Mandala Agent open; minimise it, never close it. After pressing Start Work, check that it says "Tracking [project]". If it says "No active project", press Start Work again.

From New York, a daily read-only query flags 0-second sessions and sessions left open, so problems surface the same day.

**Phase 2: one Windows visit installs Agent 1.0.18 on all five PCs.**
- 1.0.18 requires the Phase 1 migration, because it sends a new start argument.
- 1.0.18 also resumes the last started project after an unexpected restart, such as the office's frequent power cuts (owner decision, 26 Oct). It resumes only on new keyboard or mouse input, for the same Windows user and Mandala account, on the same day. CI checks this on real Windows: a forced stop while tracking with the gateway down, a restart after explicit Stop, and a forced stop while idle-paused with the gateway down.
- Publish and install it only after Phase 1 has run cleanly for at least two working days.
- The LAN gateway on STP80 needs no change for any of this.

**Order:** Phase 1 (database → website) → watch two working days → Phase 2 (publish installer → one visit → remote verification).

## Credentials and tools (values never printed)

Loaded from the main checkout's `.env.deploy.local` (backend `nzlajptokbcgeaifgnoq`, dated 24 July) into environment variables for the session:

```bash
set -a
source <(grep -E '^(SUPABASE_PROJECT_REF|SUPABASE_DB_PASSWORD|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|VERCEL_TOKEN|VERCEL_ORG_ID|VERCEL_PROJECT_ID)=' "/Users/dangiuditta/Library/CloudStorage/Dropbox/dev/Mandala/.env.deploy.local")
set +a
export PGHOST=aws-1-ap-south-1.pooler.supabase.com PGPORT=5432 PGDATABASE=postgres PGSSLMODE=require
export PGUSER="postgres.${SUPABASE_PROJECT_REF}" PGPASSWORD="$SUPABASE_DB_PASSWORD"
test "$SUPABASE_PROJECT_REF" = nzlajptokbcgeaifgnoq   # refuse any other backend
```

Tools:
- `psql` (installed).
- The already-cached Vercel CLI 50.39.0: `node ~/.npm/_npx/00642693cc02dc5b/node_modules/vercel/dist/vc.js`. Nothing new is downloaded.
- `gh`.

Findings from Gate A (25 Oct):
- **Pooler host.** Only the `aws-1-ap-south-1` pooler reaches this project; `aws-0` answers "tenant not found". The July password works.
- **Rejected key.** The local `SUPABASE_SERVICE_ROLE_KEY` (an `sb_secret_` key) is rejected by production with "Invalid API key". Commands that need it are marked below.
- **Different copies of the key.** GitHub Actions has its own `SUPABASE_SERVICE_ROLE_KEY` (updated 4 Aug), which published 1.0.17 on 13 Oct. Vercel's copy dates from 24 Jul, like the rejected local one.
- **Read-only mode.** The pooler ignores `PGOPTIONS`. Read-only commands therefore start with `-c "set session characteristics as transaction read only"`, as below.

## Step 0: commit and push the rollout files (repository only)

- Commit `supabase/rollout/20261024210000/*`, `supabase/tests/rollout-20261024210000.test.mjs`, this document, and the `add column if not exists` change to the migration.
- Push `claude/no-time-gaps`.
- Everything later deploys from that exact commit, called `$ROLLOUT_COMMIT` below.

## Gate A: read-only checks (no production writes)

Every database command starts with `-c "set session characteristics as transaction read only"`, so Postgres itself refuses any write.

**A1. Database pre-check**

```bash
psql -X -v ON_ERROR_STOP=1 -c "set session characteristics as transaction read only" -f supabase/rollout/20261024210000/precheck.sql
```

It stops with `STOP: …` unless all of these hold:
1. 20261024210000 is not yet recorded (it also prints the migration history since July).
2. `desktop_work_sessions` has exactly its 8 current columns.
3. The live `start/touch/finish_desktop_work_session` and `require_active_desktop_person` function bodies are byte-identical (md5 of each body) to the repository's `20260907090000` versions, and the new helper doesn't exist yet.
4. Authenticated users can execute the current functions.

It then prints a baseline for later comparison:
- receipt counts and open receipts;
- `time_entries` count and hours by source;
- the open desktop sessions (expected: Ruksana, Sabith, Jabir from 19 Oct);
- active timers;
- overlapping receipt pairs (expected 0).

**A2. Backup export.** Read-only; it writes only local CSV files into `local-resources/rollout-2026-10-25/`, which git ignores.

```bash
mkdir -p ../../local-resources/rollout-2026-10-25 && cd ../../local-resources/rollout-2026-10-25
psql -X -v ON_ERROR_STOP=1 -c "set session characteristics as transaction read only" -f "$WORKTREE/supabase/rollout/20261024210000/backup.psql"
```

It exports `desktop_work_sessions`, `active_work_sessions` and `time_entries` in full.

**A3. Current website deployment** (read-only API call; the result is the rollback target):

```bash
curl -s -H "Authorization: Bearer $VERCEL_TOKEN" "https://api.vercel.com/v13/deployments/mandala-web-tau.vercel.app?teamId=$VERCEL_ORG_ID" | jq '{id, url, createdAt, readyState, meta}'
curl -s -o /dev/null -w '%{http_code}\n' https://mandala-web-tau.vercel.app/login
```

- The expected current deployment is `dpl_3CPYRaTmeq4StmPvhAXAzscvzYrJ` from `459af70` (local record of 13 Oct).
- If the API returns 403, as an earlier lookup did, website steps stop until access is sorted out.

**A4. Current installer manifest** (read-only storage GET):

```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/desktop-agent-releases/latest/release.json" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -o ../../local-resources/rollout-2026-10-25/release-before.json
```

The manifest should show version `1.0.17`, SHA-256 `ecb323a5…c93c406` and 51,070,938 bytes. This copy is the installer rollback.

Without a working key, the same proof comes from storage metadata (read-only SQL). Compare `storage.objects.metadata->>'eTag'` for `latest/release.json` with the MD5 of a local copy, as done on 25 Oct (`GATE-A-RESULTS.md`).

## Gate B: apply the database migration (production write)

**Timing.** Run it on a Sunday in India, or outside 09:00–19:00 IST. The DDL takes about a second. A Start that lands in exactly that second may fail once and is retried.

**B1. Apply.** One transaction, so either everything applies or nothing does:

```bash
psql -X -v ON_ERROR_STOP=1 --single-transaction \
  -f supabase/rollout/20261024210000/apply-guards.sql \
  -f supabase/migrations/20261024210000_keep_all_desktop_time.sql \
  -f supabase/rollout/20261024210000/record-migration.sql
```

| File | What it does |
| --- | --- |
| `apply-guards.sql` | `lock_timeout 5s`, `statement_timeout 60s`: fail instead of waiting on live requests. |
| the migration | Adds 6 nullable columns (`confirmed_at`, `stop_limit_at`, `superseded_by`, `client_finished_at`, `agent_version`, `device_name`). Adds internal helper `set_desktop_session_stop` (not callable by API users). Replaces `start_desktop_work_session`: the same 3 arguments plus optional `started_seconds_ago`, `agent_version` and `device_name`. Replaces `touch_` and `finish_desktop_work_session`. **No existing row is changed.** |
| `record-migration.sql` | Inserts `20261024210000 keep_all_desktop_time` into `supabase_migrations.schema_migrations` (as was done for 20260907090000), then `notify pgrst, 'reload schema'`. |

**B2. Verify** (read-only):

```bash
psql -X -v ON_ERROR_STOP=1 -c "set session characteristics as transaction read only" -f supabase/rollout/20261024210000/verify.sql
```

It fails with `FAIL: …` unless all of these hold:
- exactly the 6 new columns exist;
- every function body is byte-identical to the repository's new version;
- the old 3-argument start is gone;
- employees can execute start/touch/finish, and nobody can execute the helper;
- the migration is recorded.

Its baseline output must equal A1's.

**B3. API smoke test** (no write: the function rejects the service role before touching any table):

```bash
for body in \
  '{"session_id":"00000000-0000-4000-8000-000000000000","target_project_id":"00000000-0000-4000-8000-000000000000","entry_date":"2026-10-25"}' \
  '{"session_id":"00000000-0000-4000-8000-000000000000","target_project_id":"00000000-0000-4000-8000-000000000000","entry_date":"2026-10-25","started_seconds_ago":5}' \
  '{"session_id":"00000000-0000-4000-8000-000000000000","target_project_id":"00000000-0000-4000-8000-000000000000","entry_date":"2026-10-25","started_seconds_ago":5,"agent_version":"1.0.18.0","device_name":"CHECK"}'; do
  curl -s -w ' HTTP %{http_code}\n' -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/start_desktop_work_session" \
    -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
    -H 'content-type: application/json' -d "$body"
done
```

The public anon key reaches the function exactly like an agent, and the function refuses it before touching any table. The service key is not needed here.

- **Expected** for all three calls: HTTP 400 with "An active internal employee account is required." That proves the API routes both the installed agents' 3-argument call and 1.0.18's extended calls to the new function.
- **"Could not find the function" (PGRST202)** means installed agents can't start: run the rollback below immediately.

**B4. Watch.** On the next working day, run these read-only queries:
- new receipts appear with `confirmed_at` set (1.0.17 agents also go through the new function);
- no overlapping receipt pairs.

**What happens to the three accounts blocked since 19 Oct.** Nothing changes at apply time. The next time each person presses Start on any PC, the old session closes at its last server-known activity + 5 minutes:

| Person | Session | Saved |
| --- | --- | --- |
| Ruksana | 14:13:37–14:18:37 IST | 0.08 h |
| Sabith | 17:11:54–17:26:19 IST | 0.24 h |
| Jabir | 17:12:15–17:27:12 IST | 0.25 h |

If the original PC still holds a journal, opening the agent there uploads that PC's own stop, accepted up to the new start. Ideally IT copies `agent.log` from those PCs first.

**Rollback B.** Only valid while no 1.0.18 agent is installed anywhere.

```bash
psql -X -v ON_ERROR_STOP=1 --single-transaction \
  -f supabase/rollout/20261024210000/apply-guards.sql \
  -f supabase/rollout/20261024210000/rollback.sql
```

- Restores the exact 20260907090000 function bodies (copied verbatim), removes the helper and the history row, and reloads the API schema.
- Keeps the 6 columns, so nothing saved is dropped. The migration can be re-applied later, because the columns use `if not exists`.
- Rehearsed in `supabase/tests/rollout-20261024210000.test.mjs`: pre-check → apply → verify → rollback (bodies identical to before) → re-apply.

## Gate C: deploy the website fix (production write)

**C1. Build a clean export of exactly `$ROLLOUT_COMMIT`** (no local build output):

```bash
D="$SCRATCH/web-deploy-$ROLLOUT_COMMIT"; mkdir -p "$D/.vercel"
git -C "$WORKTREE" archive "$ROLLOUT_COMMIT" | tar -x -C "$D"
printf '{"orgId":"%s","projectId":"%s"}' "$VERCEL_ORG_ID" "$VERCEL_PROJECT_ID" > "$D/.vercel/project.json"
```

**C2. Deploy to production.** Vercel builds `apps/web` with the project's own production environment variables, in Mumbai (`bom1`):

```bash
cd "$D" && node ~/.npm/_npx/00642693cc02dc5b/node_modules/vercel/dist/vc.js deploy --prod --yes --token "$VERCEL_TOKEN"
```

**C3. Verify:**
- the deployment is READY and `mandala-web-tau.vercel.app` points to it;
- `/login` returns 200;
- `vc.js logs --deployment <new id> --level error --no-follow --token "$VERCEL_TOKEN"` shows no errors 10 minutes after the deploy;
- **owner check while signed in:** the Projects list and Atlantis detail (direct URL, then opened from the list, then reloaded after 10 s) show the same total. People list and person detail load.

**Rollback C** (instant alias switch back to the A3 deployment):

```bash
node ~/.npm/_npx/00642693cc02dc5b/node_modules/vercel/dist/vc.js rollback <A3 deployment id> --yes --token "$VERCEL_TOKEN"
```

## Gate D: publish installer 1.0.18 (production write, from New York)

Only after Phase 1 has run cleanly for at least two working days. Publishing does not install anything on the PCs.

**D1. Publish** with the same options used for 1.0.17:

```bash
gh workflow run build-desktop-agent.yml --repo DanielGiuditta/mandala --ref claude/no-time-gaps \
  -f version=1.0.18 -f publish_release=true -f publish_unsigned=true
```

- CI rebuilds from the branch head and repeats every check: regression tests, installer audit, and the real idle/resume/Stop audit.
- It publishes only if all of them pass.
- It writes two storage objects: `desktop-agent-releases/latest/MandalaAgentSetup-1.0.18.exe` (new) and `latest/release.json` (overwritten).
- The installer is unsigned, like 1.0.17, so Windows shows a publisher warning.

**D2. Verify** (AGENTS.md release rules):
- `latest/release.json` names 1.0.18, backend `nzlajptokbcgeaifgnoq`, and the SHA-256/size from that run's `installer-audit.json`;
- downloading `latest/MandalaAgentSetup-1.0.18.exe` to this Mac gives the same SHA-256 and byte size;
- **owner check:** `https://mandala-web-tau.vercel.app/desktop-agent` offers `MandalaAgentSetup-1.0.18.exe`.

**Key check before D2 and Rollback D.** Both use the local service key, which is rejected as of 25 Oct. First put a working secret key in `.env.deploy.local` (Supabase dashboard → API keys; owner only), then check it:
`curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/offices?select=id&limit=1"` must print 200. D1 itself runs in CI with the GitHub secret.

**Rollback D:** put the A4 manifest back. The 1.0.17 installer object is never touched.

```bash
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/desktop-agent-releases/latest/release.json" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'content-type: application/json' -H 'x-upsert: true' --data-binary @release-before.json
```

A PC already on 1.0.18 may go back to 1.0.17 **only when its agent shows no time waiting for upload**: 1.0.17 doesn't know about the 1.0.18 upload queue.

## Gate E: the one Windows visit

**Before the visit, all from New York:**
- Gate D is published and verified.
- **Owner check:** sign in and open `https://mandala-web-tau.vercel.app/desktop-agent`. It must offer the installer download. That page uses Vercel's `SUPABASE_SERVICE_ROLE_KEY`, which dates from the same day as the rejected local key. If it fails, either replace the key in Vercel, or bring the installer from the CI run's artifact (`gh run download`) and check its SHA-256.
- India has been told one day ahead, via the usual async route:
  > On [date], please press Stop in Mandala Agent when you finish work and leave your PC switched on and connected. Surjith: please leave STP80 on with UltraViewer available and send the access details as usual.

**During the visit** (UTM → UltraViewer → STP80 → NetSupport, no overlap needed), for each of STP54, STP43, STP57, STP13 and STP32:
1. Copy the exact file `MandalaAgentSetup-1.0.18.exe` to the PC (NetSupport file transfer from STP80).
2. As Windows administrator, run:
   ```
   MandalaAgentSetup-1.0.18.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
   ```
   - The installer force-closes a running agent (`CloseApplications=force`).
   - It upgrades in place and keeps the employee's sign-in, LAN pairing and saved time.
   - It does not relaunch the agent in silent mode.
3. Do **not** launch the agent from the administrator session; it would run under the wrong Windows profile. It starts by itself at the employee's next Windows sign-in, through the existing Startup shortcut.
4. Note the PC name and the time (IST). Nothing else: no test timers, no idle tests, no sign-in changes.

Roughly 2–3 minutes per PC, with no testing on site.

## Remote verification after the visit (replaces on-site acceptance tests)

Over the next two working days, using read-only production queries from New York:

- **Every PC is on 1.0.18:** each PC's new receipts carry `agent_version` 1.0.18.x and its `device_name`. Receipts with an empty `agent_version` come from a PC still on 1.0.17. The same columns show which account signs in on which PC, the pairing that has been unresolved since 14 October.
- Every employee's new receipts appear, with `confirmed_at` set.
- **Idle pause:** stop minus last activity is about 300 s.
- **Resume:** a new session on the same project begins after returning activity, with the idle gap not counted.
- **No** 0-second sessions, overlapping sessions, or sessions left open overnight.
- Daily totals look plausible for a working day. The owner compares them with what employees report.
- Projects list, project detail and person detail show the same totals for the same rows.

If something looks wrong, investigate from the data first. Ask India for a diagnostics export (Copy diagnostics → WhatsApp) only for a concrete, named problem.

## Not in this rollout

- The partners' daily gap report page (needs a design go-ahead).
- Revoking employees' direct `time_entries` inserts (audit D4). Done separately on 27 Oct; see below.
- Audited "add missed time" for supervisors.

## Follow-up fixes (26 October 2026, server and website only, no PC visit)

**D4: stop direct inserts of hours** (migration `20261026030000_deny_direct_time_entry_inserts`, commit `96f2cbb`):
- Drops the "authenticated users can insert self manual time entries" policy and revokes `INSERT` on `time_entries` from `anon` and `authenticated`.
- The timer functions that write hours are security definer and keep working. Reads and lead corrections are unchanged.
- Rehearsed in `supabase/tests/time-entry-integrity.test.mjs`. Production's current insert policy is byte-identical (md5 of `with_check`) to the one `rollback.sql` recreates.
- Read-only backup and pre-check passed on 26 Oct, 08:20 IST (`local-resources/rollout-2026-10-26-d4/`).
- **Applied 27 Oct 01:02 UTC** after a fresh backup and pre-check (218 entries, 109.49 h). Verify passed. Totals are unchanged. A direct insert with the public key now gets `permission denied for table time_entries`.

```bash
psql -X -v ON_ERROR_STOP=1 --single-transaction \
  -f supabase/rollout/20261026030000/apply-guards.sql \
  -f supabase/migrations/20261026030000_deny_direct_time_entry_inserts.sql \
  -f supabase/rollout/20261026030000/record-migration.sql
psql -X -v ON_ERROR_STOP=1 -c "set session characteristics as transaction read only" -f supabase/rollout/20261026030000/verify.sql
```

Rollback: `apply-guards.sql` + `rollback.sql`, in one transaction.

**Website fixes** (commit `5c6291f`; deploy exactly like Gate C, from a clean export of that commit):
- **D12:** personal totals and People weekly totals read every page, so they don't undercount past 1,000 rows.
- **D10:** the `/time-tracker` columns say "My".
- **D18:** only PGRST202 triggers the project-detail fallback.
- The dead direct-insert code path is removed.
- **Live 27 Oct 01:05 UTC** as `dpl_5wptdsBbiGB6wTtTxShs5oFggchT` (bom1), from a clean `git archive 5c6291f`. Checks: tests 37/37 and `tsc` clean. Post-deploy: routes as expected and no error logs. Rollback: `vercel rollback dpl_4z8XBrWD7RXqZeojUWQdy2h6gj2K`.

The website does not depend on D4, and D4 does not depend on the website, so they can go in either order.

**Repository only:** `20260831160000_add_test_data_markers.sql` was recovered from production's migration history. It was applied on 31 Aug, but no copy of the repository had it.
