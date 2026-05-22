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
import { useAuth } from "./AuthContext";
import {
  DEFAULT_CONNECT_SHELL_MODE,
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
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [mode, setModeState] = useState<ConnectShellMode>(DEFAULT_CONNECT_SHELL_MODE);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const next = readConnectShellMode(userId);
    setModeState(next);
    persistConnectShellMode(next, userId);
  }, [userId]);

  const setMode = useCallback(
    (m: ConnectShellMode) => {
      setModeState(m);
      persistConnectShellMode(m, userId);
    },
    [userId]
  );

  const toggleMode = useCallback(() => {
    const next = nextConnectShellMode(modeRef.current);
    setModeState(next);
    persistConnectShellMode(next, userId);
  }, [userId]);

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
