import type { ProviderType } from '@/services/connectivityProviderApi'

// ---------------------------------------------------------------------------
// Field + Schema types
// ---------------------------------------------------------------------------

export interface ProviderFieldDefinition {
  name: string
  label: string
  type: 'text' | 'password' | 'textarea' | 'number' | 'select'
  placeholder?: string
  required?: boolean
  helpText?: string
  options?: { value: string; label: string }[]
}

export type ProviderCategory = 'mesh-vpn' | 'zero-trust' | 'traditional' | 'cloud-native'

export interface ProviderSchema {
  providerType: ProviderType
  displayName: string
  shortDescription: string
  description: string
  icon: string       // emoji for now — can swap for component refs later
  category: ProviderCategory
  fields: ProviderFieldDefinition[]
}

// ---------------------------------------------------------------------------
// Category metadata (for grouping in the UI)
// ---------------------------------------------------------------------------

export const PROVIDER_CATEGORIES: Record<ProviderCategory, { label: string; description: string }> = {
  'mesh-vpn': { label: 'Mesh VPN', description: 'Peer-to-peer encrypted overlay networks' },
  'zero-trust': { label: 'Zero Trust', description: 'Identity-based access without VPN' },
  'traditional': { label: 'Traditional', description: 'SSH and VPN-based access' },
  'cloud-native': { label: 'Cloud Native', description: 'Cloud provider session management' },
}

// ---------------------------------------------------------------------------
// Provider schemas — one per provider type
// ---------------------------------------------------------------------------

const tailscaleSchema: ProviderSchema = {
  providerType: 'tailscale',
  displayName: 'Tailscale',
  shortDescription: 'Zero trust mesh VPN',
  description: 'Authenticate via Tailscale API to reach devices on your tailnet. Requires an API key with device read access.',
  icon: '🔗',
  category: 'mesh-vpn',
  fields: [
    { name: 'tailnet', label: 'Tailnet Name', type: 'text', required: true, placeholder: 'your-org.ts.net', helpText: 'Your Tailscale tailnet domain (e.g. example.ts.net or org-name)' },
    { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'tskey-api-...', helpText: 'Tailscale API key with device read permissions' },
    { name: 'apiUrl', label: 'API URL', type: 'text', required: false, placeholder: 'https://api.tailscale.com/api/v2', helpText: 'Override for self-hosted Headscale instances' },
  ],
}

const sshSchema: ProviderSchema = {
  providerType: 'ssh',
  displayName: 'SSH Keys',
  shortDescription: 'Direct SSH access',
  description: 'Authenticate to remote devices using SSH key pairs. Supports jump hosts for bastion-based access.',
  icon: '🔑',
  category: 'traditional',
  fields: [
    { name: 'username', label: 'Username', type: 'text', required: true, placeholder: 'splunk-admin', helpText: 'SSH username on target devices' },
    { name: 'privateKey', label: 'Private Key', type: 'textarea', required: true, placeholder: '-----BEGIN OPENSSH PRIVATE KEY-----\n...', helpText: 'PEM-encoded private key (RSA, Ed25519, or ECDSA)' },
    { name: 'passphrase', label: 'Key Passphrase', type: 'password', required: false, helpText: 'Passphrase if the private key is encrypted' },
    { name: 'port', label: 'SSH Port', type: 'number', required: false, placeholder: '22', helpText: 'Default: 22' },
    { name: 'jumpHost', label: 'Jump Host', type: 'text', required: false, placeholder: 'bastion.example.com', helpText: 'Bastion/jump host for ProxyJump (optional)' },
    { name: 'jumpPort', label: 'Jump Host Port', type: 'number', required: false, placeholder: '22' },
    { name: 'jumpUsername', label: 'Jump Host Username', type: 'text', required: false, placeholder: 'jump-user' },
  ],
}

const wireguardSchema: ProviderSchema = {
  providerType: 'wireguard',
  displayName: 'WireGuard',
  shortDescription: 'Modern kernel-level VPN',
  description: 'Authenticate and tunnel through a WireGuard VPN to reach remote Splunk infrastructure.',
  icon: '🛡️',
  category: 'mesh-vpn',
  fields: [
    { name: 'privateKey', label: 'Private Key', type: 'password', required: true, placeholder: 'Base64-encoded private key', helpText: 'WireGuard interface private key' },
    { name: 'publicKey', label: 'Peer Public Key', type: 'text', required: true, placeholder: 'Base64-encoded public key', helpText: 'Public key of the WireGuard peer/server' },
    { name: 'endpoint', label: 'Endpoint', type: 'text', required: true, placeholder: 'vpn.example.com:51820', helpText: 'Peer endpoint (host:port)' },
    { name: 'allowedIPs', label: 'Allowed IPs', type: 'text', required: true, placeholder: '10.0.0.0/24, 192.168.1.0/24', helpText: 'Comma-separated CIDR ranges to route through the tunnel' },
    { name: 'dns', label: 'DNS Servers', type: 'text', required: false, placeholder: '10.0.0.1', helpText: 'DNS server(s) for name resolution inside the tunnel' },
    { name: 'presharedKey', label: 'Preshared Key', type: 'password', required: false, helpText: 'Optional additional symmetric key for post-quantum resistance' },
  ],
}

