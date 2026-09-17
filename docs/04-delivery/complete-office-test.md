# Complete office acceptance test

## Gateway repair follow-up 1.2.1

The September 17 screenshot from STP54 establishes that gateway 1.1.0 is installed,
its configured address is 192.168.1.58:8443, production is reachable, and its valid
server certificate has one enrolled employee. The task is stopped, no listener is
present, and the old checker finds no Private/Domain profile. It does not establish
why the task stopped. The 1.2.0 checker failed before retaining the task exit result;
its gateway path only diagnosed problems and did not repair them. That was a gap
in the earlier handoff, not evidence that installation or pairing must be repeated.

`MandalaOfficeTest-1.2.1.zip` now offers an IT-approved maintenance repair before the
real gateway reboot check. It verifies installed gateway bytes against the original
production Windows audit, preserves all five guided configuration/pairing files
byte-for-byte, backs up the old task/rule, restores Local Service read permissions,
and installs a small startup entry beside the unchanged audited gateway transport.
The new entry retries a temporarily unavailable bind address or port every 15 seconds
within the same restricted process. The task has a 30-second boot delay, no run-time
limit, and 999 one-minute restarts after an actual process exit. A task marked Running
alone never passes: the configured listener is still required.

With explicit IT confirmation that this is the trusted office LAN and no employee
timers are active, the repair extends only the existing gateway firewall rule to
all network categories. It preserves the exact existing private employee subnet(s)
and restricts the rule to the configured gateway IP, adapter, TCP 8443 and audited
Node executable. This accommodates Public classification without changing Windows'
network category, opening unrelated Private-network rules or disabling any firewall.
Unknown/public/Any employee subnet scopes are refused. Employee mutual TLS and the
fixed production upstream are unchanged.

The report now retains task state, last exit result (including stopped tasks), action
location, restart/boot settings, actual adapter profiles and firewall scopes. Startup
status contains only a fixed phase, code, PID and UTC timestamp; it does not copy
configuration, raw exception bodies, credentials or certificate keys. If startup
still fails, the report contains substantially more evidence than the screenshot.
A nullable next-run date on a boot-triggered task is handled explicitly.

Validation uses the exact production gateway installer on Windows, generated fixture
pairing, and a real Local Service scheduled task. It stops the task, performs the
repair, proves pairing/config bytes and Windows network categories were unchanged,
checks the narrow firewall scope including Public, and occupies/releases the port
to prove recovery in the same process. The repaired service must pass the shipped
checker and the existing enrolled/missing/revoked-certificate HTTPS tests. CI does
not claim a real reboot on STP54 or a confirmed cause for its original failure.

