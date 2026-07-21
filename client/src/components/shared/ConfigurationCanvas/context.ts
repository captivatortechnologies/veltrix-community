import { createContext, useContext } from 'react';

/**
 * ConfigCanvasContext — exposes the current configuration's tool/entity type to
 * descendant field inputs, so a field (e.g. `files`) can look up OTHER saved
 * configurations of the same type (used by the "Import from a saved config"
 * feature). Empty when a canvas doesn't declare tool/entity type.
 */
export interface ConfigCanvasContextValue {
  toolType?: string;
  entityType?: string;
  /** The app id (== toolType) — used by remote-option fields to call the app. */
  appId?: string;
  /** The selected environment (tag) id — passed to the options endpoint. */
  environmentId?: string;
}

export const ConfigCanvasContext = createContext<ConfigCanvasContextValue>({});

export const useConfigCanvasContext = (): ConfigCanvasContextValue =>
  useContext(ConfigCanvasContext);
