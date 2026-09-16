# Complete office acceptance test

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
