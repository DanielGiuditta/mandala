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
