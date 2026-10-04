# Five-employee LAN time pilot — one attended session

Updated October 4, 2026. This is the current pilot plan requested by Daniel. It replaces the old August installation matrix and the handoff's requirement to finish every rollout scenario before trying five employees. Historical evidence remains in the detailed handoff.

**Current decision: ready to prepare the session; employee pilot has not yet passed its live check.** Remote STP80 was unavailable when retried October 4, including with the supplied photo's credentials. No office setting or time record was changed in this preparation.

## What success means

Five employees can select a project, start, switch and stop work, with their actual time appearing once against the correct person/project in Mandala production. Include at least one computer without internet. Employee computers use their existing LAN to reach STP80; only STP80 needs internet.

The gateway must be reachable when starting work. After a confirmed start, an interrupted connection may leave stopped time pending on the employee PC until reconnection. This pilot does not add the ability to start a new session while the gateway or cloud is unavailable.

Route: employee Agent → `https://192.168.30.80:8443` (STP80) → `https://nzlajptokbcgeaifgnoq.supabase.co`.

## Book one session

Reserve about 45 minutes for access, pairing, the short test and five first saves. The combined time test itself takes about 10–15 minutes once connected. These are planning estimates; a real failure is captured once, not hidden by restarting the test.

Have these ready together:

- Surjith at the office with Windows administrator credentials. Installation and connection settings require administrator approval; daily tracking runs as the employee.
- STP80 powered on with UltraViewer open; STP32 reachable from it through NetSupport. Leave Mandala untouched initially so the maintainer can inspect the existing startup state.
- Five named employees, their normal Windows profiles and their own Mandala passwords. At least one LAN-only employee needs two existing authorized projects. Ruksana/STP32 is the existing candidate.
- An approved local file-transfer method between gateway and employees. Do not open file-server access from STP80 just to transfer the package.
- The verified pairing package and this checklist. Preserve Agent 1.0.16 on STP32. Do not reinstall Gateway 1.1.0 or open its old employee setup wizard.
- Daniel/maintainer connected and able to read production before any test writes. IT does not receive the production verification credential.

## Maintainer preparation — finish before asking IT to click through tests

1. Verify the pairing package against its Windows audit and manifest. The package fixes the old wizard's downgrade to 1.0.15 and renews expired public pairing requests while preserving the existing private key.
2. Download and verify `MandalaAgentSetup-1.0.16.exe` for any of the other four computers that actually need installation. Existing 1.0.16 needs pairing only. This installer requires Windows administrator approval. Expected bytes: `51062706`; SHA-256: `f517f48ace1638cea05471224938a660bb1def0d1ac17a794a16c2737d30dccb`.
3. Confirm production access and the pilot person's current account, allowed projects and active-session state. October 4 read-only checks confirmed STP32's candidate account active, two active projects (HiLITE Atlantis and HiLITE Olympus), and no active cloud timer. Recheck at the session; this says nothing about a local pending journal.
4. Prepare the evidence file for the bounded verifier and record independent timing from the maintainer's UTC clock/stopwatch. Record office action times in IST with date and AM/PM as well.

## A. Finish setup once

1. Observe STP80's existing task, listener, boot/start timestamps, configured production backend and clock before manually starting anything. Preserve the October 3 startup repair. A remote-access failure is not a gateway diagnosis. If a task failed, capture its result/log before repair; do not rerun the installer by default.
2. Surjith confirms the current office rule: employee LAN to STP80 TCP 8443; STP80 has production internet; STP80 cannot initiate access to the domain/file server. Preserve employee DNS, Windows domain login and file shares. Confirm STP32 still has no direct internet. Do not alter the firewall broadly.
3. In STP32's original employee profile, inspect active/pending work and preserve it. Close Agent only when no active work is being interrupted. Open the new **Start pairing.cmd**, choose **Employee computer**, then **Check agent and create PC request**. Keep the public request JSON.
4. On STP80, open the same new launcher, choose **Gateway computer**, approve the administrator prompt, then approve that employee request. Record the displayed address and pairing code. It should be STP80, never old STP54 (`192.168.1.58`).
5. Return the connection JSON to the same STP32 Windows profile. Choose **Complete connection**, enter the gateway pairing code, and approve the connection-settings administrator prompt. Confirm Agent 1.0.16, the production backend, correct account and both projects. Verify the current device's enrolled HTTPS connection. Never copy private keys or pending-time files between profiles.
6. Enroll all other LAN pilot computers now; each approval briefly restarts the gateway. Do this before anybody starts a timer. For a new computer, install only the exact verified 1.0.16 installer first. For an internet-connected computer using the existing direct mode, preserve that mode and verify its first save separately.
7. If employee startup needs checking after changing the connection, close/sign out only with the employee's work saved, then sign in normally and observe the Agent. Do not repeat earlier isolated release tests or reboot all five computers just to fill a report.

## B. One combined test on STP32

Use the normal employee profile and two projects already in the dropdown. Record each action time, displayed save reference and diagnostics in one folder. Start a stopwatch at each confirmed start. For project B, Surjith uses a phone stopwatch, stops it when clicking Stop, and records the phone's IST date/time including seconds; NetSupport will be unavailable during that part. Keep ordinary keyboard/mouse activity during the measured work periods.

