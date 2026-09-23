#!/usr/bin/env python3
"""Actual installer/standard-user restart in a disposable Windows evaluation VM."""
import importlib.util
import json
import os
import re
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("gateway_lab", HERE / "run-gateway-guest.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)


def prepare_payload():
    run_id = os.environ.get("CANDIDATE_RUN_ID", "")
    lab.require(re.fullmatch(r"[0-9]+", run_id), "Audited installer run required")
    audit_run = json.loads(lab.run(
        ["gh", "api", f"repos/{os.environ['GH_REPO']}/actions/runs/{run_id}"],
        capture_output=True, text=True).stdout)
    lab.require(audit_run["status"] == "completed" and audit_run["conclusion"] == "success"
                and audit_run["name"] == "Build Mandala Windows Agent", "Installer audit did not pass")
    payload = lab.WORK / "payload"
    payload.mkdir()
    lab.run(["gh", "run", "download", run_id, "--repo", os.environ["GH_REPO"],
             "--name", "MandalaAgentSetup-1.0.16", "--dir", payload])
    audit = json.loads((payload / "installer-audit.json").read_text(encoding="utf-8-sig"))
    installer = payload / "MandalaAgentSetup-1.0.16.exe"
    lab.require(audit["filename"] == installer.name and audit["version"] == "1.0.16" and audit["backend"] == "nzlajptokbcgeaifgnoq"
                and audit["sourceCommit"] == audit_run["head_sha"]
                and audit["installedConfigurationVerified"] and audit["startupShortcutVerified"]
                and not audit["publicationRequested"]
                and audit["sha256"] == lab.sha256(installer)
                and audit["bytes"] == installer.stat().st_size, "Installer provenance mismatch")
    shutil.copy2(payload / "installer-audit.json", lab.OUT / "installer-audit.json")
    repo = HERE.parents[3]
    for relative in ("apps/desktop-agent/scripts/office-test", "apps/lan-services/deploy/windows",
                     "apps/desktop-agent/tests/fixtures"):
        shutil.copytree(repo / relative, payload / relative)
    shutil.copy2(repo / "apps/lan-services/gateway.mjs", payload / "apps/lan-services/gateway.mjs")
    # Gateway's own relative modules; no dependencies, credentials or repo checkout in guest.
    for file in (repo / "apps/lan-services").glob("*.mjs"):
        shutil.copy2(file, payload / "apps/lan-services" / file.name)
    for name in ("agent-bootstrap.ps1", "agent-system.ps1", "agent-user.ps1"):
        shutil.copy2(HERE / name, payload / ("bootstrap.ps1" if name == "agent-bootstrap.ps1" else name))
    # Official Node distribution, matched to its HTTPS SHA-256 inventory.
    manifest = lab.run(["curl", "--fail", "--silent", "--show-error", "--proto", "=https",
                        "https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt"],
                       capture_output=True, text=True).stdout
    match = re.search(r"^([a-f0-9]{64})\s+(node-v24\.[0-9]+\.[0-9]+-win-x64.zip)$", manifest, re.M)
    lab.require(match is not None, "Official Node inventory missing x64 ZIP")
    archive = lab.WORK / match[2]
    lab.run(["curl", "--fail", "--silent", "--show-error", "--proto", "=https", "--output", archive,
             "https://nodejs.org/dist/latest-v24.x/" + match[2]])
    lab.require(lab.sha256(archive) == match[1], "Node download hash mismatch")
    unpacked = lab.WORK / "node"
    lab.safe_extract(archive, unpacked)
    node = list(unpacked.glob("*/node.exe"))
    lab.require(len(node) == 1, "Node runtime ambiguous")
    shutil.copy2(node[0], payload / "node.exe")
    (lab.OUT / "node-provenance.json").write_text(json.dumps({"filename": match[2], "sha256": match[1]}))
    return payload


def validate_events():
    phases = {name: next((e for e in lab.EVENTS if e["phase"] == name), None)
              for name in ("prepared", "first-reboot", "complete")}
    lab.require(all(phases.values()), "Missing employee rehearsal phase")
    lab.require(len({e["bootUtc"] for e in phases.values()}) == 3, "Two real reboots required")
    result = phases["complete"]
    for field in ("standardUser", "automaticStartup", "restoredSignIn", "projectsLoaded",
                  "sameWindowsUser", "sameCertificate", "uacEnabled", "firewallEnabled"):
        lab.require(result.get(field) is True, "Missing pass: " + field)
    lab.require(result.get("productionEntries") == 0 and result.get("testSessions") == 0,
                "Unexpected time-tracking writes")
    print("PASS: exact audited installer, standard-user automatic startup and restored fixture sign-in across real Windows reboot.", flush=True)
    print("No production sign-in/time writes. This is a Server evaluation guest, not office Windows/domain acceptance.", flush=True)


lab.prepare_payload = prepare_payload
lab.validate_events = validate_events
lab.main()
