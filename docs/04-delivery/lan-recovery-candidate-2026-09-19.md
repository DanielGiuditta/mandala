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

Windows report tests are prepared using a sanitized supplied-state fixture,
including the actual approval function with missing/unwritable/redirected Desktop,
locked checkpoint and ZIP failures. The current approval regression substitutes
the repair side effect; it is **not** the required end-to-end launcher/UAC/repair
reproduction. Existing Windows integration tests and new package-integrity checks
are configured in the candidate workflow but have not run for this candidate.

## Remaining release gates

- Windows CI, including actual Local Service/permissions/firewall/pairing lifecycle
  with these changes, must pass and the downloaded candidate must match its audit.
- Full packaged launcher reproduction of the September 19 interruption must run;
  helper/prompt tests alone are insufficient.
- Mutation-boundary checkpoint/process interruption tests must prove safe observed-
  state recovery, including actual stop/helper/firewall/task boundaries.
- Exact packaged UAC cancel/approve and standard-user employee baseline tests,
  including role mismatch and corrupt-state paths, need execution.
- Two maintainer-controlled Windows machines/VMs are needed for actual gateway
  reboot/resume, a second persistence reboot, setup re-entry, and real Agent
  login/start/stop/offline/switch/idle behavior. Explicit rehearsal test identity
  and two allowed projects are required. None are currently established.
- Independent review must assess the final artifact and those results before
  replacing the candidate banner or distributing the package.

The current host has no discovered Windows VM installation, and the repository
has zero self-hosted Actions runners. Hosted CI does not satisfy a real reboot
rehearsal. The user is not familiar with Windows; do not ask them to configure
runners or make routine engineering choices. Do not use Surjith's office as the
first full rehearsal or silently create production test identities.

Automatic approval review rejected a push because the remote destination trust
was not established. Inspection confirmed `DanielGiuditta/mandala` belongs to the
signed-in account, but is public. Explicit user approval to publish the recovery
branch is pending. Original office reports and credentials are excluded from the
prepared commits. No remote push or deployment has occurred in this task.

## Domain and release boundaries

Production remains `nzlajptokbcgeaifgnoq`; Agent stays 1.0.15, gateway transport
stays 1.1.0. No migrations or business-model changes. Office-based relationships,
field naming and `windows-tracker` time-entry source are unchanged. No divisions
or cost centers were added. No product-model deviation.

The old gateway installer remains unsuitable as recovery because it can replace
corrected helpers. This candidate does not produce a new gateway installer.
A package hash check proves integrity relative to its inventory, not publisher
identity; the external audited artifact hash is still required at release.
