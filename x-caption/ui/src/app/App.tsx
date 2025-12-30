import { AppShell } from "./layout/AppShell";
import { useAppState } from "./hooks/useAppState";

export function App() {
  const appState = useAppState();
  return <AppShell {...appState} />;
}