const cloudflareTunnelSchema: ProviderSchema = {
  providerType: 'cloudflare_tunnel',
  displayName: 'Cloudflare Tunnel',
  shortDescription: 'Zero trust access via cloudflared',
  description: 'Access remote infrastructure through Cloudflare Tunnel (cloudflared). No inbound ports required on target networks.',
  icon: '☁️',
  category: 'zero-trust',
  fields: [
    { name: 'tunnelToken', label: 'Tunnel Token', type: 'password', required: true, placeholder: 'eyJh...', helpText: 'Connector install token from Cloudflare dashboard' },
    { name: 'accountId', label: 'Account ID', type: 'text', required: true, placeholder: 'Cloudflare account ID', helpText: 'Found in Cloudflare dashboard under Account Home' },
    { name: 'tunnelId', label: 'Tunnel ID', type: 'text', required: false, placeholder: 'UUID', helpText: 'Specific tunnel ID (auto-detected if not set)' },
    { name: 'apiToken', label: 'API Token', type: 'password', required: false, helpText: 'Cloudflare API token for tunnel management (optional)' },
  ],
}

const zerotierSchema: ProviderSchema = {
  providerType: 'zerotier',
  displayName: 'ZeroTier',
  shortDescription: 'Software-defined networking',
  description: 'Access devices on a ZeroTier virtual network. Requires a ZeroTier Central API token for device management.',
  icon: '🌐',
  category: 'mesh-vpn',
  fields: [
    { name: 'networkId', label: 'Network ID', type: 'text', required: true, placeholder: '16-character hex ID', helpText: 'ZeroTier network ID to join' },
    { name: 'apiToken', label: 'API Token', type: 'password', required: true, placeholder: 'ZeroTier Central API token', helpText: 'Token from my.zerotier.com for network/member management' },
    { name: 'nodeId', label: 'Node ID', type: 'text', required: false, placeholder: '10-character hex ID', helpText: 'This platform node\'s ZeroTier address (auto-detected if running)' },
  ],
}

const nebulaSchema: ProviderSchema = {
  providerType: 'nebula',
  displayName: 'Nebula',
  shortDescription: 'Overlay mesh networking',
  description: 'Connect through a Nebula overlay network (by Defined Networking / Slack). Certificate-based mutual authentication.',
  icon: '🌀',
  category: 'mesh-vpn',
  fields: [
    { name: 'caCert', label: 'CA Certificate', type: 'textarea', required: true, placeholder: '-----BEGIN NEBULA CERTIFICATE-----\n...', helpText: 'Nebula CA certificate (ca.crt)' },
    { name: 'nodeCert', label: 'Node Certificate', type: 'textarea', required: true, placeholder: '-----BEGIN NEBULA CERTIFICATE-----\n...', helpText: 'This node\'s signed certificate (host.crt)' },
    { name: 'nodeKey', label: 'Node Key', type: 'password', required: true, placeholder: '-----BEGIN NEBULA X25519 PRIVATE KEY-----\n...', helpText: 'This node\'s private key (host.key)' },
    { name: 'lighthouseHost', label: 'Lighthouse Host', type: 'text', required: true, placeholder: '203.0.113.1', helpText: 'Public IP or hostname of a Nebula lighthouse' },
    { name: 'lighthousePort', label: 'Lighthouse Port', type: 'number', required: false, placeholder: '4242', helpText: 'Default: 4242' },
    { name: 'lighthouseNebulaIP', label: 'Lighthouse Nebula IP', type: 'text', required: true, placeholder: '10.128.0.1', helpText: 'The lighthouse\'s Nebula overlay IP' },
  ],
}

