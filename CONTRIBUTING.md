# Contributing

This repository currently has no selected software license. Coordinate contributions with the maintainer and do not assume an unrestricted reuse license.

## Setup and workflow

Use Node.js ≥ 22.12, npm, Git and Docker Compose. Follow [local installation](docs/INSTALLATION.md). Create a focused branch such as `fix/upload-retry`, `feat/storage-adapter` or `docs/arabic-installation`. Keep changes small enough to review and avoid unrelated formatting or rewrites.

Use strict TypeScript, ESM imports, Zod input validation, parameterized SQL and server-side authorization. Keep browser storage credentials limited to short-lived presigned operations. Add regression coverage when changing protocol, quota, privacy or authorization logic.

## Validation

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run docs:check
```

No lint or formatter command is configured. Follow the surrounding style and do not report nonexistent checks as passed. For behavioral changes run relevant integration/browser tests on disposable local infrastructure; see [Development](docs/DEVELOPMENT.md).

## Pull requests

Explain the problem, resulting behavior, validation and compatibility/migration implications. Update English and Arabic documentation together when user-facing instructions change. Include real screenshots for UI changes, using demo data and masked capabilities.

Stage intentional paths and inspect the staged diff. Exclude `.env`, keys, browser state, logs, dumps, uploaded test files and runtime directories. Scan current files and history for credentials before sharing. Report vulnerabilities privately through [SECURITY.md](SECURITY.md), not through public issues. Be respectful, specific and constructive in review.
