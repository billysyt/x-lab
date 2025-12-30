import { AppShell } from "./components/shell/layout/AppShell";
import { useAppState } from "./hooks/useAppState";

export function App() {
  const appState = useAppState();
  return <AppShell {...appState} />;
}
