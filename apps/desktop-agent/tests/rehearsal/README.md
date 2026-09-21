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

## Subsequent rehearsal route

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

The gateway rehearsal can proceed without an employee login: create fixture
pairing material in the disposable guest, repair a stopped legacy task using the
shipped package, then reboot twice. A guest-local resume task may collect evidence
but must not start the Mandala task. Compare boot identifiers, observe the exact
Local Service process/listener, task settings, pairing/configuration hashes and
trusted mutual-TLS health after each boot. Re-enter setup and verify that durable
startup survives. Export fixed-field evidence to the controller after every phase.
The guest may reach only required public production health/config endpoints; do
not make authenticated time RPCs without a designated authorized test account.

Full employee acceptance additionally needs a separate employee Windows profile
and machine/guest, restricted routing, the real approved Agent, two permitted
projects, and authorized sign-in/time writes. No credentials or production
identity are supplied by this directory. Host capability and gateway reboot
results must remain explicitly separate from employee and office acceptance.
