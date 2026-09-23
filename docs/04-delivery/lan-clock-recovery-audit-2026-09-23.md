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
- Process close/reopen and durable journal recovery are distinct from Windows reboot. STP54's unchanged startup repair passed a real office reboot. The exact 1.0.16 employee installer has now passed the isolated standard-user reboot/sign-in rehearsal below. Actual STP32/domain acceptance and pending-time recovery through an OS reboot remain untested by that rehearsal.
- No installer is approved for employee rollout. The earlier UI candidate used synthetic configuration; the later 1.0.16 installer below has separately audited production configuration. Production publication, live-manifest/download verification and bounded office acceptance remain separate release gates.
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

## Production-configured installer audit completed

**PASSED:** [Windows installer build/audit 35892308420](https://github.com/DanielGiuditta/mandala/actions/runs/35892308420), source `508e42e3dc9164623ce8da62fff8ef4cde17dc12`.

- Exact filename: `MandalaAgentSetup-1.0.16.exe`.
- Size: **51,062,706 bytes**.
- Installer SHA-256: `f517f48ace1638cea05471224938a660bb1def0d1ac17a794a16c2737d30dccb`.
- Installed executable SHA-256: `7e26d9e536aed746b3f0247c2254295726a2f8fd6206c901de2a29d1a3f38fdf`.
- Installed version: `1.0.16+508e42e3dc9164623ce8da62fff8ef4cde17dc12`.
- Production hostname and anonymous key were checked against the configured release secrets and production's authentication settings. No service-role credential is included in the installer.
- Windows installed the actual finished installer and audited its executable, production configuration and common Startup shortcut. The desktop regression executable passed again.
- The copy downloaded to the Mac matches the audited hash and size exactly. This is a GitHub artifact comparison, **not** verification of a published live download.
- The publication step was explicitly skipped. A new `publish_release` input defaults to false, so availability of a signing certificate cannot implicitly publish a test build. No production download, office installation, database or domain-clock setting changed.
- Only workflow/documentation files differ between the prior successful code test and this installer source; the application implementation is identical.

The installer requires Windows administrator approval and is retained under the support evidence folder with an explicit rollout hold. Do not hand it to IT as a complete office acceptance package: the earlier 1.2.3 kit fingerprints Agent 1.0.15 and must not silently accept this new binary.

## Exact installer: real Windows reboot and standard-user sign-in passed

**PASSED:** [isolated employee rehearsal 35893031447](https://github.com/DanielGiuditta/mandala/actions/runs/35893031447), harness source `5077bed2e7ae8feed372cc511027182c9f53f6e5`, using the exact installer from build `35892308420` above. The host and guest both verified its fingerprint.

The disposable Microsoft Windows Server evaluation guest recorded three distinct boot identities: initial `17:16:40.1702720Z`, first reboot `17:20:41.5000000Z`, and second reboot `17:22:23.5000000Z` on September 23. This is an actual operating-system restart test, not a process restart.

- The installed common Startup shortcut launched Agent 1.0.16 automatically for a newly created **non-administrator Windows user**.
- That user created a disposable pairing certificate/private key and signed in through a loopback mutual-TLS gateway using synthetic credentials. The real Agent loaded its two fixture projects and wrote its own encrypted sign-in session.
- After the second real reboot, the test observer **did not launch the Agent**. It attached to the automatically started installed application and verified restored sign-in, two projects, the same Windows user and the same certificate/private key.
- Windows Firewall and UAC remained enabled. External Agent traffic was blocked before installation; the gateway fixture has no outbound backend implementation.
- **Zero production entries; zero timer sessions of any kind.** Temporary guest auto-logon was removed after the test, and the disposable VM was terminated. No office PC or real employee credential was used.
- The final screenshot agrees with the machine-readable result: Agent 1.0.16, the production backend identity, loopback LAN transport, synthetic signed-in account, two projects and no active project.

Limits: this test uses Windows Server evaluation, not STP32's actual Windows/domain policies. It does not exercise interactive installer UAC consent or pending-time recovery through OS reboot. The earlier DPAPI/process-reopen and synthetic start/stop tests remain separate evidence; none is silently promoted to office acceptance.

## Automatic web-preview side effect corrected

The repository's existing Git integration automatically created eight web previews while this isolated branch was pushed, including earlier validation commits. They were not production deployments, but they contradicted the intended test-only boundary. All eight previews from `codex/lan-clock-validation` were removed after checking their exact branch, commit, project and non-production target. The production deployment ID was compared before and after and was unchanged.

Both Vercel configuration files now disable Git deployments specifically for this test branch using [Vercel's documented branch setting](https://vercel.com/docs/project-configuration/git-configuration). Other branches and production settings are preserved. The subsequent guard commit created no deployment. No production installer was published.

## Remaining office release gates

1. Recheck and correct the shared office time source with the scope and ownership established. Do not change the domain/file server blindly or bypass the production-clock check.
2. Update the complete handoff package to fingerprint 1.0.16 and include the revised diagnostics. The old 1.2.3 package correctly expects 1.0.15 and is not a drop-in validator for this candidate.
3. Complete bounded STP32 acceptance in its actual employee/domain profile, preserving existing pairing and pending work. Keep any authorized production test separately identified and verify its exact saved row.
4. Publish the approved version, verify production release storage/manifest and the selected download version, then compare a Mac download of the live installer to the audited hash/size. Until then the installer remains an unpublished, audited candidate.

No deployment-readiness claim is made from the isolated results alone. The safe work completed now closes the production-configuration installer audit and isolated standard-user reboot/sign-in gaps without another IT round trip.
