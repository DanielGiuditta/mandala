# Production rollout: no time gaps (migration 20261024210000, website fix, Agent 1.0.18)

Status: **plan only. Nothing below has run against production.** Each gate needs the owner's explicit OK.

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
- Publish and install it only after Phase 1 has run cleanly for at least two working days.
- The LAN gateway on STP80 needs no change for any of this.

**Order:** Phase 1 (database → website) → watch two working days → Phase 2 (publish installer → one visit → remote verification).

## Credentials and tools (values never printed)

Loaded from the main checkout's `.env.deploy.local` (backend `nzlajptokbcgeaifgnoq`, dated 24 July) into environment variables for the session:

```bash
set -a
source <(grep -E '^(SUPABASE_PROJECT_REF|SUPABASE_DB_PASSWORD|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|VERCEL_TOKEN|VERCEL_ORG_ID|VERCEL_PROJECT_ID)=' "/Users/dangiuditta/Library/CloudStorage/Dropbox/dev/Mandala/.env.deploy.local")
set +a
export PGHOST=aws-0-ap-south-1.pooler.supabase.com PGPORT=5432 PGDATABASE=postgres PGSSLMODE=require
export PGUSER="postgres.${SUPABASE_PROJECT_REF}" PGPASSWORD="$SUPABASE_DB_PASSWORD"
test "$SUPABASE_PROJECT_REF" = nzlajptokbcgeaifgnoq   # refuse any other backend
```

Tools:
- `psql` (installed).
- The already-cached Vercel CLI 50.39.0: `node ~/.npm/_npx/00642693cc02dc5b/node_modules/vercel/dist/vc.js`. Nothing new is downloaded.
- `gh`.

Gate A confirms that the pooler host and the July password still work. If they don't, the alternative hosts are `aws-1-ap-south-1.pooler.supabase.com:5432` and the direct `db.nzlajptokbcgeaifgnoq.supabase.co:5432`. If the password is stale, the owner supplies a new one; this plan never resets it.

## Step 0: commit and push the rollout files (repository only)

- Commit `supabase/rollout/20261024210000/*`, `supabase/tests/rollout-20261024210000.test.mjs`, this document, and the `add column if not exists` change to the migration.
- Push `claude/no-time-gaps`.
- Everything later deploys from that exact commit, called `$ROLLOUT_COMMIT` below.

## Gate A: read-only checks (no production writes)

Every database command uses `PGOPTIONS='-c default_transaction_read_only=on'`, so Postgres itself refuses any write.

**A1. Database pre-check**

```bash
PGOPTIONS='-c default_transaction_read_only=on' psql -X -v ON_ERROR_STOP=1 -f supabase/rollout/20261024210000/precheck.sql
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
PGOPTIONS='-c default_transaction_read_only=on' psql -X -v ON_ERROR_STOP=1 -f "$WORKTREE/supabase/rollout/20261024210000/backup.psql"
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
PGOPTIONS='-c default_transaction_read_only=on' psql -X -v ON_ERROR_STOP=1 -f supabase/rollout/20261024210000/verify.sql
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
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H 'content-type: application/json' -d "$body"
done
```

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
- Revoking employees' direct `time_entries` inserts (audit D4).
- Audited "add missed time" for supervisors.
