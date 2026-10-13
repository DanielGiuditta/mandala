# Windows Agent 1.0.17 — resume after inactivity

## Behavior

An employee selects a project and starts work once. Five minutes without Windows input saves the current interval and pauses tracking. Returning keyboard or mouse activity starts a new interval on that same project. The idle gap is excluded. Explicit Stop, including while paused or while a resume request is in flight, disables automatic resume until Start Work is selected again. Startup/sign-in and project dropdown selection alone do not start work; opening files is not monitored.

New direct and LAN sessions use the existing durable desktop receipt protocol. Pending saves finish before a resumed interval starts. Lost responses reuse the original receipt, project access is rechecked, and another device's active timer cannot be adopted or replaced. Earlier direct-client timers remain visible and stoppable on upgrade before starting new work. No database migration, domain field, office hierarchy, or authorization expansion is introduced. The web sidebar retains its existing explicit restart behavior.

The native UI keeps the existing layout and adds paused/resumed explanations and Stop cancellation. This is a small behavior/copy change to the existing Windows screen rather than a new design surface.

## Release verification

Published to the private production download on October 13, 2026. Source commit: `459af70031c33048549030a119b0b8b01a9243d7`. [Windows release and behavior audit](https://github.com/DanielGiuditta/mandala/actions/runs/38401761956) passed before publication.

- Native WPF build: zero warnings/errors. Local regression checks passed; Windows CI additionally ran the real DPAPI LAN and direct-client recovery suites.
- Finished installer audit: version, embedded production backend/key, and common startup shortcut verified.
- Installed Windows UI: two actual five-minute idle pauses (305.7 and 305.7 seconds), returning-input resume on the remembered project, dropdown isolation, a fresh interval excluding the idle gap, explicit Stop, and Stop while paused all passed. Seven distinct synthetic receipts; zero duplicates. Offline journal/reconnect and project-switch checks also passed. These were isolated protocol fixtures with zero production writes, not employee acceptance tests.
- Production `latest/release.json` and `latest/MandalaAgentSetup-1.0.17.exe` match the audited artifact: **51,070,938 bytes**, SHA-256 `ecb323a5f93a41c65fec85402c86ca1848c571f4cff714e5961d612bac93c406`.
- A Mac download directly from production storage and a second download through the authenticated web application both matched that exact SHA-256 and byte size. The [production download page](https://mandala-web-tau.vercel.app/desktop-agent) displayed `MandalaAgentSetup-1.0.17.exe`.
- Updated production web instructions deployed successfully; local typecheck and production build passed. Vercel deployment: `dpl_3CPYRaTmeq4StmPvhAXAzscvzYrJ`.

Local evidence is retained under `local-resources/auto-resume-2026-10-13/` in the primary checkout. Employee PCs were not upgraded in this release task, and no new employee production time entries or reboot acceptance are claimed.

## Employee upgrade

Windows administrator approval is required. Use exactly `MandalaAgentSetup-1.0.17.exe`; the application shows `1.0.17.0`. This is the existing private unsigned pre-launch distribution, so Windows may display an unverified publisher warning. It is not an organization-signed broad rollout.

Before upgrading, stop ordinary work and confirm its saved reference. Preserve any pending journal and the employee's original Windows profile. Run the versioned installer over the existing installation; retain the existing sign-in, LAN pairing, certificates and gateway configuration. Do not reinstall the gateway or clear app data. Publishing the installer does not automatically update installed employee PCs.

After upgrade, confirm the version and production backend `nzlajptokbcgeaifgnoq` before signing in. Start ordinary work on the intended project. Confirm the next saved reference against its production time entry. If a save is missing, export diagnostics before another test. For behavior acceptance, idle for six minutes, return to keyboard/mouse activity, confirm the same project resumes with a fresh interval, then Stop and confirm further input does not restart tracking. Record the date, times in IST with AM/PM, project and saved references.

No additional attended IT session, network fault test, password reset or employee timer manipulation is required for this release handoff. Employee workstation installation and actual first-save acceptance are separate from CI and artifact publication evidence.
