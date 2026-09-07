# LAN implementation validation

This records local implementation checks, not production or office acceptance.

Passed:

- Five focused LAN-service checks: real HTTPS enrollment/revocation, restricted gateway routes, signed preview permits, preview content/path/viewer/integrity/expiry enforcement, and transactional PostgreSQL session ownership/retry/permission behavior.
- Existing small agent regression runner with LAN configuration, clock/idle recovery, and journal checks added. The Windows-protected journal test is conditionally executed on Windows; the macOS run explicitly skipped that platform-specific check.
- Release compilation of the Windows WPF application: no warnings or errors.
- Preview-enabled production web build, including TypeScript checks and local PDF worker/font/decoder asset routing.
- Browser inspection of the actual preview component using a synthetic local PDF: page pixels and page-count controls rendered correctly. This check used a local fixture response, not real user documents or production authorization.
- Production dependency audit: no reported vulnerabilities after compatible Next.js, PostCSS, and image-library security updates. Existing React and Supabase versions were preserved in the lockfile.
- Diff formatting check. Domain and UI names reviewed; the existing `windows-tracker` source displays as Windows checker. No division/cost-center concepts or additional business entities were introduced.

Still required before employee use:

- Apply the LAN migration to the verified production Supabase project.
- Install the dedicated office services, trusted certificates, enrolled-device/publisher allowlists, and external firewall rules.
- Build/publish a versioned installer through the existing Windows CI audit and verify its live-download size/checksum. This work did not produce or distribute an audited installer.
- Run the short office acceptance session in [LAN deployment](../02-architecture/lan-deployment.md): actual LAN-only start/stop and reconnect/switch with production time-entry references, file-server isolation, and one allowed/denied preview.

Scope limits are deliberate: fresh sessions require connectivity through the gateway; pending time blocks a new session until sync; preview copies are office-only, explicitly published, limited to PDF/PNG/JPEG, and expire after 24 hours without republishing. Originals are never fetched by the gateway or preview host. A permanently lost workstation requires audited recovery rather than an automatic remote takeover.
