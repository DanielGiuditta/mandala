# LAN implementation validation

This records implementation and installer-release checks. Office installation and acceptance are still pending.

Passed:

- Five focused LAN-service checks: real HTTPS enrollment/revocation, restricted gateway routes, signed preview permits, preview content/path/viewer/integrity/expiry enforcement, and transactional PostgreSQL session ownership/retry/permission behavior.
- Existing small agent regression runner with LAN configuration, clock/idle recovery, and journal checks added. The Windows-protected journal test is conditionally executed on Windows; the macOS run explicitly skipped that platform-specific check.
- Release compilation of the Windows WPF application: no warnings or errors.
- Preview-enabled production web build, including TypeScript checks and local PDF worker/font/decoder asset routing.
- Browser inspection of the actual preview component using a synthetic local PDF: page pixels and page-count controls rendered correctly. This check used a local fixture response, not real user documents or production authorization.
- Production dependency audit: no reported vulnerabilities after compatible Next.js, PostCSS, and image-library security updates. Existing React and Supabase versions were preserved in the lockfile.
- Diff formatting check. Domain and UI names reviewed; the existing `windows-tracker` source displays as Windows checker. No division/cost-center concepts or additional business entities were introduced.

Production release verified on 2026-09-07:

- Applied only `20260907090000_add_lan_desktop_sessions.sql` in a transaction to verified production `nzlajptokbcgeaifgnoq`, recording the migration.
- Windows CI [run 34076879611](https://github.com/DanielGiuditta/mandala/actions/runs/34076879611) passed the existing regression runner (including Windows journal protection/recovery), production backend verification and finished-installer audit.
- Published unsigned pre-launch `MandalaAgentSetup-1.0.15.exe` from commit `46ff6db14272fcfe1bd34f86771342dc94d04b93`. Live production storage download matched the audit: 51,056,706 bytes; SHA-256 `acf56fe97faa161e710330e1e14652be4d31f8475c8738234ff86d10c2a660ed`. Windows administrator approval and the unsigned-publisher prompt remain prerequisites.

- Authenticated live `/desktop-agent` page displayed 1.0.15 and its exact filename; the live download route selected that version on the production storage backend.
- Live database checks confirmed the receipt table/migration and denied direct employee inserts and the renamed legacy bypass function.

Still required for office acceptance:

- Install the dedicated office services, trusted certificates, enrolled-device/publisher allowlists, and external firewall rules.
- Start with one employee on an internet-connected PC, confirming start/stop and project-switch entries, then run the short office acceptance session in [LAN deployment](../02-architecture/lan-deployment.md): actual LAN-only start/stop and reconnect/switch with production time-entry references, file-server isolation, and one allowed/denied preview.

Scope limits are deliberate: fresh sessions require connectivity through the gateway; pending time blocks a new session until sync; preview copies are office-only, explicitly published, limited to PDF/PNG/JPEG, and expire after 24 hours without republishing. Originals are never fetched by the gateway or preview host. A permanently lost workstation requires audited recovery rather than an automatic remote takeover.

## Windows gateway pilot package

The small `mandala-windows-gateway.zip` is downloadable beside the employee installer. [Windows check 34180597287](https://github.com/DanielGiuditta/mandala/actions/runs/34180597287) passed using Node.js 24 and temporary certificates. It extracted the actual downloadable ZIP, launched its `.cmd` with paths containing spaces, confirmed the production-identity HTTPS health response, rejected a missing client certificate and a revoked enrollment, and rejected an unapproved route. This check made no cloud time writes. ZIP SHA-256: `a9be14e93937c39005429032f0652afcb02f48ca7e304e733936fbb5657690b0`.

The launcher is for a supervised Windows pilot: it does not install a Windows service, certificates, firewall rules or unattended restart. IT must configure those boundaries and complete the actual employee time-entry check. The original employee installer remains 1.0.15. No domain fields, permission roles or UI entity names changed.

## Bundled gateway installer 1.0.0

[Windows installer run 34181026856](https://github.com/DanielGiuditta/mandala/actions/runs/34181026856) downloaded the official Node.js 24.20.0 Windows x64 archive and checked its SHA-256 against the official Node checksum list. It built and installed `MandalaGatewaySetup-1.0.0.exe`, verified the installed runtime version/hash and production public key/backend, then exercised the installed command launcher with Node removed from its PATH. Enrolled TLS health, rejected missing/revoked certificates and rejected unapproved routes passed. The installer ships the Node license and does not modify system PATH.

The live production storage download matched the Windows audit: 24816566 bytes; SHA-256 `d15be8023402a7737cf8499f45a0bff286df993ec92d226e71744a94f6a0dd35`. Gateway release metadata is separate in `gateway/release.json`; its download route uses the existing admin/partner restriction and fails closed on invalid release metadata. The employee release remains 1.0.15.

The gateway installer requires Windows administrator approval and is an unsigned pre-launch build. Node installation is no longer an IT prerequisite. IT still configures certificates, file ACLs, network isolation and the managed employee gateway setting; the pilot launcher remains a foreground process, not an installed Windows service. No product/domain entities or access roles changed.


## Guided Windows gateway 1.1.0

Completed on 2026-09-08 New York / 2026-09-09 UTC. [Windows installer audit 34306122310](https://github.com/DanielGiuditta/mandala/actions/runs/34306122310), from `a64b0d8`, passed for the installed gateway package. The focused check exercised certificate generation under Windows PowerShell 5, non-exportable employee private keys, absence of persisted issuer private keys, rejected mismatched profile/pairing codes, the existing agent's valid-only certificate lookup, the restricted Local Service scheduled task, and actual Windows mutual-TLS HTTPS health. Missing and revoked client certificates were denied. The existing packaged launcher check also passed with system Node absent from PATH. No cloud time entries were created by this installer audit.

Windows displays a first-trust confirmation for user certificate roots. To run unattended, the disposable CI VM pre-trusted only its newly generated fixture roots in the machine store, then exercised the real user-store import; all fixture certificates were removed afterwards. Production adds only Current User trust and retains Windows' confirmation prompt. This is a headless audit accommodation, not a production certificate-validation bypass or a completed office UI acceptance test.

The live production download of `MandalaGatewaySetup-1.1.0.exe` was independently downloaded on macOS and matched the passing Windows audit and `gateway/release.json`: **24,825,179 bytes**, SHA-256 `0fd024c0cf69d8e913c048f5e3e20c2e50d2fdf0c4584dbc6108d5ac98150ce3`. Backend: `nzlajptokbcgeaifgnoq`. The unchanged employee 1.0.15 manifest still matches its previously audited filename, production backend, 51,056,706-byte size and checksum above.

Production web deployment `dpl_myUAx88LRSbNpAvutKcmKWbgMPaj` passed its build/type checks. Browser verification of the authenticated live `/desktop-agent` page confirmed the exact gateway 1.1.0 and employee 1.0.15 download links and guided setup instructions. No unrelated regression suite was rerun. No domain entities, permission roles or organizational categories changed.

IT handoff is ready. Local IT still owns installation, the Windows approval prompts, external file-server/domain-controller isolation and reserved LAN address. The intern/local Mandala administrator must complete the actual LAN-only start/stop and confirm its production time-entry reference. An installer audit and gateway health response do not prove that their office LAN or employee save is working. Automatic certificate renewal is not included; arrange maintenance before the one-year leaf expiry.
