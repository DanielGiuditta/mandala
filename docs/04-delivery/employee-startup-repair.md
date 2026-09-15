# Employee agent startup repair

## Report and scope

On September 15, 2026, Surjith reported that the employee PC did not open the
agent after restart. Its Startup folder screenshot lacked the expected Mandala
Agent shortcut; adding a shortcut instead opened the office setup wizard.
The evidence does not establish why the installer shortcut was absent.

Employee startup uses a Windows shortcut, not the gateway's scheduled task.
The gateway task must remain on the internet-connected gateway computer.

## Fix

- `scripts/startup-repair/Repair Mandala Startup.cmd` repairs the existing
  employee installation without reinstalling or changing its time-tracking code.
- The repair checks the installed executable and its effective production
  configuration before changing startup. The administrator child process repairs
  only the common Startup folder. The original employee process removes duplicate
  or recognized setup shortcuts from its own Startup folder and opens the agent.
- Replaced shortcuts are moved to backups outside Startup. Unrelated shortcuts,
  gateway tasks, connection settings, certificates, authentication data and pending
  time are untouched. A disabled Windows Startup-app setting is reported, not reset.
- The agent installer ships the repair and a Start menu entry. Its common shortcut
  has an explicit working directory. The release audit checks the actual installed
  shortcut, not just the Inno Setup source.
- The existing wizard uses its existing button/label components to identify itself
  as one-time setup, offer the employee repair, and check startup after pairing.
  This is a correction to the existing Windows UI pattern, not a new design system.

## Delivery and acceptance

The dedicated `Audit employee startup repair` Windows workflow tests the scripts
using Windows PowerShell 5 and real `.lnk` files, launches a harmless fixture through
the repaired shortcut, builds an unpublished installer fixture, deletes its common
shortcut and repairs it through the actual elevated entry point. Only the repair ZIP
and its SHA-256/byte-size audit are uploaded; the fixture installer is never published.

The repair ZIP is separate from an employee installer. Existing installer release
guardrails remain mandatory for any future agent/gateway release.

IT needs Windows administrator approval. Extract the entire
`MandalaAgentStartupRepair-1.0.0.zip`, run `Repair Mandala Startup.cmd` normally
from the employee Windows account, and approve the shared-shortcut prompt. Do not
launch the whole repair as a different administrator account.

After the repair succeeds, save active work, restart and sign in. The employee
must see Mandala Agent without opening office setup or clicking a gateway button.
Automatic launch does not automatically start or resume tracking; the employee
still selects a project and clicks Start Work.

Before employee rollout, verify the installed agent version and production backend,
then start/stop, switch project, and disconnect/reconnect. Check saved references
against actual production `time_entries`. A successful script or clock comparison
does not establish end-to-end time logging or real-machine login behavior.

## Domain validation

No business entities, fields, permission roles, time-session semantics, division or
cost-center concepts were added. Naming remains Mandala Agent for the employee
application and Mandala LAN Gateway for the gateway task. No domain-model deviation.

## Verification record - September 15, 2026

[Windows audit 34970764097](https://github.com/DanielGiuditta/mandala/actions/runs/34970764097)
passed for code commit `ee77a3b20ea256eebdf6baba27bae4bcb3bfc634`: PowerShell 5
repair scenarios, downloaded launcher (including spaces/ampersands in its path),
desktop regressions, actual installer startup audit, and missing installed-shortcut
repair. The unpublished installer fixture was not included in the delivered artifact.

The downloaded repair ZIP was verified on this Mac against the CI audit:

- Filename: `MandalaAgentStartupRepair-1.0.0.zip`
- Size: 4,754 bytes
- SHA-256: `20f2bf36baa3553d760453cb6fcf42ac8f68d396c59f781d95f1d5eaeeb427ad`
- Its four files match the workspace source after Windows line-ending normalization.

Still requires on-site confirmation: employee Windows sign-in after repair and the
production saved-time checks above. The revised office setup labels/button reuse
the existing form pattern; visual verification of that wizard awaits a gateway
release. The delivered repair does not depend on updating the gateway wizard.
