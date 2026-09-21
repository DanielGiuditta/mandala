#!/usr/bin/env python3
"""Bounded disposable Windows gateway reboot test; never uses employee credentials."""
import hashlib
import http.server
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shutil
import socket
import subprocess
import tarfile
import threading
import time
import xml.sax.saxutils
import zipfile

SOURCE = Path(__file__).resolve().parent
WORK = Path(os.environ["RUNNER_TEMP"]) / "mandala-gateway-rehearsal"
OUT = WORK / "evidence"
GATEWAY_SHA = "0fd024c0cf69d8e913c048f5e3e20c2e50d2fdf0c4584dbc6108d5ac98150ce3"
VHDX_URL = ("https://software-static.download.prss.microsoft.com/dbazure/"
            "888969d5-f34g-4e03-ac9d-1f9786c66749/"
            "26100.1742.amd64fre.ge_release_svc_refresh.240906-0331_server_serverdatacentereval_en-us.vhdx")
EVENTS = []
DONE = threading.Event()


def run(args, **kwargs):
    return subprocess.run([str(arg) for arg in args], check=True, **kwargs)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def safe_extract(archive, destination):
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            name = PurePosixPath(member.filename.replace("\\", "/"))
            require(not name.is_absolute() and ".." not in name.parts,
                    "Unsafe artifact path")
            require((member.external_attr >> 16) & 0o170000 != 0o120000,
                    "Artifact must not contain symbolic links")
        bundle.extractall(destination)


def prepare_payload():
    run_id = os.environ.get("CANDIDATE_RUN_ID", "")
    require(re.fullmatch(r"[0-9]+", run_id), "An audited candidate run ID is required")
    repo = os.environ["GH_REPO"]
    audit = json.loads(run(["gh", "api", f"repos/{repo}/actions/runs/{run_id}"],
                          capture_output=True, text=True).stdout)
    require(audit["conclusion"] == "success" and audit["status"] == "completed",
            "Candidate audit must have completed successfully")
    require(audit["name"] == "Audit employee startup repair",
            "Candidate must come from the employee startup audit workflow")
    artifacts = WORK / "artifacts"
    artifacts.mkdir()
    run(["gh", "run", "download", run_id, "--repo", repo, "--name",
         "MandalaRecoveryCandidate-1.2.3", "--dir", artifacts])
    package = artifacts / "MandalaRecoveryCandidate-1.2.3.zip"
    package_sha = sha256(package)
    audit_text = (artifacts / "office-test-audit.txt").read_text(encoding="utf-8-sig")
    match = re.search(r"bytes=(\d+) sha256=([a-f0-9]{64})", audit_text)
    require(match and int(match[1]) == package.stat().st_size and match[2] == package_sha,
            "Downloaded candidate differs from its audit hash/size")
    payload = WORK / "payload"
    kit = payload / "kit"
    kit.mkdir(parents=True)
    safe_extract(package, kit)
    manifest = json.loads((kit / "package-manifest.json").read_text(encoding="utf-8-sig"))
    require(manifest["version"] == "1.2.3" and
            manifest["backend"] == "nzlajptokbcgeaifgnoq" and
            manifest["sourceCommit"] == audit["head_sha"],
            "Candidate source/version/backend differs from audited run")
    listed = set()
    for item in manifest["files"]:
        relative = PurePosixPath(item["name"])
        require(not relative.is_absolute() and ".." not in relative.parts,
                "Unsafe inventory path")
        file = kit / str(relative)
        require(file.is_file() and file.stat().st_size == item["bytes"] and
                sha256(file) == item["sha256"], "Candidate inventory mismatch: " + str(relative))
        listed.add(str(relative))
    actual = {str(file.relative_to(kit)) for file in kit.rglob("*") if file.is_file()}
    require(actual == listed | {"package-manifest.json"}, "Unlisted candidate files")
    gateway_dir = artifacts / "gateway"
    run(["gh", "run", "download", "34306122310", "--repo", repo, "--name",
         "MandalaGatewaySetup-1.1.0", "--dir", gateway_dir])
    gateway = gateway_dir / "MandalaGatewaySetup-1.1.0.exe"
    require(gateway.stat().st_size == 24825179 and sha256(gateway) == GATEWAY_SHA,
            "Gateway installer differs from approved Windows audit")
    shutil.copy2(gateway, payload / gateway.name)
    for name in ("bootstrap.ps1", "gateway-guest.ps1"):
        shutil.copy2(SOURCE / name, payload / name)
    metadata = {"sourceCommit": audit["head_sha"], "candidateRunId": run_id,
                "packageSha256": package_sha, "packageBytes": package.stat().st_size,
                "gatewayInstallerSha256": GATEWAY_SHA}
    for path in (payload / "artifact-metadata.json", OUT / "artifact-metadata.json"):
        path.write_text(json.dumps(metadata, indent=2))
    return payload


