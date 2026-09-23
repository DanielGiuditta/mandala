# LAN clock and recovery candidate — September 23, 2026

## Scope and deployment boundary

This candidate follows the remote STP54/STP32 diagnosis. It is isolated on `codex/lan-clock-validation`, based on the clean recovery branch at `0cc7a33`. The main workspace's unrelated work and the audited 1.2.3 handoff ZIP are unchanged. No production deployment, installer publication, office software update, clock change, trust-store change, firewall change, schema change or additional employee time entry is part of this validation.

The real office results remain: STP54 started automatically after a real reboot; one STP32 start/stop for Ruksana on HiLITE Atlantis reached production (entry `3b059868-1e6a-4abc-9a04-455e981f1b4a`). That test exposed approximately 32 seconds of office-to-production clock skew. The employee follows its configured office time source closely. The diagnostic certificate failure was revocation-status unavailable, not failure of the enrolled TLS connection.

## Candidate changes

- Anchor an active LAN timer to the authenticated server start receipt; advance activity/stop/display by monotonic elapsed process time. Windows wall-clock offsets and corrections cannot alter the measured duration.
- Use the same kind of elapsed clock for UI polling, heartbeat cadence, sleep-gap detection and save retry intervals. Negative elapsed display is clamped to zero.
- After an app restart, close an active journal at the last durably recorded activity rather than extrapolating from an untrusted wall clock. Preserve already stopped timestamps exactly. Reconcile an uncertain start with the same UUID and zero waiting time.
- Diagnose the existing one-use pairing format using explicit identity, private-key presence, non-CA leaf, signing usage, client-authentication purpose, signature, validity and installed-root trust. No application TLS or gateway enrollment checks are weakened. Other issuer formats retain ordinary revocation validation.
- Add a bounded production HTTPS clock comparison to gateway preflight and require it in final office acceptance. A report without that evidence cannot clear deployment. Tighten the employee/gateway comparison to five seconds.

## Safety properties

The regression client uses an in-memory HTTP handler that rejects every other host. Its synthetic identities and encrypted journals are confined to temporary directories. Database tests execute the existing SQL migrations in a local embedded PostgreSQL fixture. Real app UI tests run only on disposable GitHub-hosted Windows machines with fake credentials, a loopback TLS gateway, blocked non-loopback app traffic, and a synthetic backend implementation. Certificate fixtures create and clean up only their own temporary certificates on that disposable runner. Nothing tests against real employee records.

No new entities, organizational concepts, roles, permissions, RPCs, database grants or gateway endpoints are introduced. Existing domain and UI names are preserved. The architecture documentation records the conservative restart behavior as a technical timing change, not a new business field.

## Validation matrix

| Area | Required evidence |
| --- | --- |
| Clock accuracy | Exact 120-second saved durations with offsets of -1 hour, -32 seconds, zero, +32 seconds and +1 hour; forward/backward wall-clock steps; nonnegative display |
| Pending recovery | Real Windows DPAPI journal, stopped timestamp retained across reopen, offline start blocked while pending, reconnect produces one receipt |
| Lost responses | Retry the original start/stop UUID; a committed response lost in transit must not create another entry |
| Authorization | Revoked upload and mismatched receipt retain pending work; invalid TLS certificates and unenrolled devices rejected |
| Certificate diagnostic | Valid paired leaf passes; wrong thumbprint, missing private key, CA leaf, untrusted issuer, forged signature, server-only purpose, expired and future-dated leaves fail |
| Clock diagnostic | Shared 32-second offset fails even when the office PCs agree; malformed/missing dates, clock steps and slow ambiguous samples fail |
| Actual Windows app | Sign-in/projects with fake credentials, start/stop, offline pending save across process close/reopen, cancel/confirm project switch, real five-minute idle pause, no automatic resume, five distinct receipts and zero duplicates |
| Existing behavior | Startup repair, report failure handling, gateway request restrictions, real mutual TLS, database authorization/idempotency, final evidence verifier |

## Limits and remaining release work

- These tests do not change or correct the office time server. Certificate dates, login protocols and local entry-date selection still require a reasonably correct Windows clock.
- Network response transit time is conservatively omitted from a newly confirmed session. After a process crash, activity since the last durable activity checkpoint can be omitted; unattended time must not be invented.
- Process close/reopen and durable journal recovery are distinct from an actual employee Windows reboot. STP54's unchanged startup repair already passed a real office reboot. A new candidate employee installer still needs its own real sign-in/reboot acceptance.
- No installer is handoff-ready from this branch. The UI candidate has synthetic configuration and is discarded after CI; it is not a replacement for the audited production installer. A release needs a distinct version, production-backend installer audit, published manifest, downloaded-byte/hash verification, and bounded office acceptance before rollout.
- Preserve the existing office test row and original reports. Do not repeat production tests automatically, clear journals, replace pairing, or modify the domain time server to obtain a green report.

## Results

**PASSED:** [final Windows run 35887551900](https://github.com/DanielGiuditta/mandala/actions/runs/35887551900), source `842f461a4756d8c694577acd127c07402322709e`.

- Real client regression checks passed, including five clock offsets, clock jumps, encrypted journal recovery, lost responses, project switching and preservation after rejected saves.
- Windows PowerShell 5 certificate and production-clock checks passed, including the final uncertainty-boundary rejection.
- Existing startup repair and report failure-handling checks passed.
- Node suite: **59 passed, 0 failed, 1 skipped**. The skipped check requires a packaged gateway; this run creates no new gateway package. Gateway source mutual TLS, enrollment removal, request restrictions and real SQL authorization/idempotency tests passed separately. The unchanged gateway startup repair already passed its real STP54 restart.
- Actual Windows app: five distinct confirmed receipts, zero duplicates, offline journal survived process close/reopen, selection/cancel did not switch projects, confirmation saved the old project first, idle paused after **307.5 seconds**, and returning input did not restart work.
- **Zero production requests and zero production entries.** No office settings or software were changed. NPM's dependency audit reported zero known vulnerabilities; no dependencies were changed. This is test evidence, not a guarantee of vulnerability absence.
- Final synthetic candidate executable SHA-256: `2c6b1978eadc41cfa1a99df9b0d9ef3952d840e33a552d87f805578018aa753b`. It is not an audited release and must not be distributed as an employee installer.
- Local focused checks also passed: 8 gateway/security tests and 50 evidence-verifier tests.
- The original 1.2.3 handoff remains 50,573,096 bytes with SHA-256 `6e094282d285970940bbab6dfcd3efdf6c3c14efd1076c3af6dd219886221dbd`; the original recovery worktree remains clean.

Superseded CI attempts were cancelled while the temporary certificate-test trust-store setup was corrected; the full final run above completed successfully. No unresolved test failure is hidden by the successful status. Packaged-gateway, employee reboot and release limitations remain explicitly listed above.


The timer API is consistent with Microsoft's documented Windows performance counter behavior, including elapsed time through sleep: https://learn.microsoft.com/en-us/windows/win32/sysinfo/acquiring-high-resolution-time-stamps . The existing idle cap and gap detection still prevent treating an unattended interval as active work.
