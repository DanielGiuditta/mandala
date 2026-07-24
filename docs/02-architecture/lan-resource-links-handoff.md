# LAN Resource Links Handoff

## Purpose

This handoff explains the current client requirement around resource files and the intended architecture direction.

The client is an architecture firm in India. Many Windows 10/11 workstations do not have internet access, but they can access the office LAN. Their project files live on an existing IBM/Windows Server file share, and they explicitly want drawings, photos, Excel files, PDFs, and other documents to remain in normal file formats on that server.

Mandala should not store or proxy the actual project files in Supabase. Mandala should store structured metadata and file path references only.

## Current Decision

Use Supabase Cloud for application metadata:

- users and auth metadata
- offices
- people
- projects
- assignments
- time entries
- resource metadata
- file path references

Use the existing IBM/Windows server only for file storage:

- DWG/RVT/drawing files
- photos and scans
- PDFs
- Excel/Word/PowerPoint files
- existing archive folders

Mandala should link to existing files on the server. It should not upload new files to Supabase, and for this client V1 should not move/copy files onto the Mandala app server.

## Target Topology

```text
Offline Windows PCs
  -> browser opens Mandala on a LAN-reachable gateway

Mandala gateway/app server
  -> has internet access
  -> talks to Supabase Cloud for metadata/time/user/project data
  -> stores no architectural project files

IBM/Windows file server
  -> no internet required
  -> stores the actual files in standard formats
  -> accessed by Windows clients through UNC paths
```

The gateway can be the IT person's internet-enabled machine for testing, but a production setup should prefer an always-on dedicated PC/server with a stable LAN hostname/IP.

## Confirmed / Assumed Requirements

- Supabase Cloud metadata is acceptable as long as Supabase does not touch the files on the IBM server.
- The IBM server should only be used for reading/writing files.
- Employee, project, staffing, and time tracking data should live in the web backend, not on the IBM server.
- Mandala should only link to existing files for now.
- The file path should be the same for all client PCs.
- Opening directly from Mandala in the browser is ideal.
- If direct browser opening is unreliable, V1 should keep a copy-path fallback.

## Important Product Boundary

Do not model "Studio 2" as an Office, division, cost center, or project unless the client explicitly says it is a business office or project.

The sample path from IT looked like:

```text
\\Server\Studio 2 Projects\...
```

Treat `Studio 2 Projects` as a file share/folder name unless confirmed otherwise. Mandala `Office` remains the documented business/location unit from the domain model.

## Current Repo Mismatch

The current product docs and code still assume `ResourceDocument.fileUrl` is an HTTPS URL:

- `docs/01-product/domain-model.md` lists `fileUrl`
- `docs/01-product/field-definitions.md` defines `fileUrl` as an HTTPS URL
- `packages/domain/resourceDocument.ts` exposes `fileUrl`
- `packages/db/projects.ts` validates document URLs as HTTPS
- `supabase/migrations/20260525124500_validate_resource_document_urls.sql` enforces an HTTPS-only `file_url` constraint
- `apps/web/app/components/projects/project-resources-card.tsx` asks users for a `https://...` URL
- `apps/web/app/components/resources/resources-list-table.tsx` renders `document.fileUrl` as a normal web link

Do not change implementation before updating the canonical product/domain docs. This requirement changes the business meaning of resource storage from "HTTPS URL" to "local file share path reference".

## Desired Resource Behavior

For this client, a resource should represent an existing server file:

```text
name: Lobby drawing set
project: Some Project
fileType: DWG
serverPath: \\Server\Studio 2 Projects\Some Project\Drawings\A101.dwg
category: drawing
description: optional notes
uploadedByPersonId: person who linked it in Mandala
createdAt: timestamp when linked in Mandala
```

The actual file remains at the server path and remains openable without Mandala.

## Browser File Link Testing

Browsers often block direct links to local or UNC file paths. Microsoft Edge has a policy that may allow this for intranet HTTPS sites:

`IntranetFileLinksEnabled`

Microsoft documentation: `https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/intranetfilelinksenabled`

Relevant behavior from the docs:

- Works on Windows.
- Allows file URL links from intranet zone HTTPS pages.
- Opens Windows File Explorer to the parent directory and selects the file.
- If disabled or not configured, file links do not open.
- `https://localhost/` is blocked for this policy.
- Loopback addresses are considered internet zone by default.

Therefore the test should use a real LAN hostname, not localhost:

```text
https://mandala-test.local
```