def answer_file(password):
    secret = xml.sax.saxutils.escape(password)
    return fr'''<?xml version="1.0" encoding="utf-8"?>
<unattend xmlns="urn:schemas-microsoft-com:unattend">
  <settings pass="specialize">
    <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <ComputerName>MANDALA-LAB</ComputerName><TimeZone>UTC</TimeZone>
    </component>
  </settings>
  <settings pass="oobeSystem">
    <component name="Microsoft-Windows-International-Core" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <InputLocale>en-US</InputLocale><SystemLocale>en-US</SystemLocale><UILanguage>en-US</UILanguage><UserLocale>en-US</UserLocale>
    </component>
    <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <OOBE><HideEULAPage>true</HideEULAPage><HideOnlineAccountScreens>true</HideOnlineAccountScreens><HideWirelessSetupInOOBE>true</HideWirelessSetupInOOBE><ProtectYourPC>3</ProtectYourPC></OOBE>
      <UserAccounts><AdministratorPassword><Value>{secret}</Value><PlainText>true</PlainText></AdministratorPassword></UserAccounts>
      <AutoLogon><Password><Value>{secret}</Value><PlainText>true</PlainText></Password><Enabled>true</Enabled><Username>Administrator</Username><LogonCount>1</LogonCount></AutoLogon>
      <FirstLogonCommands><SynchronousCommand xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State" wcm:action="add"><Order>1</Order><Description>Start isolated Mandala reboot test</Description><CommandLine>powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\MandalaRehearsal\bootstrap.ps1</CommandLine></SynchronousCommand></FirstLogonCommands>
    </component>
  </settings>
</unattend>
'''


def prepare_disk(payload):
    require(shutil.disk_usage(WORK).free >= 35 * 1024**3,
            "Need at least 35 GiB free before evaluation image download")
    image = WORK / "windows-server-eval.vhdx"
    print("Downloading official Microsoft evaluation VHDX; media is not redistributed.", flush=True)
    run(["curl", "--fail", "--location", "--proto", "=https", "--tlsv1.2",
         "--retry", "3", "--max-time", "900", "--output", image, VHDX_URL])
    require(image.stat().st_size == 11686379520, "Official evaluation media size changed")
    (OUT / "evaluation-media.json").write_text(json.dumps({
        "officialSource": VHDX_URL, "bytes": image.stat().st_size, "sha256": sha256(image),
        "purpose": "Disposable gateway evaluation only; not an employee operating-system license"
    }, indent=2))
    disk = WORK / "guest.qcow2"
    run(["qemu-img", "create", "-f", "qcow2", "-F", "vhdx", "-b", image, disk])
    answer = WORK / "Unattend.xml"
    answer.write_text(answer_file("Mandala-" + secrets.token_urlsafe(20) + "!a1"))
    setup = WORK / "SetupComplete.cmd"
    setup.write_text("@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\MandalaRehearsal\\bootstrap.ps1\r\n")
    archive = WORK / "payload.tar"
    with tarfile.open(archive, "w") as bundle:
        bundle.add(payload, arcname="MandalaRehearsal")
    # Only the derived overlay is modified. The official base remains read-only.
    commands = (f'mkdir-p /Windows/Panther\n'
                f'upload "{answer}" /Windows/Panther/Unattend.xml\n'
                f'mkdir-p /Windows/Setup/Scripts\n'
                f'upload "{setup}" /Windows/Setup/Scripts/SetupComplete.cmd\n'
                f'tar-in "{archive}" /\n')
    print("Injecting disposable unattended setup and exact audited package into guest overlay.", flush=True)
    run(["sudo", "env", "LIBGUESTFS_BACKEND=direct", "guestfish", "--rw", "-a", disk, "-i"],
        input=commands, text=True, timeout=600)
    partition_type = run(["sudo", "env", "LIBGUESTFS_BACKEND=direct", "guestfish", "--ro",
                          "-a", disk, "run", ":", "part-get-parttype", "/dev/sda"],
                         capture_output=True, text=True, timeout=300).stdout.strip()
    require(partition_type in {"gpt", "msdos"}, "Unsupported evaluation disk partition scheme")
    (OUT / "guest-firmware.json").write_text(json.dumps({"partitionScheme": partition_type,
                                                        "firmware": "UEFI" if partition_type == "gpt" else "BIOS"}))
    answer.unlink()
    archive.unlink()
    return disk, partition_type == "gpt"


class EvidenceReceiver(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/evidence":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= 1024 * 1024:
            self.send_error(413)
            return
        try:
            item = json.loads(self.rfile.read(length).decode("utf-8-sig"))
            require(item.get("phase") in {"progress", "prepared", "first-reboot", "setup-reentry", "complete", "failed"},
                    "Unknown evidence phase")
            EVENTS.append(item)
            path = OUT / f"guest-{len(EVENTS):02d}-{item['phase']}.json"
            path.write_text(json.dumps(item, indent=2))
            print("Guest evidence: " + item["phase"] + (" / " + item["step"] if "step" in item else ""), flush=True)
            if item["phase"] in {"complete", "failed"}:
                DONE.set()
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"{}")
        except (ValueError, RuntimeError) as error:
            self.send_error(400, str(error))

    def log_message(self, *_):
        pass


