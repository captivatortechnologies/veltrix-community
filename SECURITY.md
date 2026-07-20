# Security Policy

The Veltrix Community Edition is security tooling, so we take the security of the
project itself seriously. Thank you for helping keep it and its users safe.

---

## Supported versions

Veltrix Community Edition is in early, pre-1.0 development. Security fixes are
applied to the latest released minor version and to `main`.

| Version | Supported |
|---|---|
| `0.1.x` (latest) | Yes |
| Older `0.x` pre-releases | No — please upgrade |

Once the project reaches 1.0, this table will be updated with a formal support
window.

---

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Report privately using GitHub's coordinated disclosure workflow:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** (Private Vulnerability Reporting).
3. Provide as much detail as you can:
   - the affected component and version / commit,
   - a description of the issue and its impact,
   - step-by-step reproduction or a proof of concept,
   - any suggested remediation.

If Private Vulnerability Reporting is unavailable to you, open a minimal issue
that says only "security contact requested" (with no details) and a maintainer
will provide a private channel.

### What to expect

- **Acknowledgement:** we aim to acknowledge a report within 3 business days.
- **Assessment:** we will investigate, confirm the issue, and keep you updated on
  progress.
- **Fix and disclosure:** we practice coordinated disclosure. We will work with
  you on a fix and a disclosure timeline, and credit you in the advisory unless
  you prefer to remain anonymous. Please give us reasonable time to release a fix
  before any public disclosure.

We ask that you act in good faith, avoid privacy violations and service
disruption, and only interact with systems and data you own or are explicitly
permitted to test.

---

## The secrets gate

This repository enforces an automated secrets gate to make sure no credential
ever lands in the public history.

- **Tooling:** [gitleaks](https://github.com/gitleaks/gitleaks), configured by
  `.gitleaks.toml`. It extends the default rule set with additional deny-rules
  for identifiers that must never appear in this tree (legacy service keys,
  private infrastructure identifiers, private registry references, and similar).
- **In continuous integration:** every push and pull request runs a
  `secrets-scan` job (see `.github/workflows/ci.yml`). A finding fails the build
  and blocks merge.
- **Locally (recommended):** run the same scan before you commit, or wire it as a
  pre-commit hook:

  ```bash
  pnpm secrets:scan
  # equivalent to: gitleaks detect --no-git --redact -c .gitleaks.toml --source .
  ```

If the gate ever flags a **real** secret that was committed, treat it as
compromised: rotate the credential immediately, then remove it from history.

---

## Secure-by-default runtime

A few defaults exist specifically to reduce the chance of an insecure deployment:

- **Fail-fast secrets.** The server refuses to start if the required secrets
  (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `COOKIE_SECRET`) are
  unset. There are no public fallback values. Generate strong, unique values per
  environment (`openssl rand -hex 32`).
- **No default admin password.** The first-run administrator is created from
  `VELTRIX_ADMIN_EMAIL`. If `VELTRIX_ADMIN_PASSWORD` is left blank, a random
  password is generated and printed **once** to the server log; change it on first
  login.
- **Encrypted credentials at rest.** Integration credentials are encrypted with
  AES-256 using `ENCRYPTION_KEY`.
- **Local auth by default.** Authentication is local (bcrypt + JWT) out of the
  box. OAuth/OIDC providers are optional and disabled by default.
- **`.env` is never committed.** `.gitignore` excludes `.env` and related secret
  files; only `.env.example` (placeholders only) is tracked.

See [docs/CONFIGURATION.md](./docs/CONFIGURATION.md) for the full list of
environment variables and their security implications, and
[docs/SECRETS.md](./docs/SECRETS.md) for how the two secret layers (boot-time
environment secrets vs. UI-managed secrets encrypted at rest) fit together.
