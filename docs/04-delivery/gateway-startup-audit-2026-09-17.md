# Gateway startup and office acceptance audit — 17 September 2026

## Decision

The 1.2.1 handoff had material gaps and is superseded by 1.2.2. Do not treat a
successful build, open window, running task, open port or project list as office
acceptance. A real gateway reboot, employee checks and matched production records
are still required. This audit does not establish the cause of STP54's original
process exit: the screenshot does not contain that evidence.

## Findings and corrections

| Gap | Correction | Regression evidence |
| --- | --- | --- |
| Clicking the original setup button could restore the old task and firewall rule. | Repair installs the corrected setup helper and shared startup helper. Later setup preserves the approved employee scope and durable task. | Windows fixture reruns setup, adds a second employee, restarts and reapplies repair; original pairing remains valid. |
| A running legacy task escaped repair. | Validate the exact action, startup files, audited transport, boot delay, restricted account and retry settings. | Legacy registration rejected; corrected registration and repeated repair validated. |
| Fast sign-in could check before the delayed task or LAN address was ready. | Observe for up to three minutes without manually starting the gateway. | Delayed and never-ready probes test the shipped wait; unchanged Node launcher tests address-unavailable, occupied-port and access errors. |
| An unrelated process on port 8443 could pass. | Require the exact runtime, arguments and Local Service owner. | Foreign listener rejected while the gateway waits; actual restricted listener accepted. |
| Permissions tests prepared readable code before repair. | Repair read/execute access to verified runtime/modules as well as existing pairing data. Reject writable/redirected installations and explicit deny policy before stopping. | Actual Windows fixture removes runtime and data read access, then tests recovery; unsafe paths/policy rejected. |
| Firewall checks could accept the wrong profile, extra scope or ambiguous rules. | Require one enabled rule, correct actual profile, exact adapter/address/program/TCP port and explicit private employee scope. | Wrong profile, public/Any remotes, extra ports/interfaces, broad executable/address and ambiguous filters rejected. |
| Employee checks reused pre-reboot connection evidence. | Recheck certificate, connection, clock, identity, projects and startup after reboot. | Fresh check path precedes every new time-writing run. |
| Waiting at a browser/disconnect prompt could cause a false idle failure. | Continue explicitly authorized test activity during those prompts, capped at ten minutes and cancelled by Escape; always stop activity afterward. | Real Windows input timer cleanup and expiry tested; idle case receives no generated input. |
| A downloaded ZIP could leave the newly copied setup script blocked. | The launchers unblock every specific shipped PowerShell dependency, including the corrected pairing helper. | Actual launcher unblock loops run against Internet-marked files and leave unrelated scripts blocked. |
| Evidence collection failures could prevent report export. | Isolate optional task/network/firewall/log collection, preserve earlier events and provide exact fallback file locations. | All optional readers fail together and the report still exports. Corrupted state and wrong account do not trigger test actions. |
| Opening a new kit relabeled old completed reports. | Keep historical versions; archive an older gateway report only with explicit gateway-only re-audit confirmation. Never replay interrupted employee time tests. | Version migration and interrupted-state regressions. |
| Production checks could accept wrong dates, excessive sessions or an unrelated gateway. | Match reported session IDs to the employee and five actual rows; check local date, time bounds and whole-run extras. Match gateway origin and SHA-256 of the validated server certificate. | Wrong-date, ten-hour-stop, extra/gap session, mismatched/missing certificate, stale/unsupported/incomplete report fixtures rejected. |

## Acceptance rules

- Both reports must be completed by kit 1.2.2. Older reports remain available for
  manual investigation; they are never relabeled or used for automatic clearance.
- Gateway validation must precede the employee's post-reboot connection check.
- The endpoint and validated server certificate fingerprint must match, so two
  offices with the same private IP cannot accidentally be combined.
- Evidence older than seven days requires maintainer review. This is an audit
  freshness gate, not an instruction to repeat employee time writes.
- Server-start timestamps allow the documented 30-second clock tolerance.
  Employee stop and receipt timestamps remain inside their recorded scenario.
  The date check permits only the adjacent date at a midnight boundary within
  that tolerance. Adjacent test cases cannot be mistaken for extra sessions.
- The verifier reads production only. It does not write or delete test entries.
  It checks the person, project, date, duration, source and exact saved reference.
- Production remains `nzlajptokbcgeaifgnoq`; Agent 1.0.15 and gateway transport 1.1.0
  are unchanged. The repair modifies startup/setup scripts and a narrowly scoped
  firewall rule after an explicit IT maintenance confirmation.

## Remaining office evidence

Windows CI exercises real Windows PowerShell 5, scheduled tasks, restricted
Local Service execution, filesystem permissions, firewall rules, certificate
pairing, HTTPS and accessible UI fixtures. It does not reboot STP54, reproduce
that office's group policy/endpoint security, or sign in as an employee to create
production time entries. A simulated UI fixture is not a full live employee run.

The already-created `Mandala-Quick-Test-STP54-gateway.zip` should be retained and
reviewed. No additional test is needed to send that existing report. Its contents
may help distinguish an office restriction from an application startup failure;
the screenshot alone cannot do that.

## Product scope

The original gateway 1.1.0 installer still contains its original startup scripts.
Reinstalling that old installer after repair can overwrite the setup integration;
the current startup-configuration check rejects that drift. Keep the repaired
installation in place. A later gateway installer release must incorporate the
startup fix and pass its own release audit; this package is an audited repair of
the existing installation, not a relabeled gateway installer.

No domain entities, organizational concepts, time-entry business behavior or
access model changed. Naming remains consistent with the domain/UI mapping.
No division or cost-center concepts were introduced. No product-model deviations.

## Build and handoff validation

The complete Windows audit passed in [run 35243828539](https://github.com/DanielGiuditta/mandala/actions/runs/35243828539),
source commit `fd61cde`. It includes 47 Node regression cases, Windows PowerShell 5
startup/permissions/firewall/report/UI tests, the real installed gateway lifecycle
and mutual TLS tests, actual approved Agent UI/discovery checks, and installer
packaging checks. The first audit run caught an account-name translation error;
the final run uses SID-only permission rules and verifies unresolved SID handling.

The Mac download of `MandalaOfficeTest-1.2.2.zip` matched the CI artifact:

- Size: **50,565,337 bytes**.
- SHA-256: `2cde9d4310d486b59e4718756d00caecfd8f5c84d63c10db973152459140c6b7`.
- All **17** expected files are present, with no unexpected files. Every script
  and instruction matches the audited source after newline normalization.
- The included Agent installer is byte-identical to a fresh production download:
  51,056,706 bytes, SHA-256
  `acf56fe97faa161e710330e1e14652be4d31f8475c8738234ff86d10c2a660ed`.
- The exact gateway installer used by CI matches a fresh production download:
  24,825,179 bytes, SHA-256
  `0fd024c0cf69d8e913c048f5e3e20c2e50d2fdf0c4584dbc6108d5ac98150ce3`.
- Both live manifests retain the approved version and production backend.

**Package audit passed; office acceptance remains pending.** No STP54 reboot,
real employee login or production time-entry save was claimed as observed here.
