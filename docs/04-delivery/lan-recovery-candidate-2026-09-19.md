# LAN time-tracking recovery candidate — 19 September 2026

## Status

**Historical engineering working log.** The final Windows audit, exact-ZIP
reboot replay and independent review passed. See the [current handoff record](lan-time-tracking-handoff-2026-09-20.md)
for release status and precise evidence limits. No office repair, employee test,
production acceptance or wider rollout is claimed.

The user's scope is time tracking on the LAN Windows employee computer. LAN web,
previews, file shares and wider employee rollout are excluded. The current flow
requires the existing configured gateway and already-paired employee profile.

## Demonstrated failure and changes

The September 19 saved gateway state continued kit 1.2.0 preflight under 1.2.2.
Maintenance was confirmed at 15:15:24 IST. At 15:15:32 IST, Desktop report writing
failed before the repair invocation. The older exported report stopped at 14:57.
Neither snapshot proves a repair or reboot. The old task exit result dates to
September 17 and does not establish the original startup cause.

Candidate changes:

- Required, flushed atomic checkpoints are separate from optional report exports.
  Gateway state lives under administrator-protected ProgramData; employee state
  under private LocalAppData, both in `Mandala Office Recovery/<Windows SID>`.
  Original `Mandala Office Test 1.2.0/<role>.json` is preserved and imported only
  if there is no new authoritative state. Baseline mode does not consume a run.
- Every report snapshot has a unique identity and UTC timestamp. Protected local
  reports are generated before optional Desktop copies. No old report is silently
  overwritten or reported as the latest snapshot. Export-only mode does not run
  repairs or employee scenarios.
- Recovery paths reject network drives and reparse points. Newly created folders
  have restricted ACLs; existing unrelated ownership/writable paths are rejected.
  New shareable filenames are sanitized independently of preserved evidence.
- Repair creates backups before stopping the task, replaces helpers atomically,
  and records mutation stages. Required initial checkpoint failure prevents the
  repair. If checkpoint storage fails after that point, the prevalidated bounded
  repair continues to its owned-listener check in memory; no reboot or employee
  tests follow. Such a storage failure remains NOT CLEARED for review.
- Partial process interruption remains a preflight recovery: a fresh maintenance
  confirmation is required; observed installation/configuration is prevalidated
  again; only the supported idempotent repair is reapplied. Unknown binary or
  policy drift stops rather than being overwritten. No employee writes replay.
- Additional fixed-field diagnostics cover task settings, expected action match,
  runtime/helper hashes, relevant ACLs, firewall filters, listener owner and recent
  task-event IDs/results. Raw command lines, event messages, credentials, private
  keys and journal bytes are excluded.
- One entry point offers employee read-only baseline, gateway repair, employee
  acceptance tests and existing-report export. Package inventory is checked before
  unblocking its specific dependencies. The baseline never launches Agent, signs
  in, pairs a device, changes startup or decrypts/copies journals.
- A direct-production probe detects employee routing bypass. A timeout/no route
  observation still requires IT policy confirmation; ambiguous TLS failures cannot
  pass as firewall isolation. Current verifier requires this new check and rejects
  unresolved primary/checkpoint errors.

## Validation so far

Local PowerShell syntax parsing passed. Node gateway-launcher and production-
verifier regressions pass, including newly added bypass/checkpoint-error rejection.
Portable executable report checks pass for atomic replacement, missing Desktop,
ZIP failure, mandatory checkpoint failure, old-snapshot preservation and output
path confinement. The portable test intentionally substitutes folder creation;
it **does not test Windows ACL enforcement**.

