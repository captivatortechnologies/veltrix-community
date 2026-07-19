# Contributing to Veltrix Community Edition

Thanks for your interest in improving Veltrix. This is the open-source,
self-hostable core of the Veltrix Security-as-Code platform, and contributions of
all kinds are welcome: bug reports, documentation, tests, and code.

Please also read our [Code of Conduct](./CODE_OF_CONDUCT.md) and
[Security Policy](./SECURITY.md) before you start.

---

## Ways to contribute

- **Report a bug** — open an issue with clear reproduction steps, expected vs.
  actual behavior, and your environment (OS, Docker version, Node version).
- **Suggest a feature** — open a discussion or issue describing the problem you
  want to solve before writing code, so we can agree on direction.
- **Improve docs** — everything under `docs/` and the top-level guides is fair
  game; small fixes can go straight to a pull request.
- **Write code** — pick up an issue labelled `good first issue` or `help wanted`,
  or propose your own change first via an issue.
- **Build an app/plugin** — apps are authored and distributed from the separate
  community apps repository. See [docs/APP_AUTHORING.md](./docs/APP_AUTHORING.md).

---

## Development setup

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20.x | See `.nvmrc`; use `nvm use` |
| pnpm | 9.x | `corepack enable` then `corepack prepare pnpm@9 --activate` |
| Docker + Docker Compose | recent | Runs PostgreSQL, Redis, and (optionally) the full app |
| Git | recent | Commits must be signed off (DCO — see below) |

This is a pnpm workspace. The relevant packages are:

```
server/            # Fastify core: pipeline-engine, app-engine, job-runner, modules, prisma
client/            # React app: shared design system + feature pages
shared/            # Shared TypeScript types (pipeline, app, api)
packages/ui/       # Extracted design system (publishable)
packages/sdk-js/   # @veltrix/sdk (JavaScript/TypeScript)
packages/sdk-python/  # veltrix_sdk (Python)
docs/              # Architecture, quickstart, app authoring, configuration, operations
```

### First-time setup

```bash
# 1. Fork and clone your fork
git clone https://github.com/<you>/veltrix-community.git
cd veltrix-community

# 2. Copy the environment template and fill in secrets
cp .env.example .env
# Generate strong values (the server FAILS FAST if these are unset):
#   JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY, COOKIE_SECRET
# e.g. on Linux/macOS:
openssl rand -hex 32

# 3. Install dependencies
pnpm install

# 4. Generate the Prisma client
pnpm db:generate
```

See [docs/CONFIGURATION.md](./docs/CONFIGURATION.md) for every environment
variable, and [docs/QUICKSTART.md](./docs/QUICKSTART.md) for the fastest path to a
running instance.

### Running locally

The simplest path runs everything in Docker:

```bash
pnpm dev          # docker compose up (postgres, redis, backend, frontend)
pnpm dev:down     # docker compose down
```

For faster iteration on one workspace, run only the infrastructure in Docker and
run the code you're editing directly:

```bash
# Start only PostgreSQL and Redis
docker compose up -d db redis

# Apply the database schema
pnpm db:migrate

# Then run the workspace you're changing with its own dev script, e.g.
pnpm --filter ./server dev
pnpm --filter ./client dev
```

There is no message broker to run — pipeline jobs execute on **BullMQ**, which
uses Redis. The default authentication is **local** (bcrypt + JWT); OAuth/OIDC
providers are optional and off by default.

---

## Code style

- **Language:** TypeScript across server, client, shared, and the JS SDK; Python
  for `veltrix_sdk`.
- **Formatting / linting:** the repo ships ESLint + Prettier config and an
  `.editorconfig` (2-space indent, LF line endings, UTF-8, final newline;
  4-space indent for Python). Run the linters before pushing:

  ```bash
  pnpm lint
  ```

- **Types:** prefer explicit types on public interfaces; keep the shared types in
  `shared/` as the single source of truth for the pipeline and app-manifest
  contracts.
- **Tests:** add or update tests for any behavioral change (see below).
- **No secrets, ever:** do not commit real credentials, tokens, or `.env` files.
  The secrets gate will reject them (see [SECURITY.md](./SECURITY.md)).

---

## Testing

```bash
pnpm test                      # run all workspace test suites
pnpm --filter ./server test    # server unit tests (Jest)
pnpm --filter ./client test    # client unit tests (Vitest / Testing Library)
```

End-to-end specs use Playwright. Please keep coverage green and add tests that
demonstrate the bug you fixed or the feature you added. Tests must not depend on
any private fixtures, real accounts, or external services.

---

## Commit conventions and DCO sign-off

### Conventional Commits

Please format commit subjects as [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add drift-detection summary to pipeline dashboard
fix: reject canvas deploy when required approvers is unmet
docs: clarify secret generation in quickstart
test: cover rollback path for failed health check
chore: bump prisma to 6.x
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, `perf`.

### Developer Certificate of Origin (DCO)

Contributions are accepted under the [Developer Certificate of Origin](https://developercertificate.org/).
Every commit must carry a `Signed-off-by` line certifying that you wrote the code
or otherwise have the right to submit it under the project's license. Add it
automatically with the `-s` flag:

```bash
git commit -s -m "fix: correct approval gate evaluation"
```

This appends, for example:

```
Signed-off-by: Jane Developer <jane@example.com>
```

The name and email must match your Git author identity. Pull requests whose
commits are not signed off will be asked to amend before merge.

---

## Pull request process

1. **Branch** from `main` (e.g. `feat/canary-progress-bar`, `fix/approval-guard`).
2. Make focused changes. Keep pull requests small where possible — large diffs
   are harder to review.
3. Run `pnpm lint`, `pnpm test`, and `pnpm build` locally before pushing.
4. Push and open a pull request against `main`. Fill in the description: what
   changed, why, and how you verified it. Link the issue it closes.
5. **Automated checks** must pass. Continuous integration runs:
   - a **secrets scan** (gitleaks) that blocks any leaked credential, and
   - **build & test** against PostgreSQL and Redis service containers.
6. Address review feedback and resolve all conversations. At least one maintainer
   approval is required before merge.
7. Maintainers merge (squash) once green and approved.

### License of contributions

By contributing, you agree that your contributions are licensed under the
project's [Apache License 2.0](./LICENSE) (the SDKs are published under MIT — see
each package's own `LICENSE`).

---

## Reporting security issues

Do **not** open a public issue for a vulnerability. Follow the private disclosure
process in [SECURITY.md](./SECURITY.md).
