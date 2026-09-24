# LAN clock and recovery audit — September 23–24, 2026

## Initial validation scope and deployment boundary

The initial candidate followed the remote STP54/STP32 diagnosis. It is isolated on `codex/lan-clock-validation`, based on the clean recovery branch at `0cc7a33`. The main workspace's unrelated work and the audited 1.2.3 handoff ZIP are unchanged. That initial validation included no production deployment, installer publication, office software update, clock change, trust-store change, firewall change, schema change or additional employee time entry. The later publication and package audit are recorded below; no office rollout has been accepted.

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
- Process close/reopen and durable journal recovery are distinct from Windows reboot. STP54's unchanged startup repair passed a real office reboot. The exact 1.0.16 employee installer has now passed the isolated standard-user reboot/sign-in rehearsal below. That first rehearsal did not test pending work. A later isolated pending-save OS reboot passed (see below); actual STP32/domain acceptance remains outstanding.
- No installer is approved for employee rollout. The earlier UI candidate used synthetic configuration; the later 1.0.16 installer below has separately audited production configuration. Production publication and live-manifest/download verification subsequently passed (see below). Bounded office acceptance remains a separate gate.
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

## Follow-up: published release and complete package audit

The exact audited **Agent 1.0.16** was published on September 23 at **23:44:39 UTC**, using the existing publisher and private production storage bucket. No web-code deployment or database migration was required. The prior versioned object was retained and the previous manifest was backed up.

The production `latest/release.json`, versioned installer object, Mac download and authenticated download-page selection all agree on 1.0.16, production backend `nzlajptokbcgeaifgnoq`, **51,062,706 bytes**, and SHA-256 `f517f48ace1638cea05471224938a660bb1def0d1ac17a794a16c2737d30dccb`. The bucket remains private. The first ordinary manifest read was briefly stale in the CDN; fresh and ordinary reads subsequently agreed. This is publication verification, not office-trial acceptance.

