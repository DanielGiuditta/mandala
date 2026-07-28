# Mandala Windows Agent

The Mandala Windows Agent is the primary V1 surface for employee project time tracking. It is a native .NET 8 WPF application, not a browser wrapper.

It signs employees in with their existing Mandala account, uses the shared Supabase time-session functions, and stores its refresh token with Windows DPAPI for that Windows user only.

## Behavior

- One active project timer is shared across the agent and web application.
- Starting another project asks for confirmation, records the finished project time, and begins the selected project.
- Opening a project in the web app never switches the active project.
- The agent checks Windows-wide keyboard and mouse activity every second with `GetLastInputInfo`. It pauses the timer after five minutes without activity, including while the agent is minimized or another Windows application is focused.
- The timer does not resume until the employee selects a project and clicks **Start Work**.

## Build a release on Windows

Install the .NET 8 SDK and Inno Setup, then run from the repository root:

```powershell
.\apps\desktop-agent\scripts\build-release.ps1 `
  -Version "1.0.0" `
  -SupabaseUrl "https://your-project.supabase.co" `
  -SupabaseAnonKey "your-anon-key"
```

This produces `apps/desktop-agent/release/MandalaAgentSetup.exe`. The installer is self-contained for 64-bit Windows and does not require a separate .NET runtime installation.

Before publishing a production installer, sign it with the organization's Windows code-signing certificate:

```powershell
.\apps\desktop-agent\scripts\build-release.ps1 `
  -Version "1.0.0" `
  -SupabaseUrl "https://your-project.supabase.co" `
  -SupabaseAnonKey "your-anon-key" `
  -SigningCertificatePath "C:\secure\mandala-signing.pfx" `
  -SigningCertificatePassword "certificate-password"
```

The signing tool must be available through the Windows SDK. Provide the organization’s timestamp configuration through its standard signing workflow before public rollout.

## Publish to the web application

Apply the database migrations first; `20260722130000_add_desktop_agent_release_bucket.sql` creates the private `desktop-agent-releases` bucket.

Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment, then upload the signed installer:

```powershell
node .\apps\desktop-agent\scripts\publish-release.mjs `
  .\apps\desktop-agent\release\MandalaAgentSetup.exe
```

When `MANDALA_AGENT_VERSION` is set, publishing uses a versioned object key such as `latest/MandalaAgentSetup-1.0.3.exe`. The web app automatically selects the newest versioned installer, or uses `DESKTOP_AGENT_RELEASE_PATH` when explicitly configured.

## IT installation instructions

1. A partner or admin signs in to Mandala and selects **Windows agent** in the sidebar.
2. Select **Download Windows installer**. The link is a short-lived, private download and is unavailable to other roles.
3. Run `MandalaAgentSetup.exe` as an administrator. It installs for all Windows users and adds the agent to the common startup folder.
4. At the employee’s next sign-in, Mandala Agent opens. The employee signs in with their existing Mandala email and password, selects a project, then selects **Start Work**.
5. Confirm that Windows shows the organization as the verified publisher before broad deployment. Do not deploy an unsigned installer to employee devices.

## Automated release build

The manual GitHub workflow at `.github/workflows/build-desktop-agent.yml` builds an installer artifact. To publish directly to the protected web download, configure these repository secrets:

- `MANDALA_SUPABASE_URL`
- `MANDALA_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MANDALA_DESKTOP_SIGNING_PFX_BASE64`
- `MANDALA_DESKTOP_SIGNING_PFX_PASSWORD`

The Supabase URL and anon key are required for every build. When the signing certificate and service-role key are also configured, the workflow signs and publishes the installer; otherwise it produces a build artifact only.

For a pre-launch workstation test before the organization’s signing certificate is available, run the workflow with `publish_unsigned` enabled. This publishes the installer to the same private Mandala download link, but Windows may show a publisher warning. Do not use this option for broad employee deployment.