def screenshot(socket_path, name):
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(5)
            client.connect(str(socket_path))
            reader = client.makefile("rb")
            reader.readline()
            client.sendall(b'{"execute":"qmp_capabilities"}\n')
            while "return" not in json.loads(reader.readline()):
                pass
            ppm = OUT / (name + ".ppm")
            client.sendall((json.dumps({"execute": "screendump", "arguments": {"filename": str(ppm)}}) + "\n").encode())
            while "return" not in json.loads(reader.readline()):
                pass
        from PIL import Image
        Image.open(ppm).save(OUT / (name + ".png"))
        ppm.unlink()
    except (OSError, ValueError, ImportError):
        pass


def boot_and_observe(disk, uefi):
    firmware = Path("/usr/share/OVMF/OVMF_CODE_4M.fd")
    variables = WORK / "OVMF_VARS.fd"
    shutil.copy2("/usr/share/OVMF/OVMF_VARS_4M.fd", variables)
    monitor = WORK / "qmp.sock"
    # Guest has no host mounts, no inbound forwarding and no host credentials.
    # The only listening host endpoint is this fixed-field evidence receiver.
    server = http.server.HTTPServer(("127.0.0.1", 8787), EvidenceReceiver)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    log = (OUT / "qemu.txt").open("w")
    # Grant only the job user access to KVM; QEMU itself remains unprivileged.
    run(["sudo", "setfacl", "-m", f"u:{os.getuid()}:rw", "/dev/kvm"])
    command = ["qemu-system-x86_64", "-enable-kvm", "-machine", "q35",
               "-cpu", "host", "-smp", "2", "-m", "6144", "-display", "none",
               "-drive", f"file={disk},format=qcow2,if=none,id=system",
               "-device", "ide-hd,drive=system,bus=ide.0", "-boot", "order=c",
               "-netdev", "user,id=lan,net=10.0.2.0/24,dhcpstart=10.0.2.15",
               "-device", "e1000,netdev=lan", "-rtc", "base=utc",
               "-qmp", f"unix:{monitor},server=on,wait=off", "-serial", "none"]
    if uefi:
        command += ["-drive", f"if=pflash,format=raw,readonly=on,file={firmware}",
                    "-drive", f"if=pflash,format=raw,file={variables}"]
    print("Booting disposable Windows gateway; maximum observation time is 35 minutes.", flush=True)
    process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
                               env={"PATH": os.environ["PATH"], "LANG": "C.UTF-8"})
    start = time.monotonic()
    last_capture = 0
    try:
        while not DONE.wait(15):
            require(process.poll() is None, "QEMU exited before reboot evidence completed")
            elapsed = time.monotonic() - start
            if elapsed - last_capture > 120:
                screenshot(monitor, f"screen-{int(elapsed):04d}s")
                print(f"Waiting for guest evidence ({int(elapsed)}s elapsed).", flush=True)
                last_capture = elapsed
            require(elapsed < 35 * 60, "Guest did not complete within bounded observation window")
        screenshot(monitor, "final-screen")
        require(EVENTS[-1]["phase"] == "complete" and EVENTS[-1].get("result") == "PASS",
                "Guest reported a rehearsal failure; inspect fixed-field evidence")
        required = {phase: next((event for event in EVENTS if event["phase"] == phase), None)
                    for phase in ("prepared", "first-reboot", "setup-reentry", "complete")}
        require(all(required.values()), "Missing a required guest rehearsal phase")
        boots = [required[phase]["bootUtc"] for phase in ("prepared", "first-reboot", "complete")]
        require(len(set(boots)) == 3, "Rehearsal did not observe two distinct guest reboots")
        require(required["complete"]["gatewayRebootCount"] == 2, "Unexpected reboot count")
        print("PASS: actual Windows gateway survived two guest reboots and setup re-entry.", flush=True)
        print("NOT TESTED: employee sign-in, production time writes, UAC or office acceptance.", flush=True)
    finally:
        screenshot(monitor, "last-screen")
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        server.shutdown()
        log.close()


def main():
    WORK.mkdir()
    OUT.mkdir()
    try:
        payload = prepare_payload()
        disk, uefi = prepare_disk(payload)
        boot_and_observe(disk, uefi)
    except Exception as error:
        (OUT / "controller-failure.json").write_text(json.dumps({
            "result": "FAIL", "type": type(error).__name__, "detail": str(error),
            "limitations": "A failed or missing reboot report is not a pass."
        }, indent=2))
        raise


if __name__ == "__main__":
    main()
