# Isolated Windows reboot rehearsal

This directory is maintainer test infrastructure. It is not included in the IT
package and does not configure office machines or write production time.

## First gate: available host capability

`rehearse-lan-windows.yml` runs a seven-byte x86 guest through Linux KVM and records
available RAM and disk space. A pass proves actual nested guest execution; it does
not prove Windows boots or any Mandala behavior. No large media is downloaded.

GitHub says nested virtualization is technically possible but unsupported:
<https://docs.github.com/en/actions/concepts/runners/github-hosted-runners>.
Probe each selected host image rather than assuming `/dev/kvm` is usable.

## Official evaluation media investigated on 20 September 2026

Microsoft's public download page directly links both downloads:
<https://www.microsoft.com/en-us/evalcenter/download-windows-server-2025>.

| Format | Official link | HEAD-reported bytes |
| --- | --- | ---: |
| Server 2025 Datacenter evaluation VHDX | <https://aka.ms/WinServ2025vhd-enus> | 11,686,379,520 |
| Server 2025 evaluation ISO | <https://aka.ms/WinServ2025iso-enus> | 8,152,356,864 |

Both links resolved by HTTPS to `software-static.download.prss.microsoft.com`
without authentication. No media has been downloaded by the capability job.
The Microsoft page describes a 180-day evaluation, says to register before
installing, and requires online activation within 10 days to avoid shutdown.
Follow Microsoft's evaluation terms; do not substitute third-party Windows images
or treat the evaluation as an employee deployment license.

## Run the gateway-only rehearsal

Dispatch `rehearse-lan-windows.yml` on the recovery branch with
`mode=gateway-reboot` and `candidate_run_id` naming a successful
`Audit employee startup repair` run. The controller verifies that run, downloads
its exact candidate ZIP and approved gateway installer, checks hashes and every
inventory item, then downloads the official evaluation VHDX. No GitHub credential
or private production credential is copied into the guest. The base image is not
modified or uploaded; only its disposable overlay is changed.

The generated unattended setup uses a random local Administrator password. The
guest removes temporary automatic login, then a separate SYSTEM task observes
the gateway across two actual guest restarts. This observer never starts the
gateway during either boot observation. Between the two boots it invokes the
installed corrected setup helper and confirms that the approved firewall scope
and pairing remain unchanged. The controller receives only fixed-field evidence
over its loopback-bound endpoint and retains screenshots if startup stalls.

The first execution remains a rehearsal of this new lab harness, not a claimed
pass. Inspect the run artifacts; a timeout, exception, missing phase or repeated
boot identity fails. The overall job is capped at 60 minutes, with a 35-minute
guest observation limit. The output explicitly excludes employee authentication,
production time saves, UAC and checker RunOnce acceptance.

## Why the guest is separate from the Actions runner

A guest disk and its controller must persist across the guest's real reboots.
Rebooting the Actions runner itself does not provide that guarantee. A QEMU guest
inside a running Ubuntu job leaves the controller alive. A Windows Server guest
can prove the gateway's actual Task Scheduler boot behavior but cannot stand in
for every Windows desktop/UAC/employee-profile check.

Before downloading media, confirm sufficient working disk space for media plus
guest overlay (at least 35 GiB available), KVM, and the permitted evaluation setup.
Use Microsoft's media, a disposable guest-local administrator, unattended setup
and host-only report transport. Pass the exact already-audited installer and
recovery ZIP into the guest; retain their SHA-256 values in the resulting evidence.
Do not pass a GitHub token or Supabase service-role key into the guest.

The gateway rehearsal uses synthetic pairing material and the guest's exact
`10.0.2.15/32` scope. It observes the exact Local Service process/listener, task
settings, pairing/configuration hashes and trusted mutual-TLS health after each
boot. Its QEMU network has no host shares or inbound forwarding. It does not call
authenticated production RPCs. The synthetic device is not an office enrollment.

Full employee acceptance additionally needs a separate employee Windows profile
and machine/guest, restricted routing, the real approved Agent, two permitted
projects, and authorized sign-in/time writes. No credentials or production
identity are supplied by this directory. Host capability and gateway reboot
results must remain explicitly separate from employee and office acceptance.