**PASSED:** [complete Windows package audit 35934969307](https://github.com/DanielGiuditta/mandala/actions/runs/35934969307), source `0afc03990ccd0ac865cd5e0af325a1b32276ea75`.

- Complete kit **1.2.4** includes the exact audited 1.0.16 installer and revised certificate/production-clock diagnostics, plus a read-only gateway baseline entry point.
- Exact installed Agent tests passed: mutual TLS, sign-in, projects, start/stop, project-switch selection/cancel/confirm, offline journal recovery across process restart, five-minute idle pause (307.1 seconds), five distinct receipts, zero duplicates and zero production entries.
- Existing gateway installation, Local Service startup repair, stopped-service recovery, bind-failure recovery and checkpoint/failure behavior passed on Windows.
- Exact package launcher, extracted path with spaces, package integrity checks, internet-marked scripts, invalid inputs, corrupted state and separate standard-user baseline passed. UAC cancellation is injected coverage; the secure-desktop consent UI is not claimed as tested.
- The Mac verified all **18 manifest entries**, checked the embedded installer byte-for-byte against the audited live release, and preserved the exact tested ZIP under the convenient name `Mandala-Remote-Acceptance-1.2.4.zip`.
- ZIP size **50,580,395 bytes**; SHA-256 `c7c3fb26247f8bc89513f706c8dc61a6e0c87d909ef05a3341d72191df6bd52d`.
- [Source regression 35933979358](https://github.com/DanielGiuditta/mandala/actions/runs/35933979358) also passed. The earlier package run `35933979332` failed because a test fixture still expected kit 1.2.3; remaining fixture expectations were corrected without relaxing any product or release check.

The kit remains marked `REHEARSAL_REQUIRED`: it is a maintainer acceptance package, not authorization for general employee rollout. The original 1.2.3 archive remains unchanged.

## Additional actual OS reboot: pending encrypted save passed

**PASSED:** [pending-save Windows reboot rehearsal 35934425562](https://github.com/DanielGiuditta/mandala/actions/runs/35934425562), harness `3934c93`, exact published installer.

The actual installed Agent under a normal Windows user created one synthetic session, stopped while its loopback gateway was unavailable, and retained its encrypted pending journal through a full Windows reboot. Automatic startup restored the same user, sign-in and certificate. New work was blocked while the save was pending. After reconnection it produced **one exact receipt, zero duplicates**, preserving **6.1099726 seconds** rather than counting reboot downtime. Windows Firewall and UAC remained enabled; **zero production entries** were created. Temporary guest auto-logon was removed and the disposable VM was terminated.

This closes the isolated pending-save OS-reboot gap. The guest is Windows Server evaluation with a synthetic account, not STP32's Windows/domain environment, and it does not exercise the office cable, switches or domain policy.

## Remote office boundary and remaining gates

A fresh read-only production check found zero active sessions and zero unfinished desktop receipts for the selected employee. That does not prove the local journal is empty. UltraViewer and NetSupport reconnect, but the nested display/input and Windows unlock could not be verified reliably. Repeated credential attempts were stopped. No office installer, clock, service, firewall, trust-store, pairing, restart or employee time-entry action was performed in this follow-up.

1. Restore reliable authorized remote desktop access and inspect STP32's actual local active/pending state before an update. Preserve the existing user, pairing, journal, sign-in and original test evidence.
2. Inspect the effective configuration of the shared domain time server `dotsixteen` (`192.168.1.10`) with an authorized server-admin session. It advertised `LOCL` and STP54 was approximately 33 seconds slow relative to production. The gateway SYSTEM session was denied detailed remote configuration access. Establish the approved source and rollback before correcting the shared server; do not bypass the production-clock gate or change domain members away from their hierarchy blindly.
3. Verify the office network isolation actually in force. The proposed bounded STP54-to-file-server TCP 445 connectivity check has no confirmed result; do not claim isolation passed from IT's earlier confirmation alone. Do not alter domain/file-server rules without understanding dependencies.
4. Install the exact audited 1.0.16 under approved Windows administrator access, then complete bounded STP32 acceptance in the actual normal-user/domain profile: automatic startup and retained sign-in, start/stop, confirmed project switch, idle pause, pending recovery and exact production receipt/duration checks. Separate authorized test rows from real employee work.
5. Preserve remote access during testing. Do not ask for or simulate physical cable removal during an unattended remote-only session. The kit still has a physical-disconnect step; that step is not an automatic remote test, and application-only interruption is not claimed as a validated replacement.

These remaining gates do not inherently require someone physically in the office. They do require working remote access and appropriate domain-server administration. No employee-trial readiness claim is made from publication or isolated tests alone.

## September 24: actual office update, startup and clock diagnosis

The earlier remote-access blocker is resolved. Correctly paced input made the existing employee and domain-administrator credentials work; no password reset or new permissions were needed.

- Installed the exact audited Agent **1.0.16** on **STP32** through ordinary Windows UAC. The transferred installer and actual installed executable both match the hashes above.
- Preserved the employee's encrypted local data, pairing and machine configuration before installation. Verified the backup contents, common Startup shortcut, production backend, existing employee sign-in, two returned projects and no active/pending local session after installation.
- A production read-only check at **2026-09-24 01:18:46 UTC** found no active work session or unfinished desktop receipt for that employee. No new production timer entry was created.
- Performed a normal STP32 restart without a force flag. A locked-screen refusal was resolved by normal employee unlock, not a protection bypass. NetSupport disconnected at **07:04:56 IST**, reconnected, and normal employee Windows sign-in was completed. **Mandala launched automatically and restored the existing account and two projects without manually opening it.** Post-reboot machine/log evidence capture is still pending because the controlling Mac locked.
- Actual domain-administrator read-only access to the root PDC now succeeds. Its effective settings were saved before any proposed correction. It uses **Free-running System Clock / LOCL**, Type **NT5DS**, with a blank pending peer and no working upstream. The server is physical IBM hardware running Windows Server 2008 R2 Enterprise.
- From that PDC, `time.windows.com` fails name resolution. Three NTP samples to the Microsoft address freshly resolved by STP54 all timed out; three to the PDC's configured office router also timed out. These bounded probes do not identify which device/policy drops the traffic. No time, DNS, routing or firewall configuration was changed.
- STP54-to-file-server **TCP 445 reachability is confirmed**. Domain-admin RPC/WMI from STP54 to the PDC also works. This contradicts a claim of externally enforced gateway isolation on those paths; it does not mean an unauthenticated user can read shares. Blocking these protocols blindly on a domain member could break existing dependencies.

**Employee trial remains on hold.** The remaining network work is to supply a reachable approved time source for the PDC and implement/verify the documented gateway isolation with controlled DNS/time/management exceptions. That work requires the office network owner or authorized router/firewall access, not inherently physical presence. Do not hardcode the temporary Microsoft DNS result, grant the file server broad internet access, weaken the clock acceptance gate, or replace external isolation with host-only rules.

After those gates pass, run only the outstanding bounded actual-office timer/switch/idle/recovery checks and verify exact production rows and durations. Preserve the successful installation/startup evidence. The complete 1.2.4 package and all earlier isolated-test limitations remain unchanged. No domain model, access-control contract, UI naming, schema, division or cost-center concepts changed in this continuation.