Windows audit [35546643236](https://github.com/DanielGiuditta/mandala/actions/runs/35546643236)
passed at `6e747ce`: Windows PowerShell 5 report/checkpoint tests, existing startup
and office checks, 52 Node regressions, installed Local Service gateway lifecycle,
approved Agent installer/UI/discovery, and extracted package inventory/export.
This is preliminary evidence, not the final artifact approval.

Subsequent Windows audit `35546950916` passed the actual gateway orchestration
and all four locked mutation checkpoints plus three subprocess interruptions.
It stopped later on an invalid address-prefix expression in the new Agent test
fixture. Audit `35547525132` passed those gateway checks again and exercised the
unchanged approved Agent through sign-in, project selection, a saved receipt and
offline journal creation. It then exposed an early UI lookup after offline
reopening: a missing tracker control threw before the intended wait could run.
The same pattern in the shipped checker was corrected in `fcafe3d` with a bounded
control-readiness wait that retains process identity checks. Neither failed
overall audit is a release pass. In audit `35548221326`, the approved-Agent stage
passed at 00:45:07 UTC on September 21: five distinct synthetic saved receipts,
offline journal preservation through normal close/reopen, switch/cancel behavior
and the real five-minute idle pause. That overall audit later failed its packaged
launcher test on missing process exit-code capture. The focused probe then found
test-harness double quoting in the standard-user wrapper. Those harness issues
were corrected in `279588d` and `6970144`; no production change was needed.
No production writes were made.

The final full Windows audit
[35549274713](https://github.com/DanielGiuditta/mandala/actions/runs/35549274713)
passed at `6970144`. Its exact downloaded ZIP is 50,573,096 bytes with SHA-256
`6e094282d285970940bbab6dfcd3efdf6c3c14efd1076c3af6dd219886221dbd`.
All 19 files, inventory and approved installer bytes were checked on the Mac.
The final exact-artifact guest replay `35550359605` subsequently passed both
actual restarts and setup re-entry. Independent artifact/evidence review cleared
the controlled IT session; see [the current handoff record](lan-time-tracking-handoff-2026-09-20.md).

The initial real Windows guest rehearsal `35547294996` booted official Server
2025 evaluation media and ran the gateway repair. Its lab assertion incorrectly
compared a canonical single-address firewall value with the equivalent `/32`
spelling, so it stopped before reboot. The lab comparison was corrected; no
firewall broadening or office configuration change was needed. The next guest
run exercised the downloaded CMD, shipped restart and same-account fallback.

**Preliminary real reboot rehearsal passed:** `35548016342`, using candidate
`6e747ce` (ZIP SHA-256
`885bc69850008741489f65ae9645bec0bbc4893cabfdab3dd3893a7e946ec9a7`). The exact CMD
ran the shipped gateway branch and restart; same SYSTEM-account fallback completed
the native checker with ten checks and none failed. Boot timestamps were
00:41:04, 00:47:14 and 00:50:07 UTC on September 21. Both post-boot listeners were
owned by Local Service; trusted mutual TLS, unchanged pairing bytes, exact single-
address firewall scope and setup re-entry passed. All prompt replies were marked
synthetic lab inputs. This does not establish office isolation, employee startup,
interactive UAC or RunOnce execution. The final artifact still needs replay.

The subsequent audit adds the actual shipped gateway orchestration over a real
installed gateway: missing Desktop at approval, required initial/approval saves,
four locked mutation checkpoints and three terminated repair processes. It also
adds an unchanged approved Agent with real enrolled HTTPS and an isolated in-memory
upstream. Synthetic account/projects/receipts cannot reach production; this tests
binary behavior and journal recovery, not SQL or office acceptance.

## Original release checklist (historical)

The following checklist was written before the Windows work below completed.
Use the current handoff record for completed evidence and remaining limitations,
including the distinction between injected elevation tests and interactive UAC.

- Windows CI, including actual Local Service/permissions/firewall/pairing lifecycle
  with these changes, must pass and the downloaded candidate must match its audit.
- Full packaged launcher reproduction of the September 19 interruption must run;
  helper/prompt tests alone are insufficient.
- Mutation-boundary checkpoint/process interruption tests must prove safe observed-
  state recovery, including actual stop/helper/firewall/task boundaries.
- Exact packaged UAC cancel/approve and standard-user employee baseline tests,
  including role mismatch and corrupt-state paths, need execution.
- A disposable Windows guest is being established for actual gateway reboot,
  a second persistence reboot and setup re-entry. The actual approved Agent's
  login/start/stop/offline/switch/idle behavior uses synthetic authorized fixture
  data on a separate Windows CI host. Neither substitutes for office production
  acceptance; no production test identity or authenticated writes are assumed.
- Independent review must assess the final artifact and those results before
  replacing the candidate banner or distributing the package.

The local Mac has no Windows VM and the repository has zero self-hosted Actions
runners. [KVM capability run 35546643249](https://github.com/DanielGiuditta/mandala/actions/runs/35546643249)
executed a small real guest successfully on an Ubuntu host. The next rehearsal
uses official Microsoft evaluation media in a Windows guest while the controller
survives guest reboots. The capability probe alone proves no Windows behavior.
The user need not configure runners or coordinate engineering decisions.

After the earlier automatic approval rejection, the user explicitly instructed
publication/completion of this handoff. The recovery branch was pushed to the
user-owned public `DanielGiuditta/mandala` repository. Original office reports,
private credentials and pairing material are excluded from commits and artifacts.

Fresh maintainer Mac downloads on September 20 New York / September 21 UTC matched
the live production manifests and the original audited installer bytes: Agent
1.0.15 `acf56fe97faa161e710330e1e14652be4d31f8475c8738234ff86d10c2a660ed`
(51,056,706 bytes), gateway 1.1.0
`0fd024c0cf69d8e913c048f5e3e20c2e50d2fdf0c4584dbc6108d5ac98150ce3`
(24,825,179 bytes). Only the employee installer is included in the recovery ZIP.

## Domain and release boundaries

Production remains `nzlajptokbcgeaifgnoq`; Agent stays 1.0.15, gateway transport
stays 1.1.0. No migrations or business-model changes. Office-based relationships,
field naming and `windows-tracker` time-entry source are unchanged. No divisions
or cost centers were added. No product-model deviation.

The old gateway installer remains unsuitable as recovery because it can replace
corrected helpers. This candidate does not produce a new gateway installer.
A package hash check proves integrity relative to its inventory, not publisher
identity; the external audited artifact hash is still required at release.
