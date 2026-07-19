# @veltrix/sdk

Official JavaScript / TypeScript SDK for the [Veltrix Community Edition](https://github.com/captivatortechnologies/veltrix-community) API — a self-hosted, open-source Security-as-Code platform.

It is a thin, typed wrapper around the platform REST API built on [axios](https://axios-http.com/). It works in Node.js (>= 20) and modern browsers/bundlers, and ships as an ES module with bundled TypeScript declarations.

## Installation

```bash
npm install @veltrix/sdk
# or
pnpm add @veltrix/sdk
# or
yarn add @veltrix/sdk
```

## Quick start

```ts
import { VeltrixClient } from '@veltrix/sdk';

// Point at your self-hosted server. Defaults to http://localhost:5000/api.
const client = new VeltrixClient({
  baseURL: 'http://localhost:5000/api',
  // Authenticate with either an API key or a JWT (not both):
  apiKey: process.env.VELTRIX_API_KEY,
  // jwtToken: '<jwt>',
});

// Log in with local credentials and use the returned JWT:
const { token, user } = await client.auth.login({
  email: 'admin@example.com',
  password: 'change-me',
});

const authed = new VeltrixClient({ jwtToken: token });

const tools = await authed.tools.list();
const roles = await authed.roles.list();
```

## Configuration

The client is configured entirely through its constructor — no hosted URLs, keys, or
tokens are baked in.

```ts
new VeltrixClient({
  apiKey?: string;     // sent as `Authorization: ApiKey <key>`
  jwtToken?: string;   // sent as `Authorization: Bearer <jwt>`
  customerId?: string; // sent as `X-Customer-ID` header (organization scoping)
  baseURL?: string;    // API base URL
  timeout?: number;    // request timeout in ms (default 60000)
});
```

### Base URL resolution

When `baseURL` is omitted, it is resolved in this order:

1. The `baseURL` constructor option, if provided.
2. The `VELTRIX_API_URL` environment variable (Node.js only).
3. The default `http://localhost:5000/api`.

```ts
// Uses VELTRIX_API_URL if set, otherwise http://localhost:5000/api
const client = new VeltrixClient();
```

You can update the organization scope after construction:

```ts
client.setCustomerId('org-uuid');
```

## Resources

Each resource is exposed as a property on the client:

| Property | Description |
| --- | --- |
| `auth` | Login, register, change password, API-key auth checks |
| `profile` | Current user profile and settings |
| `organization` | Organization details (get / update) |
| `users` | User administration (RBAC) |
| `roles` | Roles, permissions, and available resource/actions (RBAC) |
| `apiKeys` | API key lifecycle (create, rotate, revoke) |
| `tools` | Security tool inventory |
| `components` | Tool components |
| `credentials` | Encrypted credentials for tools |
| `tags` | Tags |
| `connectivity` | Component connectivity (SSH / HTTPS / Tailscale) |
| `tailscale` | Tailscale devices and keys |
| `tailscaleConfig` | Tailscale tenant configuration |
| `logForwarding` | Log-forwarding destinations |
| `logEntries` | Platform log entries |
| `webhooks` | Inbound webhook ingress (generic / GitHub / health) |
| `cognito` | Optional AWS Cognito SSO integration (disabled by default) |

## Error handling

Failed requests throw typed errors that extend `VeltrixError`. Catch the base class,
or a specific subclass, and inspect `httpStatus`, `code`, `requestId`, and `errorData`.

```ts
import {
  VeltrixClient,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  VeltrixError,
} from '@veltrix/sdk';

try {
  await client.tools.get('missing-id');
} catch (err) {
  if (err instanceof NotFoundError) {
    // 404
  } else if (err instanceof AuthenticationError) {
    // 401
  } else if (err instanceof RateLimitError) {
    // 429
  } else if (err instanceof VeltrixError) {
    console.error(err.httpStatus, err.message, err.requestId);
  }
}
```

Available error classes: `VeltrixError` (base), `APIError`, `AuthenticationError`,
`PermissionError`, `NotFoundError`, `RateLimitError`, `BadRequestError`, `ServerError`,
`RequestError`.

## Development

```bash
pnpm install
pnpm --filter @veltrix/sdk build      # compile to dist/
pnpm --filter @veltrix/sdk typecheck  # type-check only
pnpm --filter @veltrix/sdk test       # run tests
```

## License

[MIT](./LICENSE) © Veltrix Community contributors
