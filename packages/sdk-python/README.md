# Veltrix Python SDK

The official Python SDK for the [Veltrix](https://github.com/captivatortechnologies/veltrix-community)
API — an open-source **Security-as-Code** platform.

It is a thin, dependency-light (`requests`-based) client that mirrors the
TypeScript SDK (`@veltrix/sdk`). The base URL is fully configurable, so it works
against any self-hosted Veltrix Community Edition server.

## Installation

```bash
pip install veltrix-sdk
```

Install from source (this repository):

```bash
pip install "git+https://github.com/captivatortechnologies/veltrix-community.git#subdirectory=packages/sdk-python"
```

Requires Python 3.9+.

## Getting started

Initialize the client with an API key or a JWT token. Point `base_url` at your
server (it defaults to `http://localhost:5000/api`):

```python
from veltrix_sdk import VeltrixClient

# Using an API key
client = VeltrixClient(api_key="YOUR_API_KEY", base_url="http://localhost:5000/api")

# Or using a JWT token
# client = VeltrixClient(jwt_token="YOUR_JWT_TOKEN", base_url="http://localhost:5000/api")
```

Then call the resources exposed on the client:

```python
from veltrix_sdk import VeltrixError

# Read the (single-tenant) organization details
try:
    org = client.organization.get()
    print(f"Organization: {org['name']}")
except VeltrixError as e:
    print(f"Error fetching organization: {e}")

# List roles (RBAC)
for role in client.roles.list():
    print(f"- {role['name']}")

# Create a tag
tag = client.tags.create(name="Critical", color="#FF0000", description="Critical assets")
print(f"Created tag {tag['id']}")
```

### Authentication

You can pass credentials at construction time or update them later:

```python
client = VeltrixClient(base_url="http://localhost:5000/api")

# Log in with email/password to obtain a JWT, then use it for subsequent calls
result = client.auth.login(email="admin@example.com", password="…")
client.set_jwt_token(result["token"])

# Or switch to an API key
client.set_api_key("YOUR_API_KEY")
```

### Error handling

All errors derive from `VeltrixError`. HTTP status codes map to specific
subclasses:

| Exception              | Trigger                     |
| ---------------------- | --------------------------- |
| `BadRequestError`      | HTTP 400                    |
| `AuthenticationError`  | HTTP 401                    |
| `PermissionError`      | HTTP 403                    |
| `NotFoundError`        | HTTP 404                    |
| `RateLimitError`       | HTTP 429                    |
| `ServerError`          | HTTP 5xx                    |
| `APIError`             | other non-2xx responses     |
| `VeltrixError`         | network/timeout + base class|

```python
from veltrix_sdk import NotFoundError, VeltrixError

try:
    client.components.get("does-not-exist")
except NotFoundError:
    print("Component not found")
except VeltrixError as e:
    print(f"Request failed: {e} (status={e.http_status})")
```

## Available resources

| Accessor                        | Description                                             |
| ------------------------------- | ------------------------------------------------------- |
| `client.auth`                   | Authentication (login, register, change password, API-key checks) |
| `client.me`                     | Current user's resolved permission snapshot            |
| `client.profile`                | Current user profile and settings                      |
| `client.organization`           | Organization details (single-tenant)                   |
| `client.users`                  | User management (admin)                                 |
| `client.roles`                  | Roles & permissions (RBAC)                             |
| `client.api_keys`               | API-key management                                      |
| `client.tools`                  | Security tool inventory                                 |
| `client.customer_tools`         | Per-tenant tool enablement                              |
| `client.components`             | Components                                              |
| `client.credentials`            | Credentials                                             |
| `client.tags`                   | Tags                                                    |
| `client.environments`           | Deployment environments (list / create / update / delete + per-environment policy) |
| `client.connectivity`           | Component connectivity                                  |
| `client.connectivity_providers` | Connectivity provider adapters (SSH / WireGuard / Tailscale) |
| `client.tailscale`              | Tailscale devices and keys                              |
| `client.tailscale_config`       | Tailscale tenant configuration                          |
| `client.log_forwarding`         | Log-forwarding destinations                             |
| `client.log_entries`            | Platform log entries                                    |
| `client.reports`                | Tenant reports (audit-logs / user-activity / resource-usage / security-overview / compliance) |
| `client.configuration_canvas`   | Configuration authoring canvas (CRUD, versions, approvals, review comments) |
| `client.configuration_history`  | Configuration audit history (filters, pending approvals, approve / reject / revert) |
| `client.pipeline`               | Deployment pipeline (validate / deploy canvases, deployment lifecycle, drift) |
| `client.apps`                   | Platform apps / app engine (marketplace, install, enable, settings, operations) |
| `client.sandboxes`              | Developer sandboxes — CLI dev mode (flag-gated, off by default) |
| `client.webhooks`               | Inbound webhook ingress (generic / GitHub / health)    |
| `client.brand`                  | Public branding (name / tagline / logo)                |
| `client.feature_flags`          | Public feature flags                                    |
| `client.cognito`                | Optional AWS Cognito SSO integration (disabled by default) |

> Each resource's methods are wired to the Community Edition server's actual
> routes (verb, path, params and body). A few operational notes:
>
> - `sandboxes` is gated behind the `platform.sandbox` feature flag, which is
>   **off by default** — every sandbox route returns `404` until an operator
>   enables it. Its two binary-transport routes (the client bundle and the
>   `tar.gz` file-sync upload) are intentionally not wrapped.
> - `connectivity_providers` routes require server-side admin privileges.
> - `apps` binary multipart upload (`POST /api/apps/upload`) is not wrapped;
>   use `install_from_url` or `install` instead.
> - Optional SSO providers other than Cognito (Google / Microsoft / generic
>   OIDC) are browser-redirect OAuth flows on the server and are not exposed as
>   SDK resources.

## Development

```bash
pip install -e ".[test]"
pytest
```

## License

Released under the [MIT License](./LICENSE).