| Step | Action | Required result |
| --- | --- | --- |
| 1 | Start project A; use the PC for at least two minutes. | Agent confirms tracking A. |
| 2 | Select B, cancel the switch once, then select B and confirm. | Cancel leaves A running. Confirm saves A once and starts B. Record A's save reference. |
| 3 | Use B for at least two minutes. Surjith then physically disconnects **only STP32's network cable**, while remaining beside it. | STP80 and the maintainer's UltraViewer session remain available. NetSupport to STP32 will drop as expected. |
| 4 | On STP32, Surjith clicks Stop, records its time, closes and reopens Agent in the same profile. | Time says saved locally/pending, survives reopening, and cannot start another timer while pending. No cloud-save claim while disconnected. |
| 5 | Surjith reconnects that cable immediately after checking pending state. Wait for normal reconnection/upload. | Pending clears and B gets one save reference. The disconnected waiting time after Stop is not added. |
| 6 | Export Agent diagnostics once; these contain full IDs, while the on-screen references are abbreviated. Maintainer checks both exact receipts and their linked production rows before the employee resumes work. | Correct employee, projects, start date, source `windows-tracker`, measured duration and two distinct entries; no extra or unfinished session. |

The physical disconnect step requires someone beside STP32 who can restore it. Do not run it remotely alone. If that person must leave, reconnect first and preserve the completed work; do not replay successful entries later. Do not use the old full automatic runner for this short test.

**Pass:** two correct production entries, accurate elapsed time, pending recovery once, no unresolved local work, current gateway connection healthy. Begin the five-person pilot in this same session. A general `NOT CLEARED` result from the older full-suite verifier does not invalidate a separately verified short test.

**Fail:** stop new tests at the first missing reference, wrong time/person/project, lost pending work or unexpected duplicate. Restore STP32's cable, preserve local state and collect the evidence below. Do not reinstall, clear the queue, fabricate a PASS or repeat entries to get a green report.

## C. Start the five-person pilot

The current user request authorizes five employees after the above bounded check; no separate one-person trial is required first. Each employee signs in using their own account and records one normal work period of at least two minutes. Verify the first save for each person. The combined test counts as STP32's first-save proof; do not repeat it. For direct-internet Agent mode, match the displayed entry reference to the production row; do not run the LAN receipt verifier against that different mode.

| Employee / email | PC / normal Windows profile | LAN-only or direct internet | Project | First save reference | Correct live row verified |
| --- | --- | --- | --- | --- | --- |
| Ruksana / existing STP32 account | STP32 / original profile | LAN-only | Atlantis → Olympus | Fill from combined test | Pending live test |
| Employee 2 | Select during session | | | | |
| Employee 3 | Select during session | | | | |
| Employee 4 | Select during session | | | | |
| Employee 5 | Select during session | | | | |

Run normal work for one workday first, then reconcile each person's entries and any pending saves. Observe idle pause, sign-in/startup, usability and ordinary interruptions during the pilot. Expand beyond five only after reviewing the results. Do not describe this as a fully accepted office rollout.

Tell employees: choose your project and Start; confirm when changing project; Stop when finished. After an idle pause, explicitly Start again. If it says pending or shows an error, stop retrying and report it. The gateway must remain on to start work and upload pending time.

## Return one evidence bundle

Surjith's deliverable is one folder/ZIP containing the checklist/cohort table, action times and two save references, Agent diagnostics from STP32, and one screenshot of any exact failure. The maintainer adds the read-only gateway observations and production verification output. Include machine, Windows profile, Agent version, gateway URL and actual backend. Do not include passwords, tokens, private keys or raw encrypted journals.

If setup blocks the test, include the exact first failed action and its full error. Leave original pending data in place. The maintainer diagnoses from this bundle; IT is not asked to independently invent another test.

## Maintainer-only verification

From the audited `codex/lan-clock-validation` worktree:

```text
node apps/desktop-agent/scripts/verify-pilot-save.mjs --example switch-offline > <private-session-folder>/pilot.json
node --env-file=<private-production-env> apps/desktop-agent/scripts/verify-pilot-save.mjs <private-session-folder>/pilot.json
```

Fill the template from observed actions and exact diagnostic references, not estimated database timings. Use `--example first-save` for another LAN employee's first save. The helper makes bounded read-only queries, writes a separate result, and leaves input evidence unchanged. It does not prove networking from database rows and does not grant rollout clearance. Existing `verify-office-test.mjs` remains the full-suite verifier unchanged.

## Finish the session

Leave STP80 running. Confirm STP32's cable and normal domain/file access restored, no active test timer and no new unresolved pending save. Close temporary admin windows; confirm the named remote PCs are locked when finished. Record who owns keeping STP80 on and its certificate renewal. Preserve the old gateway until remaining clients/pending work are inventoried.

No domain model or authorization changes are made: offices remain the organizational unit; time is actual work; assignments remain planned hours. No division/cost-center concepts or naming deviations are introduced.
