/**
 * UI Preferences Store
 * 
 * Manages user interface preferences with persistence.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { devtools } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';
export type SidebarState = 'expanded' | 'collapsed' | 'hidden';
export type TableDensity = 'comfortable' | 'compact' | 'spacious';

export interface TablePreferences {
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  density: TableDensity;
  visibleColumns?: string[];
}

export interface DashboardLayout {
  widgets: string[];
  order: number[];
  grid?: {
    cols: number;
    rows: number;
  };
}

interface PreferencesState {
  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;
  
  // Sidebar
  sidebarState: SidebarState;
  setSidebarState: (state: SidebarState) => void;
  toggleSidebar: () => void;
  
  // Tables
  tablePreferences: Record<string, TablePreferences>;
  setTablePreferences: (tableId: string, prefs: Partial<TablePreferences>) => void;
  getTablePreferences: (tableId: string) => TablePreferences;
  resetTablePreferences: (tableId: string) => void;
  
  // Dashboard
  dashboardLayouts: Record<string, DashboardLayout>;
  setDashboardLayout: (dashboardId: string, layout: DashboardLayout) => void;
  getDashboardLayout: (dashboardId: string) => DashboardLayout | undefined;
  
  // Notifications
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  
  // Recent items
  recentDeployments: string[];
  recentTools: string[];
  addRecentDeployment: (id: string) => void;
  addRecentTool: (id: string) => void;
  clearRecentDeployments: () => void;
  clearRecentTools: () => void;
  
  // View preferences
  compactMode: boolean;
  showTips: boolean;
  animationsEnabled: boolean;
  setCompactMode: (enabled: boolean) => void;
  setShowTips: (enabled: boolean) => void;
  setAnimationsEnabled: (enabled: boolean) => void;
  
  // Language
  language: string;
  setLanguage: (language: string) => void;
  
  // Reset
  reset: () => void;
  resetAll: () => void;
}

const DEFAULT_TABLE_PREFERENCES: TablePreferences = {
  pageSize: 25,
  density: 'comfortable',
};

const MAX_RECENT_ITEMS = 10;

export const usePreferencesStore = create<PreferencesState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        theme: 'system',
        sidebarState: 'expanded',
        tablePreferences: {},
        dashboardLayouts: {},
        notificationsEnabled: true,
        soundEnabled: false,
        recentDeployments: [],
        recentTools: [],
        compactMode: false,
        showTips: true,
        animationsEnabled: true,
        language: 'en',

        // Theme
        setTheme: (theme) => {
          set({ theme });
          
          // Apply theme to document
          if (typeof document !== 'undefined') {
            const root = document.documentElement;
            
            if (theme === 'system') {
              const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              root.classList.toggle('dark', isDark);
            } else {
              root.classList.toggle('dark', theme === 'dark');
            }
          }
        },

        // Sidebar
        setSidebarState: (state) => set({ sidebarState: state }),
        
        toggleSidebar: () => {
          const { sidebarState } = get();
          const newState = sidebarState === 'expanded' ? 'collapsed' : 'expanded';
          set({ sidebarState: newState });
        },

        // Tables
        setTablePreferences: (tableId, prefs) =>
          set((state) => ({
            tablePreferences: {
              ...state.tablePreferences,
              [tableId]: {
                ...DEFAULT_TABLE_PREFERENCES,
                ...state.tablePreferences[tableId],
                ...prefs,
              },
            },
          })),

        getTablePreferences: (tableId) => {
          const { tablePreferences } = get();
          return tablePreferences[tableId] || DEFAULT_TABLE_PREFERENCES;
        },

        resetTablePreferences: (tableId) =>
          set((state) => {
            const { [tableId]: _, ...rest } = state.tablePreferences;
            return { tablePreferences: rest };
          }),

        // Dashboard
        setDashboardLayout: (dashboardId, layout) =>
          set((state) => ({
            dashboardLayouts: {
              ...state.dashboardLayouts,
              [dashboardId]: layout,
            },
          })),

        getDashboardLayout: (dashboardId) => {
          const { dashboardLayouts } = get();
          return dashboardLayouts[dashboardId];
        },

        // Notifications
        setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
        setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),

        // Recent items
        addRecentDeployment: (id) =>
          set((state) => {
            const filtered = state.recentDeployments.filter((i) => i !== id);
            const updated = [id, ...filtered].slice(0, MAX_RECENT_ITEMS);
            return { recentDeployments: updated };
          }),

        addRecentTool: (id) =>
          set((state) => {
            const filtered = state.recentTools.filter((i) => i !== id);
            const updated = [id, ...filtered].slice(0, MAX_RECENT_ITEMS);
            return { recentTools: updated };
          }),

        clearRecentDeployments: () => set({ recentDeployments: [] }),
        clearRecentTools: () => set({ recentTools: [] }),

        // View preferences
        setCompactMode: (enabled) => set({ compactMode: enabled }),
        setShowTips: (enabled) => set({ showTips: enabled }),
        setAnimationsEnabled: (enabled) => set({ animationsEnabled: enabled }),

        // Language
        setLanguage: (language) => set({ language }),

        // Reset
        reset: () =>
          set({
            theme: 'system',
            sidebarState: 'expanded',
            compactMode: false,
            showTips: true,
            animationsEnabled: true,
          }),

        resetAll: () =>
          set({
            theme: 'system',
            sidebarState: 'expanded',
            tablePreferences: {},
            dashboardLayouts: {},
            notificationsEnabled: true,
            soundEnabled: false,
            recentDeployments: [],
            recentTools: [],
            compactMode: false,
            showTips: true,
            animationsEnabled: true,
            language: 'en',
          }),
      }),
      {
        name: 'veltrix-preferences',
        storage: createJSONStorage(() => localStorage),
      }
    ),
    { name: 'PreferencesStore' }
  )
);

// Apply theme on initialization
if (typeof window !== 'undefined') {
  const store = usePreferencesStore.getState();
  store.setTheme(store.theme);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (store.theme === 'system') {
      document.documentElement.classList.toggle('dark', e.matches);
    }
  });
}

export default usePreferencesStore;
