# Mandala office services

See [the deployment and security handoff](../../docs/02-architecture/lan-deployment.md).

- `gateway.mjs`: enrolled-device HTTPS time/auth relay to the fixed production backend.
- `previews.mjs`: separate read-only viewer and mutually authenticated publication receiver processes.
- `publish-preview.mjs`: internal push-only publication of explicitly approved PDF/image exports.
- `deploy/`: environment, service, reverse-proxy and publication configuration examples.

These services never mount the original file server and contain no general HTTP proxy, command execution API, or document converter. Network isolation must also be enforced by IT outside the service hosts.

Run the focused checks with `npm run test --workspace @mandala/lan-services`. Runtime code uses Node built-ins only; PGlite is a development-only PostgreSQL test dependency.