The complete Windows audit passed in [run 35216705140](https://github.com/DanielGiuditta/mandala/actions/runs/35216705140),
source commit `d8dedf5`. The downloaded final `MandalaOfficeTest-1.2.1.zip` was
verified on Mac: 50,554,934 bytes, SHA-256
`c20183471de5ef951d179b5f752b71b2c0cac70594f36e79b1d782d1d4c5762f`.
All 16 expected files matched the package inventory, all scripts/instructions
matched audited source after newline normalization, both backend/version manifests
matched production, and the included employee installer retained its approved SHA.
The live gateway manifest still names the original 1.1.0 installer at 24,825,179
bytes with SHA-256 `0fd024c0cf69d8e913c048f5e3e20c2e50d2fdf0c4584dbc6108d5ac98150ce3`;
that exact installer was used by this Windows repair audit.

Existing 1.2.0 progress is retained; employee time tests are not silently replayed.
The old gateway setup is a one-time configuration tool, not the daily startup path.
The legacy 1.1.0 setup can recreate its old task/rule if explicitly run again; this
repair must be reapplied after such a reconfiguration or installer replacement.
No employee or gateway installer version is relabeled, and no new certificate,
account, product entity, permission or time-entry behavior is introduced.

## Automated handoff 1.2.0

The current deliverable is `MandalaOfficeTest-1.2.0.zip`. It supersedes the manual
1.1.0 handoff below. The ZIP contains two launchers, `START HERE.txt`, `FIXES.txt`,
the approved employee installer, startup repair, and the automatic runner. It does
not contain passwords, employee certificates or a database service credential.
The existing gateway 1.1.0 and employee's original pairing material are prerequisites,
not replaceable generic files. No new employee/gateway binary is released.

The target is 5–10 minutes of employee attention after setup, spread over roughly
25–35 elapsed minutes including reboots and real idle waits. These are planning
estimates, not measured office results. Unknown setup problems can take longer.
The computer must stay unlocked and unused while the automatic tests run.

### What happens automatically

- Collect independent installation, startup, certificate, network and clock checks.
- Offer the exact audited employee installer only if no installation is found;
  verify its SHA/size first. Repair recognized startup shortcuts with backups.
- Persist progress atomically before and during tests, with a ZIP report at every
  checkpoint. Resume once after sign-in through a separate per-user RunOnce entry.
  The resume launcher detaches immediately so it cannot hold up Agent startup.
- Drive only the audited executable's own Windows UI Automation controls. Select
  the agreed projects; start/stop; cancel and confirm switches; inspect displayed
  state and full saved references. No private app APIs or direct time writes.
- Generate small Windows mouse movements during active test sessions; validate
  that Windows received them. Keep the desktop awake without altering saved power
  settings. Stop input for the real idle interval, require idle save, then verify
  that input returning does not start another session.
- During the actual manually disconnected LAN interval, stop once, require pending
  rather than cloud-save state, export native diagnostics, close/reopen normally,
  verify pending persistence and blocked start, then reconcile one receipt after
  reconnect. No firewall/network settings are modified by the runner.
- Stop further time-writing cases after any uncertain result. Mark unattempted
  cases BLOCKED. A reopened interrupted runner exports its prior evidence and
  refuses to replay the cases. Existing pending work is not deleted or force-killed.

### Deliberate human checks

Employee sign-in, selecting/authorizing two real test projects, Windows elevation,
real restarts, confirming no manual Agent/gateway launch, the browser ownership
attempt, and disconnect/reconnect remain explicit. IT also confirms reserved IP,
perimeter isolation and employee internet restrictions that local checks cannot
prove. All these observations are identified as human evidence in the report.
The UI driver never reads the password control or decrypts authentication/journals.
A locked desktop, unknown UI, interrupted idle interval or policy preventing
accessibility becomes a reported failure, never an inferred pass.

### One return, one combined verification

IT returns `Mandala-Quick-Test-<PC>-employee.zip` and
`Mandala-Quick-Test-<PC>-gateway.zip` together. The maintainer runs:

```sh
node --env-file=<private-production-env> apps/desktop-agent/scripts/verify-office-test.mjs <employee-report.json> <gateway-report.json>
```

For kit 1.2.0 both reports are required. The read-only verifier checks the five
actual production entries and all gateway checks/reboot/IT observations, rejects
interrupted/incomplete behavior evidence, and emits one combined go/no-go report.
A pass remains subject to maintainer review before rollout. The kit does not
promise that unknown office defects can never require a later fix.

### Validation coverage

Windows CI exercises actual WPF controls (selection, start/stop, modal cancel and
confirm, bounded failure, normal close), Windows test-input delivery, scenario
success/failure persistence, the actual interrupted-run entry point, and the
approved installed Agent's login-window accessibility/version/backend. Existing
startup discovery, installer, desktop regression and receipt-parsing audits remain.
Database tests reject missing/wrong/extra entries, missing reboot/IT evidence,
wrong durations/projects/people, and interrupted runs. The fixture tests do not
claim that the production time scenarios have run on the office computers.

Final handoff audit:

- [Windows CI run 35169191973](https://github.com/DanielGiuditta/mandala/actions/runs/35169191973)
  passed every step for source commit `f76e47d`.
- The Mac download of that audited `MandalaOfficeTest-1.2.0.zip` is 50,546,938 bytes,
  SHA-256 `6dd3173b367e0562893443f0840465d1fd98600c5e762689968ea1771649ebde`.
- All 13 expected package files were verified, scripts/instructions matched source
  after newline normalization, and the included installer and installed-binary
  fingerprint matched the production 1.0.15 audit. The live production manifest
  was rechecked and still selects that same installer SHA/size/backend.
- No production time writes were performed by CI. The real office scenarios and
  subsequent read-only database verification remain the acceptance gates.

No product entity, field, authorization rule, time semantics or office relationship
changes. No divisions/cost centers added; no domain-model deviations. Test prompts
reuse the existing console workflow and the Agent's existing controls.

## Historical manual handoff 1.1.0

The September 16 video shows the first repair reporting that it could not find
Mandala Agent. This is not proof that the agent is absent: version 1.0.0 used only
one registry view and one default path. The complete kit replaces repeated
screenshot exchanges with one supervised office session and one report set.

## Deliverable

`MandalaOfficeTest-1.1.0.zip` contains the menu-driven Windows checker, the revised
startup repair, exact approved `MandalaAgentSetup-1.0.15.exe`, installed-binary
fingerprint manifest, and `START HERE.txt`. No service-role credential is included.
The gateway remains the existing approved `MandalaGatewaySetup-1.1.0.exe`.

The step-by-step operator instructions are maintained in
[START HERE.txt](../../apps/desktop-agent/scripts/office-test/START%20HERE.txt).
Plan 35–45 minutes with IT, the employee, the gateway and one employee PC.

## Evidence and gates

| Area | Evidence | Required result |
| --- | --- | --- |
| Installation | Both registry views, machine/user locations, running process, Start/Desktop shortcuts | Real employee executable located; stale registrations do not block fallback |
| Integrity | Actual installed binary compared to the audited production installer | Exact 1.0.15 binary and production backend |
| Startup | Common/user shortcuts, known Windows disable setting, changed boot time, already-running process, employee observation | One agent opens after sign-in without setup/manual launch |
| LAN | Current-profile certificate/private key/trust, mutual TLS, gateway identity, clock, unauthenticated request rejection | Correct production gateway reached by enrolled employee |
| Gateway | Task account, boot trigger, running state, installed release/runtime, address, listener, firewall, production reachability, cert expiry and enrollment | Gateway functions after reboot; IT confirms network isolation and direct employee internet block |
| Sessions | Timed observations and sanitized structured agent events | Start/stop, cancel/confirm switch, idle/no auto-resume, offline stop, app restart with pending work, blocked new start, reconnect receipt |
| Ownership | Same employee attempts browser takeover during a desktop-owned session | Viewing another project does not switch; takeover is refused |
| Production writes | Read-only verification by exact session and entry IDs | Five rows for the correct employee/projects/date and finalized elapsed hours; no extra desktop sessions in test windows |

Every independent preflight check runs, even when installation discovery fails.
Missing prerequisites are explicitly failed/blocked, not silently skipped or marked
ready. An uncertain time save stops subsequent time-writing scenarios, preserves
the report, and records remaining scenarios as blocked. Read-only collection and
report export remain available.

Reports contain computer/user identity, candidate paths, architecture, timezone,
IST action timestamps, check results, behavior observations and selected structured
log facts. They do not contain configuration keys, passwords, tokens, private
certificates, encrypted journals or raw exception bodies. No token decryption or
refresh is performed by the checker. Time is created only through the employee's
explicit in-app test actions.

The reports are evidence, not cryptographic attestation of the workstation. A
process observed after a reboot is combined with employee confirmation that it was
not opened manually. IT confirms perimeter isolation that a local script cannot
prove. Unresolved cases stay NOT CLEARED.

## Single return and production verification

IT returns the employee and gateway desktop report ZIPs together, plus any in-app
diagnostics exported at the time of a failed save. The maintainer uses the employee
`report.json` with `apps/desktop-agent/scripts/verify-office-test.mjs` and the private
production environment on the maintainer machine. The verifier sends GET requests
only to `people`, `desktop_work_sessions`, `time_entries` and `projects` on
`nzlajptokbcgeaifgnoq.supabase.co`; it never changes time or credentials. Any failed
local check, missing/extra session, unmatched reference, wrong employee/project/date,
or duration mismatch blocks clearance. Gateway report and IT signoff are additional
required gates; employee row verification alone is not a rollout approval.

## Release checks completed on September 16

- The live protected download page visibly selected `MandalaAgentSetup-1.0.15.exe`
  and gateway `MandalaGatewaySetup-1.1.0.exe`.
- The production storage manifest matched version 1.0.15, its versioned object,
  production project reference, byte size and original Windows audit SHA-256.
- A fresh Mac download from production was 51,056,706 bytes with SHA-256
  `acf56fe97faa161e710330e1e14652be4d31f8475c8738234ff86d10c2a660ed`, matching
  [Windows release audit 34076879611](https://github.com/DanielGiuditta/mandala/actions/runs/34076879611).
- The test-kit workflow downloads that exact audited artifact, checks it again,
  installs it on Windows, checks embedded backend/version, and derives the binary
  fingerprint used by employee preflight. The old installer is not rebuilt or
  relabeled. An unpublished fixture tests future installer startup behavior.

- [Complete Windows test-kit audit 35104147268](https://github.com/DanielGiuditta/mandala/actions/runs/35104147268)
  passed startup repair, full check collection, report privacy/failure fixtures,
  production-row verifier fixtures, desktop regressions, real approved installer
  discovery from 32-bit PowerShell, actual preflight/report export, and the future
  installer startup fixture.
- The downloaded final `MandalaOfficeTest-1.1.0.zip` was verified on Mac against
  that Windows audit: 50,541,329 bytes, SHA-256
  `0a6cf3ec99ab2c590e625b76fc1fd385aff238fe16fc1fee343fd9f83b4b6b1c`.
  Every packaged script/instruction matches the audited source (normalizing line
  endings); the bundled employee installer matches the live production download.

Registry lookup uses explicit 32/64-bit views as documented by
[Microsoft RegistryView](https://learn.microsoft.com/en-us/dotnet/api/microsoft.win32.registryview?view=netframework-4.8.1).
Tests also cover custom shortcut-only installations and refuse to promote a
user-local executable to all-user startup.

## Boundaries

The checker does not create certificates, change firewall rules, reset credentials,
clear pending work, disable security checks, or silently reinstall a detected agent.
The optional missing-agent installation verifies the bundled exact installer first,
requires Windows administrator approval, and suppresses elevated post-install app
launch. Existing LAN pairing must still belong to the employee's Windows account.
The repair changes only startup shortcuts with backups.

No domain entities, fields, office relationships, permissions, time-entry semantics,
division or cost-center concepts change. Names retain the documented distinction
between the employee Agent and office Gateway. No domain-model deviations.
