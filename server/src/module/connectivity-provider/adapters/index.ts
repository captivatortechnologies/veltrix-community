import { ConnectivityAdapter } from './types';
import { TailscaleAdapter } from './tailscale.adapter';
import { SshAdapter } from './ssh.adapter';
import { WireguardAdapter } from './wireguard.adapter';
import { CloudflareTunnelAdapter } from './cloudflare-tunnel.adapter';
import { ZerotierAdapter } from './zerotier.adapter';
import { NebulaAdapter } from './nebula.adapter';
import { OpenvpnAdapter } from './openvpn.adapter';
import { AwsSsmAdapter } from './aws-ssm.adapter';
import { HashicorpBoundaryAdapter } from './hashicorp-boundary.adapter';
import { PROVIDER_TYPES, ProviderType } from '../connectivity-provider.schema';

// Registry mapping each providerType string to a singleton adapter instance
const adapterRegistry: Record<ProviderType, ConnectivityAdapter> = {
  tailscale: new TailscaleAdapter(),
  ssh: new SshAdapter(),
  wireguard: new WireguardAdapter(),
  cloudflare_tunnel: new CloudflareTunnelAdapter(),
  zerotier: new ZerotierAdapter(),
  nebula: new NebulaAdapter(),
  openvpn: new OpenvpnAdapter(),
  aws_ssm: new AwsSsmAdapter(),
  hashicorp_boundary: new HashicorpBoundaryAdapter()
};

/**
 * Retrieve the adapter for a given providerType.
 * Throws if the providerType is not registered — callers should validate
 * providerType against PROVIDER_TYPES before calling this.
 */
export function getAdapter(providerType: string): ConnectivityAdapter {
  if (!PROVIDER_TYPES.includes(providerType as ProviderType)) {
    throw new Error(`Unknown provider type: ${providerType}`);
  }

  return adapterRegistry[providerType as ProviderType];
}

export { ConnectivityAdapter, PROVIDER_TYPES };
