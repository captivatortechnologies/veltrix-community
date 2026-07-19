import React, { useState, useEffect, useCallback } from 'react';
import { tailscaleApi } from './api';
import { Copy } from 'lucide-react';

// Get API URL from environment variable
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface TailscaleConnectivityProps {
  componentId: string | number | (string | number)[] | null;
  componentName: string | string[];
  componentType: string | string[];
  hostname: string | string[];
  port: string | string[];
  tailscaleDeviceId?: string | null; // Add tailscaleDeviceId prop
  onClose?: () => void;
}

interface ComponentInfo {
  id: string;
  name: string;
  type: string;
  hostname: string;
  port: string;
}

interface Connectivity {
  id: string;
  componentId: string;
  status: string;
  sshCommand: string | null;
  httpsUrl: string | null;
  tailscaleKey: string | null;
  tailscaleDeviceId?: string | null;
  createdAt: string;
  updatedAt: string;
  installCommands?: string;
}

// Device data interface is handled internally by the API

// Helper function to get customerId from localStorage
const getCustomerId = (): string | null => {
  try {
    // First try to get customerId directly
    const directCustomerId = localStorage.getItem('customerId');
    if (directCustomerId) {
      return directCustomerId;
    }
    
    // If not found, try to extract from user object
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user && user.customerId) {
        return user.customerId;
      }
    }
    
    // If still not found, use default customer ID
    return "00000000-0000-0000-0000-000000000001";
  } catch (error) {
    console.error('Error getting customerId:', error);
    return null;
  }
};

