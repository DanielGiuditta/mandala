# LAN time-tracking recovery candidate — 19 September 2026

## Status

**NOT READY FOR IT.** Version 1.2.3 is an engineering candidate on
`codex/lan-recovery-1.2.3`. No office repair, employee test, production acceptance,
real Windows reboot rehearsal or wider rollout is claimed.

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

The subsequent audit adds the actual shipped gateway orchestration over a real
installed gateway: missing Desktop at approval, required initial/approval saves,
four locked mutation checkpoints and three terminated repair processes. It also
adds an unchanged approved Agent with real enrolled HTTPS and an isolated in-memory
upstream. Synthetic account/projects/receipts cannot reach production; this tests
binary behavior and journal recovery, not SQL or office acceptance.

## Remaining release gates

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
