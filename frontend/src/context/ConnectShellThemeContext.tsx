import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  nextConnectShellMode,
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
  const modeRef = useRef(mode);
  modeRef.current = mode;

  /** Keeps <html data-connect-shell> + localStorage in sync without side effects inside state updaters (Strict Mode safe). */
  useEffect(() => {
    persistConnectShellMode(mode);
  }, [mode]);

  const setMode = useCallback((m: ConnectShellMode) => {
    setModeState(m);
  }, []);

  const toggleMode = useCallback(() => {
    const next = nextConnectShellMode(modeRef.current);
    setModeState(next);
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