The test machine may need a trusted local certificate and intranet zone configuration.

## Onsite IT Test Plan

The user is not onsite and does not have a Windows machine. The onsite IT person needs to run this test.

### 1. Verify the raw UNC path

Get one harmless test file path:

```text
\\Server\Studio 2 Projects\Some Project\test.xlsx
```

On a normal office PC, paste that exact path into File Explorer.

Expected result: the file or folder opens.

If this fails, Mandala cannot solve it. The issue is the server path, share permissions, network access, or file server configuration.

### 2. Verify the same path from another PC

Paste the exact same path into File Explorer on a second office PC/user account.

Expected result: the same path opens.

This confirms Mandala can safely store UNC paths rather than user-specific mapped drives like `Z:\...`.

### 3. Enable Edge policy on a test PC

On one Windows test PC, enable:

```text
IntranetFileLinksEnabled = 1
```

Registry command option:

```powershell
reg add "HKLM\SOFTWARE\Policies\Microsoft\Edge" /v IntranetFileLinksEnabled /t REG_DWORD /d 1 /f
```

Restart Edge and check:

```text
edge://policy
```

Expected result: `IntranetFileLinksEnabled` appears as enabled.

### 4. Test from an internal HTTPS page

Host a tiny HTTPS page from the proposed Mandala gateway machine on a real LAN hostname.

The page should include:

- an "Open file" link
- a "Copy path" button

Example conversion:

```text
Windows UNC path:
\\Server\Studio 2 Projects\Some Project\test.xlsx

Browser file URL:
file://Server/Studio%202%20Projects/Some%20Project/test.xlsx
```

Expected result: clicking the file link in Microsoft Edge opens Windows File Explorer to the file or folder.

Keep the copy-path button even if this works.

## Minimal Test Page

Use this only as a local IT test artifact. Replace the sample paths with the exact path from the client.

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Mandala file link test</title>
  </head>
  <body>
    <h1>Mandala file link test</h1>
    <p>UNC path:</p>
    <pre id="path">\\Server\Studio 2 Projects\Some Project\test.xlsx</pre>

    <p>
      <a href="file://Server/Studio%202%20Projects/Some%20Project/test.xlsx">
        Open file
      </a>
    </p>

    <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('path').innerText)">
      Copy path
    </button>
  </body>
</html>
```

## Implementation Direction After Test Passes

Do this only after the product docs are updated.

1. Update domain docs to clarify that resource documents can be existing local server file references for this deployment.
2. Replace or extend `ResourceDocument.fileUrl` with a local file reference field, likely a UNC path field such as `serverPath`.
3. Add a migration to remove the HTTPS-only constraint and store the local path safely.
4. Update validation in `packages/db/projects.ts` to accept UNC paths and reject embedded credentials or malformed dangerous values.
5. Replace the project resource "https://..." input with a server path/link form.
6. Render both "Open file" and "Copy path" actions.
7. Keep resource permissions aligned with existing access-control rules.
8. Update preview data and seed data to use realistic UNC-style sample paths if the docs allow it.
9. Audit browser-bundled Supabase calls before offline-client deployment. PCs without internet must talk to the LAN Mandala gateway, not directly to Supabase from the browser.

## Do Not

- Do not store architectural files in Supabase Storage for this client.
- Do not upload existing server files to the Mandala app server.
- Do not make the IBM server internet-facing.
- Do not assume `Studio 2` is an office, division, cost center, or project.
- Do not use mapped drive letters as stored canonical paths.
- Do not remove the copy-path fallback just because Edge policy works on one test PC.

## Open Questions

- Which machine will be the actual production Mandala gateway?
- Will the gateway have a stable LAN hostname and trusted HTTPS certificate?
- Can IT roll out the Edge policy through Group Policy from Active Directory?
- Should direct "Open file" be Edge-only in V1?
- What exact UNC path format should be stored after testing?
- Is a small Windows helper app needed later for more reliable file opening and time tracking?

## Validation Checklist

Before implementing code changes:

- Confirm the exact UNC path opens in File Explorer on at least two office PCs.
- Confirm the Edge policy appears in `edge://policy`.
- Confirm the internal HTTPS test page can open the file link from Edge.
- Confirm the same path works for normal staff users, not only the IT admin account.
- Confirm the implementation still matches `docs/01-product/domain-model.md` after that doc is updated.
- Confirm no division or cost-center concepts were added.
- Confirm naming still matches `docs/01-product/ui-domain-mapping.md`.
- Document any deviations.
