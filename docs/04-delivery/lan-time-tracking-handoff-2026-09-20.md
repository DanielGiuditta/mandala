# LAN time-tracking handoff — 20 September 2026

## Release status

**READY FOR ONE CONTROLLED IT TIME-TRACKING SESSION.** The Windows audit, exact-ZIP
two-restart rehearsal and independent artifact/evidence review passed. This does
not establish execution on STP54 or production acceptance. The September 19
reports establish that the 1.2.2 report-export error
prevented repair; they do not establish the original gateway exit cause.

Scope: restore time tracking through the existing configured gateway and one
already-paired employee in their original Windows account. LAN website, previews,
file shares, new employee pairing and wider rollout are outside this handoff.

## Exact artifact and Windows evidence

- Kit version: **1.2.3**.
- Recipient file: **`Mandala-Surjith-1.2.3.zip`**, in Daniel's Downloads folder.
- Tested source: `697014494898ba26e033e47efb5016ed4c029c46`.
- ZIP size: **50,573,096 bytes**.
- ZIP SHA-256: `6e094282d285970940bbab6dfcd3efdf6c3c14efd1076c3af6dd219886221dbd`.
- [Full Windows audit 35549274713](https://github.com/DanielGiuditta/mandala/actions/runs/35549274713): **passed**, completed September 21 at 01:13:27 UTC.
- Maintainer Mac download verified September 21 at 01:14:45 UTC: ZIP hash/size,
  all 19 files and inventory, approved Agent installer bytes and source text
  matched. Source comparison permits only UTF-8 BOM/line-ending normalization;
  executable and inventory hashes are checked byte for byte.
- Independent review repeated the ZIP/inventory/source checks and inspected the
  actual CI summaries. No artifact defect found; no nested ZIP, private key,
  private environment, office report, test fixture or gateway installer present.
- Actual approved Agent 1.0.15: five distinct synthetic receipts, zero duplicates,
  real enrolled HTTPS, offline close/reopen/reconnect, switch selection/cancel,
  and a **306-second** idle pause without automatic resume. Zero production
  requests or entries. Exact CMD/Internet-marked dependencies, invalid inputs,
  corrupt state and a real separate standard-user baseline also passed.
- [Exact-package real restart rehearsal 35550359605](https://github.com/DanielGiuditta/mandala/actions/runs/35550359605): **passed**, completed September 21 at 01:33:51 UTC. Windows boot identities were
  **01:26:17.466, 01:30:37.500 and 01:32:42.500 UTC**. The shipped launcher and
  first restart ran; passive observations found the exact Local Service listener
  after both restarts. Same-account packaged fallback completed nine automated
  gateway checks plus one synthetic human observation, with none failed.
  Setup-helper re-entry, unchanged pairing/server certificate, exact firewall
  address scope and trusted mutual TLS passed. Independent review repeated these
  checks against the received JSON and successful run.
- Rehearsal harness commit: `44ae5be6cc1fbb423ca2f9a9c9777ad58857bcf9`.
  This differs from the immutable package's tested source above. Its only final
  change locates the uniquely named ZIP/audit text inside the combined CI
  artifact layout. Initial replay `35550260888` was canceled before Windows ran;
  it is not counted as a test pass.

The CI ZIP is named `MandalaRecoveryCandidate-1.2.3.zip`; the recipient copy is
renamed without repacking. Do not send the whole CI artifact collection, which
also contains an older standalone repair ZIP and maintainer evidence. The ZIP's
`REHEARSAL_REQUIRED` manifest field and CI audit sentence are build-time status;
**this completed September 20 New York / September 21 UTC clearance supersedes
that build-time status for the exact hash above**. It authorizes the planned IT
session, not office acceptance or wider rollout.

Durable maintainer evidence is under
`local-resources/lan-recovery-release-2026-09-20/` in the main repository:
`final-audit-35549274713`, `final-gateway-reboot-35550359605`, live installer
verification and `release-clearance.json`. The host-received
`guest-07-complete.json` is the final second-restart observation; the older
offline disk snapshot stopped at setup re-entry and is preserved as older evidence.

## Recipient sequence

Use one ZIP on both computers and the bundled `READ-FIRST.txt`. The single entry
point is `Start Mandala.cmd`:

1. Employee option 1 collects a read-only baseline. Its NOT CLEARED result is
   expected because functional time tests have not run.
2. Gateway STP54 option 2 repairs the configured installation, requests a restart
   and checks automatic startup. Resume in the same administrator account. Wait
   for the final **GATEWAY LOCAL CHECKS PASSED** result after restart.
3. Only after that result, employee option 3 runs in the original normal account.
   The employee signs in and explicitly consents to five real test entries. The
   workflow includes the employee restart, browser observation, LAN disconnect /
   reconnect, project switching and five-minute idle pause.
4. IT returns the current reports together, including the baseline. If a step
   stops, export existing evidence with option 4; preserve pending work and do
   not repeat time writes, reinstall or clear data.

Administrator approval, the employee login, two permitted projects and a separate
internet-connected browser are prerequisites. Daniel must review the returned
evidence and production records before calling the session accepted. There is no
measured hands-on office duration; lab automation timings are not an IT estimate.

## Demonstrated faults and validation

| Problem or risk | Change | Passing evidence for this release |
| --- | --- | --- |
| September 19 Desktop export exception prevented an approved repair | Mandatory protected checkpoints are independent of optional Desktop/ZIP copies; fallback paths and snapshot identities are explicit | Actual shipped gateway orchestration from sanitized resumed state, remove Desktop at approval, real repair and current fallback report |
| Storage loss during repair could strand the gateway | Prevalidation, backups, bounded repair completion in memory, recorded checkpoint failures and no subsequent reboot/time tests | Real Windows file locks at task stop, helper replacement, firewall and task stages; exact Local Service listener and pairing preservation |
| Process interruption could leave uncertain installed state | Revalidate observed installation before a freshly authorized idempotent repair | Separate repair processes terminated after helper/firewall/task changes, then recovered through shipped orchestration |
| Old startup configuration did not establish durable boot behavior | Restricted Local Service task, resilient launcher, scoped firewall and corrected setup helper | Exact downloaded package, real guest restart, passive listener observation, setup re-entry and second actual restart |
| Checker could read the reopened Agent before tracker controls existed | Bounded control-readiness wait retains process identity checks | Delayed UI/timeout/identity regressions and approved Agent offline close/reopen/reconnect scenario |
| Component tests did not prove approved Agent session behavior | Use unchanged approved Agent 1.0.15 and real enrolled HTTPS in a private fixture | Five distinct synthetic receipts: start/stop, offline persistence, two switch entries and real five-minute idle pause; one final receipt per session |
| Wrong account, broken package or ambiguous old evidence could mislead IT | Explicit role/mode, package inventory, normal-account employee checks, unique reports and export-only mode | Exact CMD in a path with spaces/special characters, Internet-marked scripts, corrupt state, invalid inputs and a real separate standard-user baseline |

The real gateway tests preserve pairing bytes and narrow employee firewall scope.
No production test account, service-role credential or production time write is
used by the rehearsal. Reports contain bounded diagnostics rather than raw keys,
tokens or journal contents.

## Limits of the release evidence

The reboot guest uses Windows Server 2025 evaluation media, a synthetic paired
device and a SYSTEM fixture account. Its observer proves automatic gateway start
before invoking the same-account packaged resume fallback. It does not exercise
interactive secure-desktop UAC approval, interactive RunOnce or the office's
endpoint policy. UAC cancellation and elevation-loop rejection are injected tests.

The actual approved Agent scenarios run on a separate Windows CI host against a
private in-memory upstream; they prove binary/transport/journal behavior, not SQL
or production acceptance. Employee startup configuration and normal-account
baseline are tested, but an actual employee desktop reboot remains part of the
office sequence. These are explicit limits, not claims that every original plan
gate was executed literally.

## Maintainer acceptance after IT returns the reports

Extract each current report separately, inspect its role, version, run/snapshot
identity and errors, and preserve any pending Agent journal. Run the read-only
verifier from this recovery branch with a private production environment:

```sh
node --env-file=<private-production-env> apps/desktop-agent/scripts/verify-office-test.mjs <employee-report.json> <gateway-report.json>
```

The private environment supplies `NEXT_PUBLIC_SUPABASE_URL` set to
`https://nzlajptokbcgeaifgnoq.supabase.co` and `SUPABASE_SERVICE_ROLE_KEY`. Keep it
only on the maintainer machine. Require exit code 0 and the generated
`<employee-report.json>.verified.json` status
`OFFICE ACCEPTANCE CHECKS PASSED - MAINTAINER REVIEW REQUIRED BEFORE ROLLOUT`.
An exception or missing output is not a pass.

Require all five exact sessions/entries with expected person,
projects, date, duration and source, no extra sessions, matching gateway address
and certificate, correct gateway-before-employee order, and no pending/error
state. Review IT's isolation confirmation separately from automated routing/TLS
observations. Missing or stale evidence is not permission to repeat time writes.

Office execution: **pending**. Production acceptance: **pending**. Wider rollout:
**not authorized by this handoff**.

## Product and release guardrails

Production remains `nzlajptokbcgeaifgnoq`. The approved employee installer stays
1.0.15; gateway transport stays 1.1.0. Fresh maintainer downloads matched live
production manifests and audited bytes. Only the employee installer is bundled;
do not reinstall the old gateway installer over the corrected helpers.

No database migration, domain field, office relationship, salary rule or resource
meaning changed. No divisions or cost centers were added. No product-model
deviation. Work remains isolated on `codex/lan-recovery-1.2.3`; pre-existing main
workspace changes were preserved.
