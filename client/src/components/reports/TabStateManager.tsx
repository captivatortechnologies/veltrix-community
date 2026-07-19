import React, { ReactNode, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface TabStateManagerProps {
  children: ReactNode;
  tabState: Record<string, unknown>;
  setTabState: (key: string, value: unknown) => void;
  urlParamMapping?: Record<string, string>; // Optional mapping of state keys to URL param names
}

/**
 * TabStateManager syncs component state with URL query parameters
 * to ensure persistence across page refreshes
 */
const TabStateManager: React.FC<TabStateManagerProps> = ({
  children,
  tabState,
  setTabState,
  urlParamMapping = {}
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Function to update URL query parameters based on state
  const updateUrl = useCallback(() => {
    const params = new URLSearchParams(location.search);
    
    // Update each state key to its URL parameter
    Object.entries(tabState).forEach(([key, value]) => {
      // Get the param name from mapping or use the key directly
      const paramName = urlParamMapping[key] || key;
      
      // Skip undefined/null/empty string values
      if (value === undefined || value === null || value === '') {
        params.delete(paramName);
      } else {
        params.set(paramName, String(value));
      }
    });
    
    // Update URL without triggering page reload
    const newSearch = params.toString();
    const newUrl = `${location.pathname}${newSearch ? `?${newSearch}` : ''}`;

    navigate(newUrl, { replace: true });
  }, [location.search, location.pathname, navigate, tabState, urlParamMapping]);

  // On mount, read from URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    let stateUpdated = false;

    // Process each parameter in the URL
    params.forEach((value, key) => {
      // Get the state key by checking the mapping or using the param key directly
      const stateKey = Object.entries(urlParamMapping)
        .find(([, paramName]) => paramName === key)?.[0] || key;

      // Only update if this is a key we're tracking
      if (stateKey in tabState) {
        // Convert values if needed (strings, booleans, numbers)
        let parsedValue: unknown = value;

        // Handle boolean values
        if (value === 'true' || value === 'false') {
          parsedValue = value === 'true';
        }
        // Handle numeric values
        else if (!isNaN(Number(value)) && value !== '') {
          parsedValue = Number(value);
        }

        // Only update if the value is different
        if (tabState[stateKey] !== parsedValue) {
          setTabState(stateKey, parsedValue);
          stateUpdated = true;
        }
      }
    });

    // If no updates were made from URL and we have default values, update URL
    if (!stateUpdated && Object.keys(tabState).length > 0) {
      updateUrl();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Update URL when state changes
  useEffect(() => {
    updateUrl();
  }, [tabState, updateUrl]);

  return <>{children}</>;
};

export default TabStateManager;
