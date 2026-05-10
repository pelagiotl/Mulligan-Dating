import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyConnectShellMode,
  persistConnectShellMode,
  readConnectShellMode,
  type ConnectShellMode,
} from "../lib/connectShellTheme";

type ConnectShellThemeContextValue = {
  mode: ConnectShellMode;
  setMode: (m: ConnectShellMode) => void;
  toggleMode: () => void;
};

const ConnectShellThemeContext = createContext<ConnectShellThemeContextValue | null>(null);

export function ConnectShellThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ConnectShellMode>(() => readConnectShellMode());

  useEffect(() => {
    applyConnectShellMode(mode);
  }, [mode]);

  const setMode = useCallback((m: ConnectShellMode) => {
    setModeState(m);
    persistConnectShellMode(m);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next: ConnectShellMode = prev === "midnight" ? "soft" : "midnight";
      persistConnectShellMode(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ mode, setMode, toggleMode }),
    [mode, setMode, toggleMode]
  );

  return (
    <ConnectShellThemeContext.Provider value={value}>
      {children}
    </ConnectShellThemeContext.Provider>
  );
}

export function useConnectShellTheme(): ConnectShellThemeContextValue {
  const ctx = useContext(ConnectShellThemeContext);
  if (!ctx) {
    throw new Error("useConnectShellTheme must be used within ConnectShellThemeProvider");
  }
  return ctx;
}
