# Five-employee pilot — asynchronous remote setup

Updated October 4, 2026 after Daniel's explicit correction: **no overlapping work hours are required. IT prepares remote access and sends the credentials; the maintainer does the work afterward.** This replaces the previous 45-minute attended session and physical-disconnect test. The earlier attended-session kit is superseded.

[Instructions for Surjith](../../../../local-resources/pilot-2026-10-04/Remote-setup/FOR%20SURJITH.txt) · [Corrected setup bundle](../../../../local-resources/pilot-2026-10-04/Mandala-Remote-Setup-2026-10-04.zip)

## IT's only task: restore the existing access

Ask Surjith for only this: leave STP80 and STP32 powered, connected and awake; open UltraViewer on STP80; ensure NetSupport can open STP32; send the current UltraViewer ID/password privately. He can then leave. No meeting, test suite, package installation, report, five-PC preparation checklist or cable change is assigned to him.

Reuse the approved Windows/admin access and saved STP32 Mandala sign-in that worked previously. Do not ask for those credentials again unless they actually fail. The maintainer inspects the available employee inventory and handles the remaining pilot setup remotely. Request further help only for a concrete blocker that cannot be resolved through existing access. Credentials never belong in a package, document, repository or diagnostic log.

## Maintainer's task: make the existing path work remotely

Connect later through UTM → UltraViewer → STP80 → NetSupport → employees. Inspect the existing gateway state and any pending employee work before changing settings. Keep remote support available; avoid reboots, sign-out and network-disconnect tests that could require someone at the office to recover access.

Current route: employee Agent → `https://192.168.30.80:8443` → production `https://nzlajptokbcgeaifgnoq.supabase.co`. LAN-only computers do not need direct internet. The gateway/cloud must be reachable to start a new session. Confirmed work can remain pending locally during an interruption; that recovery behavior has existing isolated regression coverage and does not require an IT-assisted fault test before this pilot.

Use the audited `Mandala-Pairing-1.0.0.zip` to pair employees in their original Windows profiles. Transfer public request/connection files using the approved support route. Retain installed Agent 1.0.16. Only PCs that need installation use exact `MandalaAgentSetup-1.0.16.exe`, with approved remote Windows administrator access. Pair LAN participants before starting test timers because enrollment briefly refreshes the gateway.

The package fixes two real migration defects: the old wizard tried to downgrade 1.0.16, and it reused expired pairing requests. The fix retains the private key, existing time data and previous configuration backup. It does not require a gateway reinstall or new network exposure.

## The pilot threshold: real employee time reaches production

The maintainer runs a short start → confirmed project switch → stop on one available LAN-only employee PC, using two authorized projects for about two minutes each. Record independent elapsed timing and the save references. Match both exact diagnostic receipt IDs to production `time_entries` for the correct employee, projects, local date, source and duration; confirm no duplicate or unfinished test session. This proves the requested LAN-to-database path.

No physical disconnect, gateway outage, reboot, idle or browser matrix is a prerequisite to this limited employee pilot. Do not force a full acceptance verifier to pass by fabricating observations. The existing `verify-pilot-save.mjs` switch-offline mode remains an optional stronger test and requires genuine outage evidence; use bounded direct production reads for this ordinary two-save check.

When the LAN path works, finish configuring all five and begin the pilot. Check each employee's first ordinary work entry during the pilot; do not make IT perform five separate synthetic test suites. Existing internet-connected participants can retain their direct mode and have their rows checked separately. No additional one-person trial is required before the authorized five-person pilot.

If a save is wrong or missing, preserve the journal/diagnostics and investigate remotely. Do not clear data, repeat successful writes or hand IT another speculative test. Ask IT again only for a concrete physical or restricted-access blocker.

Employees only need: choose project and Start; confirm switches; Stop when finished; explicitly Start after an idle pause; report pending/errors without repeated clicks. Leave STP80 on. Review one normal workday before expanding beyond five.

## Evidence already established

- Pairing ZIP Windows audit passed: [37220612447](https://github.com/DanielGiuditta/mandala/actions/runs/37220612447). Mac download matches 23,282 bytes / SHA-256 `dce9c79d397b16ee9864471fe91cb8848e7e122cfd67afeb6a6cef26baad4aa4`.
- Existing Agent 1.0.16 live download and manifest matched the audited installer on October 4: 51,062,706 bytes / SHA-256 `f517f48ace1638cea05471224938a660bb1def0d1ac17a794a16c2737d30dccb`.
- STP32's existing account and both HiLITE test projects were active, with no active cloud timer, on October 4. Inspect local pending state when connected.
- Fresh UltraViewer attempts on October 4 still reported STP80 unavailable. No office computer or production time was changed during preparation. The pilot has not been falsely marked passed.

Source is in `.worktrees/lan-clock-validation`, branch `codex/lan-clock-validation`; keep unrelated main-checkout work intact. No business-model, authorization, office terminology or domain-mapping changes are introduced.
