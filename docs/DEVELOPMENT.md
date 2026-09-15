# Development and validation

Follow [Installation](INSTALLATION.md). The project is a single npm package with `apps/web`, `apps/api`, `apps/worker` and shared `packages/`; it is not an npm-workspaces setup.

## Daily commands

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run docs:check
```

`build` checks TypeScript, builds Vite assets and bundles API/worker/migration/backup utilities. `start` and `worker` run the compiled API and worker. `dev` starts all three development processes; `dev:web` starts API and Vite only and needs a separate worker for readiness.

No formatter/linter is configured. Follow the existing strict TypeScript, ESM `.js` import paths, Zod validation, parameterized SQL and server-side ownership/role checks. Do not introduce an unrelated rewrite to reformat code.

## Integration and browser tests

Use only a disposable local deployment. These suites create users, files, shares, plans, security events and CMS changes. They may revoke test sessions and change settings.

```sh
npm run test:integration
npm run test:extended
npm run test:settings
npm run test:reset
npm run test:e2e
```

The helper reads `.secrets/owner-account.json` when present; its shape is `{email,password,name}`. Create it locally for the owner account used by tests, never commit it. If no owner exists, the helper can bootstrap from `.secrets/bootstrap-token`. `TEST_OWNER_FILE` selects a separate protected fixture file. `TEST_ORIGIN` defaults to `http://localhost:18400`; do not point tests at a live user installation.

Playwright requires its browser installation (`npx playwright install chromium`, or `--with-deps` on Linux). It uses one worker to protect stateful flows. Reports, traces/state and fixture bytes belong only in ignored output directories. Screenshots committed to docs must use synthetic data and mask every capability URL.

Optional local suites include `test:large`, `test:restart`, `test:tls`, and `benchmark`. Read their source and disk/runtime requirements first. Restart tests deliberately stop project services. Large tests can consume tens of GiB. Public-server scripts require explicit test-target/SSH configuration and are not part of normal CI. Never bypass certificate validation on a public host.

## CI

The GitHub workflow installs the locked dependencies, checks types, runs unit tests, builds, validates documentation/assets and scans all fetched Git history with Gitleaks. It has read-only repository permissions and no production deployment step or deployment secrets. Integration and browser suites run separately against disposable infrastructure.