const openvpnSchema: ProviderSchema = {
  providerType: 'openvpn',
  displayName: 'OpenVPN',
  shortDescription: 'Industry-standard VPN',
  description: 'Establish a VPN tunnel to the target network using OpenVPN. Supports certificate and credential-based authentication.',
  icon: '🔒',
  category: 'traditional',
  fields: [
    { name: 'serverAddress', label: 'Server Address', type: 'text', required: true, placeholder: 'vpn.example.com', helpText: 'OpenVPN server hostname or IP' },
    { name: 'port', label: 'Port', type: 'number', required: false, placeholder: '1194', helpText: 'Default: 1194' },
    { name: 'protocol', label: 'Protocol', type: 'select', required: false, options: [{ value: 'udp', label: 'UDP' }, { value: 'tcp', label: 'TCP' }], helpText: 'Default: UDP' },
    { name: 'caCert', label: 'CA Certificate', type: 'textarea', required: true, placeholder: '-----BEGIN CERTIFICATE-----\n...', helpText: 'Server CA certificate (ca.crt)' },
    { name: 'clientCert', label: 'Client Certificate', type: 'textarea', required: false, placeholder: '-----BEGIN CERTIFICATE-----\n...', helpText: 'Client certificate if using certificate auth' },
    { name: 'clientKey', label: 'Client Key', type: 'password', required: false, placeholder: '-----BEGIN PRIVATE KEY-----\n...', helpText: 'Client private key' },
    { name: 'tlsAuthKey', label: 'TLS Auth Key', type: 'password', required: false, helpText: 'HMAC firewall key (ta.key) if required by server' },
    { name: 'username', label: 'Username', type: 'text', required: false, helpText: 'For username/password authentication' },
    { name: 'password', label: 'Password', type: 'password', required: false, helpText: 'For username/password authentication' },
  ],
}

const awsSsmSchema: ProviderSchema = {
  providerType: 'aws_ssm',
  displayName: 'AWS Systems Manager',
  shortDescription: 'Session Manager for AWS instances',
  description: 'Access AWS-hosted instances via SSM Session Manager. No SSH ports or bastion hosts required.',
  icon: '☁️',
  category: 'cloud-native',
  fields: [
    { name: 'region', label: 'AWS Region', type: 'select', required: true, options: [
      { value: 'us-east-1', label: 'US East (N. Virginia)' },
      { value: 'us-east-2', label: 'US East (Ohio)' },
      { value: 'us-west-1', label: 'US West (N. California)' },
      { value: 'us-west-2', label: 'US West (Oregon)' },
      { value: 'eu-west-1', label: 'EU (Ireland)' },
      { value: 'eu-west-2', label: 'EU (London)' },
      { value: 'eu-central-1', label: 'EU (Frankfurt)' },
      { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
      { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
      { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
    ], helpText: 'AWS region where your instances reside' },
    { name: 'accessKeyId', label: 'Access Key ID', type: 'text', required: true, placeholder: 'AKIA...', helpText: 'IAM access key with ssm:StartSession permissions' },
    { name: 'secretAccessKey', label: 'Secret Access Key', type: 'password', required: true, helpText: 'IAM secret access key' },
    { name: 'sessionToken', label: 'Session Token', type: 'password', required: false, helpText: 'Temporary credentials session token (for assumed roles)' },
    { name: 'roleArn', label: 'Assume Role ARN', type: 'text', required: false, placeholder: 'arn:aws:iam::123456789012:role/SSMAccess', helpText: 'ARN of IAM role to assume (optional)' },
  ],
}

const hashicorpBoundarySchema: ProviderSchema = {
  providerType: 'hashicorp_boundary',
  displayName: 'HashiCorp Boundary',
  shortDescription: 'Identity-based access',
  description: 'Access infrastructure through HashiCorp Boundary using identity-based authorization. No direct network access required.',
  icon: '⬡',
  category: 'zero-trust',
  fields: [
    { name: 'boundaryAddr', label: 'Boundary Address', type: 'text', required: true, placeholder: 'https://boundary.example.com:9200', helpText: 'Boundary controller URL' },
    { name: 'authMethodId', label: 'Auth Method ID', type: 'text', required: true, placeholder: 'ampw_...', helpText: 'Authentication method ID' },
    { name: 'loginName', label: 'Login Name', type: 'text', required: true, placeholder: 'admin', helpText: 'Username for password auth method' },
    { name: 'password', label: 'Password', type: 'password', required: true, helpText: 'Password for authentication' },
    { name: 'scopeId', label: 'Scope ID', type: 'text', required: false, placeholder: 'o_...', helpText: 'Organization or project scope ID (optional)' },
    { name: 'token', label: 'Auth Token', type: 'password', required: false, helpText: 'Pre-generated auth token (alternative to login name/password)' },
  ],
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const PROVIDER_SCHEMAS: Record<ProviderType, ProviderSchema> = {
  tailscale: tailscaleSchema,
  ssh: sshSchema,
  wireguard: wireguardSchema,
  cloudflare_tunnel: cloudflareTunnelSchema,
  zerotier: zerotierSchema,
  nebula: nebulaSchema,
  openvpn: openvpnSchema,
  aws_ssm: awsSsmSchema,
  hashicorp_boundary: hashicorpBoundarySchema,
}

/** Get all provider schemas as an ordered array (grouped by category) */
export function getProviderSchemaList(): ProviderSchema[] {
  const order: ProviderCategory[] = ['mesh-vpn', 'zero-trust', 'traditional', 'cloud-native']
  return Object.values(PROVIDER_SCHEMAS).sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category)
  )
}
