// NOTE: this controller is currently unregistered — no route in server.ts
// wires it up. It ships with in-memory mock data as a reference
// implementation for a future firewall-rules feature (e.g. for the
// connectivity-provider slice). Safe to keep (no external coupling, no
// secrets) or delete; kept here for parity with the source layout.

import { v4 as uuidv4 } from 'uuid';

// Define types for firewall rules
type FirewallDirection = 'INBOUND' | 'OUTBOUND';
type FirewallInterfaceType = 'HEC' | 'SEARCH_HEAD_API' | 'HEAVY_FORWARDER' | 'SEARCH_HEAD' | 'INDEXER' | 'ALL';

interface FirewallRule {
  id: string;
  infrastructureId: string;
  subnet: string;
  port: string;
  direction: FirewallDirection;
  interfaceType: FirewallInterfaceType;
  description: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FirewallRuleCreateData {
  subnet: string;
  port: string;
  direction: FirewallDirection;
  interfaceType: FirewallInterfaceType;
  description: string;
  isEnabled: boolean;
}

interface FirewallRuleUpdateData extends Partial<FirewallRuleCreateData> {}

export const firewallRulesController = {
  async getFirewallRules(infrastructureId: string) {
    try {
      // Reference implementation — returns mock data.
      return getMockFirewallRules();
    } catch (error) {
      console.error('Error fetching firewall rules:', error);
      throw new Error('Failed to fetch firewall rules');
    }
  },

  async getFirewallRule(infrastructureId: string, ruleId: string) {
    try {
      const mockRules = getMockFirewallRules();
      const rule = mockRules.find(r => r.id === ruleId);
      if (!rule) {
        throw new Error('Firewall rule not found');
      }
      return rule;
    } catch (error) {
      console.error(`Error fetching firewall rule ${ruleId}:`, error);
      throw new Error('Failed to fetch firewall rule');
    }
  },

  async createFirewallRule(infrastructureId: string, data: FirewallRuleCreateData) {
    try {
      return createMockFirewallRule(infrastructureId, data);
    } catch (error) {
      console.error('Error creating firewall rule:', error);
      throw new Error('Failed to create firewall rule');
    }
  },

  async updateFirewallRule(infrastructureId: string, ruleId: string, data: FirewallRuleUpdateData) {
    try {
      return updateMockFirewallRule(infrastructureId, ruleId, data);
    } catch (error) {
      console.error(`Error updating firewall rule ${ruleId}:`, error);
      throw new Error('Failed to update firewall rule');
    }
  },

  async toggleFirewallRule(infrastructureId: string, ruleId: string, isEnabled: boolean) {
    try {
      return toggleMockFirewallRule(infrastructureId, ruleId, isEnabled);
    } catch (error) {
      console.error(`Error toggling firewall rule ${ruleId}:`, error);
      throw new Error('Failed to toggle firewall rule');
    }
  },

  async deleteFirewallRule(infrastructureId: string, ruleId: string) {
    try {
      return deleteMockFirewallRule(infrastructureId, ruleId);
    } catch (error) {
      console.error(`Error deleting firewall rule ${ruleId}:`, error);
      throw new Error('Failed to delete firewall rule');
    }
  }
};

// Mock data and helper functions for development
let mockFirewallRules: FirewallRule[] = [
  {
    id: 'fr-1',
    infrastructureId: '07ffa030-b734-456d-954c-c8d3e7c281c0',
    subnet: '10.0.0.0/24',
    port: '8000',
    direction: 'INBOUND' as const,
    interfaceType: 'SEARCH_HEAD' as const,
    description: 'Allow web UI access from corporate network',
    isEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'fr-2',
    infrastructureId: '07ffa030-b734-456d-954c-c8d3e7c281c0',
    subnet: '10.0.0.0/24',
    port: '8089',
    direction: 'INBOUND' as const,
    interfaceType: 'SEARCH_HEAD_API' as const,
    description: 'Allow management API access from corporate network',
    isEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'fr-3',
    infrastructureId: '07ffa030-b734-456d-954c-c8d3e7c281c0',
    subnet: '10.0.0.0/24',
    port: '8088',
    direction: 'INBOUND' as const,
    interfaceType: 'HEC' as const,
    description: 'Allow HTTP event collector access from corporate network',
    isEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'fr-4',
    infrastructureId: '07ffa030-b734-456d-954c-c8d3e7c281c0',
    subnet: '0.0.0.0/0',
    port: '80,443',
    direction: 'OUTBOUND' as const,
    interfaceType: 'ALL' as const,
    description: 'Allow HTTP/HTTPS outbound traffic',
    isEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

function getMockFirewallRules() {
  return [...mockFirewallRules];
}

function createMockFirewallRule(infrastructureId: string, data: FirewallRuleCreateData): FirewallRule {
  const newRule = {
    id: uuidv4(),
    infrastructureId,
    subnet: data.subnet,
    port: data.port,
    direction: data.direction,
    interfaceType: data.interfaceType,
    description: data.description,
    isEnabled: data.isEnabled,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  mockFirewallRules.push(newRule);
  return newRule;
}

function updateMockFirewallRule(infrastructureId: string, ruleId: string, data: FirewallRuleUpdateData): FirewallRule {
  const index = mockFirewallRules.findIndex(rule => rule.id === ruleId);

  if (index === -1) {
    throw new Error('Firewall rule not found');
  }

  // Create a new rule object with only the fields we want to update
  const updatedRule: FirewallRule = { ...mockFirewallRules[index] };

  // Update only the fields that are provided
  if (data.subnet !== undefined) updatedRule.subnet = data.subnet;
  if (data.port !== undefined) updatedRule.port = data.port;
  if (data.direction !== undefined) updatedRule.direction = data.direction;
  if (data.interfaceType !== undefined) updatedRule.interfaceType = data.interfaceType;
  if (data.description !== undefined) updatedRule.description = data.description;
  if (data.isEnabled !== undefined) updatedRule.isEnabled = data.isEnabled;

  // Always update the timestamp
  updatedRule.updatedAt = new Date().toISOString();

  mockFirewallRules[index] = updatedRule;
  return updatedRule;
}

function toggleMockFirewallRule(infrastructureId: string, ruleId: string, isEnabled: boolean): FirewallRule {
  const index = mockFirewallRules.findIndex(rule => rule.id === ruleId);

  if (index === -1) {
    throw new Error('Firewall rule not found');
  }

  const updatedRule: FirewallRule = {
    ...mockFirewallRules[index],
    isEnabled,
    updatedAt: new Date().toISOString()
  };

  mockFirewallRules[index] = updatedRule;
  return updatedRule;
}

function deleteMockFirewallRule(infrastructureId: string, ruleId: string) {
  const index = mockFirewallRules.findIndex(rule => rule.id === ruleId);

  if (index === -1) {
    throw new Error('Firewall rule not found');
  }

  mockFirewallRules.splice(index, 1);
  return true;
}
