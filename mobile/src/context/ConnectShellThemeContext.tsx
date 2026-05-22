import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_CONNECT_SHELL_MODE,
  loadConnectShellMode,
  nextConnectShellMode,
  saveConnectShellMode,
  type ConnectShellMode,
} from '../lib/connectShellTheme';

type ConnectShellThemeContextValue = {
  mode: ConnectShellMode;
  setMode: (m: ConnectShellMode) => void;
  toggleMode: () => void;
};

const ConnectShellThemeContext = createContext<ConnectShellThemeContextValue | null>(null);

export function ConnectShellThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ConnectShellMode>(DEFAULT_CONNECT_SHELL_MODE);

  useEffect(() => {
    void loadConnectShellMode().then(setModeState);
  }, []);

  const setMode = useCallback((m: ConnectShellMode) => {
    setModeState(m);
    void saveConnectShellMode(m);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next = nextConnectShellMode(prev);
      void saveConnectShellMode(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ mode, setMode, toggleMode }), [mode, setMode, toggleMode]);

  return (
    <ConnectShellThemeContext.Provider value={value}>{children}</ConnectShellThemeContext.Provider>
  );
}

export function useConnectShellTheme(): ConnectShellThemeContextValue {
  const ctx = useContext(ConnectShellThemeContext);
  if (!ctx) {
    throw new Error('useConnectShellTheme must be used within ConnectShellThemeProvider');
  }
  return ctx;
}