const TailscaleConnectivity: React.FC<TailscaleConnectivityProps> = ({
  componentId,
  componentName,
  componentType,
  hostname,
  port,
  tailscaleDeviceId,
  onClose
}) => {
  console.log('TailscaleConnectivity props:', { componentId, componentName, componentType, hostname, port, tailscaleDeviceId });
  
  const [connectivity, setConnectivity] = useState<Connectivity | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [creatingConnection, setCreatingConnection] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // State for UI
  const [selectedComponentIndex] = useState<number>(0);
  const [components, setComponents] = useState<ComponentInfo[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'ACTIVE' | 'INACTIVE' | 'UNKNOWN'>('UNKNOWN');

  // Process component props into a consistent array format
  useEffect(() => {
    console.log('Processing component props');
    
    // Convert componentId to array of strings
    let componentIds: string[] = [];
    
    if (componentId === null) {
      componentIds = [];
    } else if (Array.isArray(componentId)) {
      componentIds = componentId.map(id => String(id));
    } else {
      componentIds = [String(componentId)];
    }
    
    console.log('Processed componentIds:', componentIds);
    
    const componentNames = Array.isArray(componentName) ? componentName : [componentName];
    const componentTypes = Array.isArray(componentType) ? componentType : [componentType];
    const hostnames = Array.isArray(hostname) ? hostname : [hostname];
    const ports = Array.isArray(port) ? port : [port];
    
    // Make sure we have at least one component
    if (componentIds.length === 0 && componentNames.length > 0) {
      componentIds = [`temp-${componentNames[0]}`];
      console.log('Created fallback component ID:', componentIds);
    }
    
    const componentsArray: ComponentInfo[] = componentIds.map((id, index) => ({
      id,
      name: componentNames[index] || componentNames[0] || '',
      type: componentTypes[index] || componentTypes[0] || '',
      hostname: hostnames[index] || hostnames[0] || '',
      port: ports[index] || ports[0] || ''
    }));
    
    console.log('Processed components:', componentsArray);
    setComponents(componentsArray);
  }, [componentId, componentName, componentType, hostname, port]);

  // Helper function to update connectivity status
  const updateConnectivityStatus = useCallback(async (status: 'ACTIVE' | 'INACTIVE') => {
    try {
      const token = localStorage.getItem('token');
      const customerId = getCustomerId();

      if (!token || !customerId || !components[selectedComponentIndex]) {
        console.error('Missing token, customer ID, or component');
        return;
      }

      // Skip updating if the component ID is temporary
      if (components[selectedComponentIndex].id.startsWith('temp-')) {
        console.log('Skipping status update for temporary component ID');
        setConnectionStatus(status);
        return;
      }

      const updateResponse = await fetch(`${API_URL}/connectivity/component/${components[selectedComponentIndex].id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Customer-ID': customerId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status
        })
      });

      if (updateResponse.ok) {
        // Update the local state
        setConnectivity(prev => prev ? {
          ...prev,
          status
        } : null);
        setConnectionStatus(status);
      } else if (updateResponse.status === 404) {
        // If connectivity doesn't exist yet, just update the local state
        console.log('No connectivity record exists yet to update status');
        setConnectionStatus(status);
      } else {
        console.error('Failed to update connectivity status:', updateResponse.status);
      }
    } catch (error) {
      console.error('Error updating connectivity status:', error);
    }
  }, [components, selectedComponentIndex]);

  // Function to check a specific device's connectivity status - simplified version
  const checkSingleDeviceConnectivity = useCallback(async (deviceId: string) => {
    if (!deviceId) {
      console.error('No device ID provided');
      setConnectionStatus('INACTIVE');
      return;
    }

    try {
      console.log(`Checking connectivity for device ID ${deviceId}`);

      // Check if token exists
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No authentication token found');
        setError('Authentication token not found. Please log in again.');
        setConnectionStatus('INACTIVE');
        return;
      }

      console.log(`Making API call to ${API_URL}/tailscale/devices/${deviceId}`);

      // Direct API call to check the specific device using the new endpoint
      const deviceResponse = await fetch(`${API_URL}/tailscale/devices/${deviceId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Customer-ID': getCustomerId() || ''
        }
      });

      // If response is 200, there's connectivity
      if (deviceResponse.ok) {
        const deviceData = await deviceResponse.json();
        console.log(`Device ${deviceId} is connected. Full response:`, JSON.stringify(deviceData, null, 2));

        // Log specific device details that might be useful
        if (deviceData) {
          console.log(`Device details - Hostname: ${deviceData.hostname || 'N/A'}, Name: ${deviceData.name || 'N/A'}, OS: ${deviceData.os || 'N/A'}, Last Seen: ${deviceData.lastSeen || 'N/A'}`);

          if (deviceData.addresses && Array.isArray(deviceData.addresses)) {
            console.log(`Device IP addresses:`, deviceData.addresses);
          }
        }

        await updateConnectivityStatus('ACTIVE');
      } else {
        console.log(`Device ${deviceId} is not connected, status: ${deviceResponse.status}`);

        // Try to log the error response body if available
        try {
          const errorBody = await deviceResponse.text();
          console.log(`Error response body:`, errorBody);
        } catch {
          console.log('Could not read error response body');
        }

        // If API is not configured, show specific error
        if (deviceResponse.status === 404) {
          try {
            const errorData = await deviceResponse.json().catch(() => ({}));
            if (errorData && errorData.error === 'Tailscale API not configured') {
              setError('Tailscale API is not configured. Please contact your administrator.');
            } else {
              // A 404 might just mean the device isn't connected, so don't show an error
              console.log('Device not found in Tailscale, marking as inactive');
              // Don't show an error for this case - it's an expected state
              setError(null);
            }
          } catch (parseError) {
            console.log('Could not parse error response as JSON:', parseError);
            // Don't show an error, as this could be a normal scenario when a device doesn't exist yet
            setError(null);
          }
        } else if (deviceResponse.status === 401) {
          setError('Your session has expired. Please refresh the page and log in again.');
        }

        await updateConnectivityStatus('INACTIVE');
      }
    } catch (error) {
      console.error(`Error checking device connectivity for ${deviceId}:`, error);
      setError('Failed to check device connectivity. The Tailscale API may not be configured.');
      setConnectionStatus('INACTIVE');
    }
  }, [updateConnectivityStatus]);

  const fetchConnectivity = useCallback(async () => {
    if (!components.length) {
      console.log('No components available for fetching connectivity');
      return;
    }
    
    const currentComponent = components[selectedComponentIndex];
    if (!currentComponent?.id) {
      console.log('No component ID available for fetching connectivity');
      return;
    }
    
    // Skip fetching for temporary IDs
    if (currentComponent.id.startsWith('temp-')) {
      console.log('Skipping fetch for temporary component ID:', currentComponent.id);
      setConnectivity(null);
      return;
    }
    
    console.log('Fetching connectivity for component:', currentComponent);
    setLoading(true);
    setError(null);
    
    try {
      // Check if token exists
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No authentication token found');
        setError('Authentication token not found. Please log in again.');
        setLoading(false);
        return;
      }
      
      // First try to get connectivity from our database
      const url = `${API_URL}/connectivity/component/${currentComponent.id}`;
      console.log('Fetching connectivity from URL:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Customer-ID': getCustomerId() || ''
        }
      });
      
      console.log('Connectivity fetch response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Connectivity data received:', data);
        
        // If connectivity exists but doesn't have installCommands, add them
        if (data && data.tailscaleKey && !data.installCommands) {
          data.installCommands = `curl -fsSL https://tailscale.com/install.sh | sh
echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
sudo sysctl -p /etc/sysctl.d/99-tailscale.conf
tailscale up --ssh --accept-routes --authkey=${data.tailscaleKey}`;
        }
        
        setConnectivity(data);
        
        // Set initial status based on data
        if (data.status) {
          setConnectionStatus(data.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE');
        } else {
          setConnectionStatus('UNKNOWN');
        }
      } else if (response.status === 404) {
        // If not found, we'll create it later
        console.log('No connectivity found for this component');
        setConnectivity(null);
        setConnectionStatus('UNKNOWN');
        // Don't set an error for 404 - this is an expected state when no connectivity exists yet
      } else if (response.status === 401) {
        console.error('Authentication token expired or invalid');
        setError('Your session has expired. Please refresh the page and log in again.');
      } else {
        console.error('Error response from connectivity API:', response);
        throw new Error('Failed to fetch connectivity');
      }
    } catch (err) {
      console.error('Error fetching connectivity:', err);
      if (err instanceof Error && err.message.includes('401')) {
        setError('Your session has expired. Please refresh the page and log in again.');
      } else {
        setError('Failed to fetch connectivity status.');
      }
    } finally {
      setLoading(false);
    }
  }, [components, selectedComponentIndex]);

  useEffect(() => {
    if (components.length > 0) {
      console.log('Fetching connectivity for components:', components);
      fetchConnectivity();
    }
  }, [components, selectedComponentIndex, fetchConnectivity]);

  // Check device connectivity when the component mounts and connectivity data is available
  useEffect(() => {
    // If tailscaleDeviceId prop is provided, use it directly
    if (tailscaleDeviceId) {
      console.log('Using provided tailscaleDeviceId prop:', tailscaleDeviceId);
      checkSingleDeviceConnectivity(tailscaleDeviceId);
    } else if (connectivity?.tailscaleDeviceId) {
      console.log('Checking single device connectivity for:', connectivity.tailscaleDeviceId);
      // Check for the specific device when component mounts or tailscaleDeviceId changes
      checkSingleDeviceConnectivity(connectivity.tailscaleDeviceId);
    } else {
      setConnectionStatus('UNKNOWN');
    }
  }, [connectivity, tailscaleDeviceId, checkSingleDeviceConnectivity]); // Re-run when tailscaleDeviceId changes

  // Define a type for API errors
  interface ApiError {
    response?: {
      status?: number;
      data?: {
        error?: string;
        details?: string;
      };
    };
    message?: string;
  }

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };
  
  const handleCreateConnectivity = async () => {
    if (!components.length) {
      console.error('No components available');
      return;
    }
    
    const currentComponent = components[selectedComponentIndex];
    if (!currentComponent?.id) {
      console.error('No component ID available');
      return;
    }
    
    // Check if token exists
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found');
      setError('Authentication token not found. Please log in again.');
      return;
    }
    
    // For temporary IDs, create a connectivity record directly
    if (currentComponent.id.startsWith('temp-')) {
      console.log('Creating connectivity for temporary component:', currentComponent);
      setCreatingConnection(true);
      setError(null);
      
      try {
        const customerId = getCustomerId();
        
        if (!customerId) {
          console.log('Customer ID not found');
          setError('Customer ID not found. Please log in again.');
          setCreatingConnection(false);
          return;
        }
        
        // Create a connectivity record directly
        const tailscaleKey = Math.random().toString(36).substring(2, 15);
        const newConnectivity: Connectivity = {
          id: `temp-${Date.now()}`,
          componentId: currentComponent.id,
          status: 'INACTIVE',
          sshCommand: `ssh ${currentComponent.hostname}`,
          httpsUrl: `https://${currentComponent.hostname}:${currentComponent.port}`,
          tailscaleKey: tailscaleKey,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          installCommands: `curl -fsSL https://tailscale.com/install.sh | sh
echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
sudo sysctl -p /etc/sysctl.d/99-tailscale.conf
tailscale up --ssh --accept-routes --authkey=${tailscaleKey}`
        };
        
        console.log('Created temporary connectivity:', newConnectivity);
        setConnectivity(newConnectivity);
        setConnectionStatus('INACTIVE');
        setError('Note: This is a temporary connection. Save the component to create a permanent connection.');
      } catch (err) {
        console.error('Error creating temporary connectivity:', err);
        setError('Failed to create temporary connectivity. ' + (err instanceof Error ? err.message : ''));
      } finally {
        setCreatingConnection(false);
      }
      return;
    }
    
    console.log('Creating connectivity for component:', currentComponent);
    setCreatingConnection(true);
    setError(null);
    
    try {
      // Generate a key and create connectivity using the global Tailscale configuration
      const customerId = getCustomerId();
      
      if (!customerId) {
        console.log('Customer ID not found');
        setError('Customer ID not found. Please log in again.');
        setCreatingConnection(false);
        return;
      }
      
      // Create a simple description with the component ID and customer ID
      // Format the description properly with spaces and keep it short
      const shortDescription = `Comp ${currentComponent.id.substring(0, 6)} Cust ${customerId.substring(0, 6)}`;
      
      console.log('Calling tailscaleApi.generateKey() with:', {
        componentId: currentComponent.id,
        description: shortDescription,
        customerId,
        reusable: false,
        ephemeral: false
      });
      
      // Generate a key and create connectivity with the customer ID from localStorage
      const connectivity = await tailscaleApi.generateKey({
        componentId: currentComponent.id,
        description: shortDescription,
        customerId: customerId,
        reusable: false,
        ephemeral: false
      });
      
      console.log('Connectivity created successfully:', connectivity);
      setConnectivity(connectivity);
      setConnectionStatus('INACTIVE'); // Default to inactive until we check
    } catch (err: Error | ApiError | unknown) {
      console.error('Error creating connectivity:', err);
      
      // Check if this is a configuration error
      const apiError = err as ApiError;
      if (apiError.response && apiError.response.status === 404 && 
          apiError.response.data && apiError.response.data.error === 'Tailscale API not configured') {
        setError('Tailscale API is not configured. Please contact your administrator.');
      } else if (apiError.response && apiError.response.status === 401) {
        setError('Your session has expired. Please refresh the page and log in again.');
      } else {
        // Just show the error, no fallback
        setError(`Failed to create connectivity: ${apiError.response?.status} ${apiError.message || 'Unknown error'}`);
      }
    } finally {
      setCreatingConnection(false);
    }
  };

  // Function to delete connectivity
  const handleDeleteConnectivity = async () => {
    if (!components.length) {
      console.error('No components available');
      return;
    }
    
    const currentComponent = components[selectedComponentIndex];
    if (!currentComponent?.id) {
      console.error('No component ID available');
      return;
    }
    
    // Check if token exists
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found');
      setError('Authentication token not found. Please log in again.');
      return;
    }
    
    console.log('Deleting connectivity for component:', currentComponent);
    setCreatingConnection(true);
    setError(null);
    
    try {
      const customerId = getCustomerId();
      
      if (!customerId) {
        console.log('Customer ID not found');
        setError('Customer ID not found. Please log in again.');
        setCreatingConnection(false);
        return;
      }
      
      // Delete the connectivity
      const response = await fetch(`${API_URL}/connectivity/component/${currentComponent.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Customer-ID': customerId
        }
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          console.error('Authentication token expired or invalid');
          setError('Your session has expired. Please refresh the page and log in again.');
          setCreatingConnection(false);
          return;
        }
        throw new Error('Failed to delete connectivity');
      }
      
      console.log('Connectivity deleted successfully');
      setConnectivity(null);
      setConnectionStatus('UNKNOWN');
    } catch (err) {
      console.error('Error deleting connectivity:', err);
      setError('Failed to delete connectivity. ' + (err instanceof Error ? err.message : ''));
    } finally {
      setCreatingConnection(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100 flex items-center">
          <span className="ml-2">Zero Trust Remote Connectivity</span>
        </h3>
        
        {/* Connection Status Indicator - Always show status indicator */}
        <div className="flex items-center">
          <span className="mr-2">Status:</span>
          <div className={`w-3 h-3 rounded-full ${
            connectionStatus === 'ACTIVE' ? 'bg-green-500' : 
            connectionStatus === 'INACTIVE' ? 'bg-red-500' : 
            'bg-gray-500'
          }`}></div>
        </div>
      </div>
      
      <div className="mt-4">
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md mb-4">
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Component Details</p>
          </div>
          {components.length > 0 && (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <span className="font-semibold">{components[selectedComponentIndex].type}:</span> {components[selectedComponentIndex].name}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <span className="font-semibold">Hostname:</span> {components[selectedComponentIndex].hostname}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <span className="font-semibold">Port:</span> {components[selectedComponentIndex].port}
              </p>
            </>
          )}
        </div>
        
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-4">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        ) : connectivity ? (
          <div className="space-y-4">
            <div className={`${
              connectionStatus === 'ACTIVE' ? 'bg-green-50 dark:bg-green-900/30 border-green-500' : 
              'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-500'
            } border-l-4 p-4 mb-4 transition-opacity duration-500`} id="success-message">
              <p className={`${
                connectionStatus === 'ACTIVE' ? 'text-green-800 dark:text-green-200' : 
                'text-yellow-800 dark:text-yellow-200'
              }`}>
                {connectionStatus === 'ACTIVE' 
                  ? 'Connectivity configured successfully and device is online!' 
                  : 'Connectivity configured but device is not connected. Please check your Tailscale setup.'}
              </p>
            </div>
            
            {connectivity.installCommands && (
              <>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Run these commands on your Linux server to set up Tailscale:
                </p>
                <div className="relative bg-gray-800 rounded-md p-4">
                  <div className="absolute top-2 right-2">
                    <button 
                      onClick={() => handleCopy(connectivity.installCommands || '', 'commands')}
                      className="text-gray-400 hover:text-white"
                      title="Copy to clipboard"
                    >
                      <Copy size={18} />
                    </button>
                    {copied === 'commands' && (
                      <span className="absolute -top-8 -right-2 bg-gray-700 text-white text-xs px-2 py-1 rounded">
                        Copied!
                      </span>
                    )}
                  </div>
                  <pre className="text-green-400 text-sm overflow-x-auto whitespace-pre-wrap">
                    {connectivity.installCommands}
                  </pre>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500 p-4 mb-4">
            <p className="text-blue-800 dark:text-blue-200">
              No connectivity configured for this component. Click "Create Connection" to set up secure remote access.
            </p>
          </div>
        )}
      </div>
      
      {/* Action buttons */}
      <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 rounded-md flex justify-between items-center">
        <div className="flex space-x-2">
          {connectivity ? (
            <button
              type="button"
              onClick={handleDeleteConnectivity}
              className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none text-sm"
            >
              Delete Connection
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                console.log('Create Connection button clicked');
                handleCreateConnectivity();
              }}
              disabled={creatingConnection}
              className={`inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none text-sm ${creatingConnection ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
              {creatingConnection ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  Creating...
                </>
              ) : (
                'Create Connection'
              )}
            </button>
          )}
          
          {/* Refresh Connectivity button */}
          <button
            type="button"
            onClick={async () => {
              console.log('Refresh Connectivity button clicked');
              
              // If we have a tailscaleDeviceId prop, use it directly
              if (tailscaleDeviceId) {
                await checkSingleDeviceConnectivity(tailscaleDeviceId);
              }
              // Otherwise, if we have a tailscaleDeviceId in connectivity, check that
              else if (connectivity && connectivity.tailscaleDeviceId) {
                await checkSingleDeviceConnectivity(connectivity.tailscaleDeviceId);
              } else {
                // If we don't have any tailscaleDeviceId, just refresh the connectivity data
                await fetchConnectivity();
              }
            }}
            className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none text-sm"
          >
            Refresh Connectivity
          </button>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none text-sm"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
};

export default TailscaleConnectivity;
