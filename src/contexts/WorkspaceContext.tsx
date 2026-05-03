import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type Workspace = "automacao" | "crm" | "groups";

interface WorkspaceContextValue {
  workspace: Workspace;
  setWorkspace: (ws: Workspace) => void;
  isCRM: boolean;
  isGroups: boolean;
  isAutomacao: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: "automacao",
  setWorkspace: () => {},
  isCRM: false,
  isGroups: false,
  isAutomacao: true,
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspaceState] = useState<Workspace>(() => {
    return (sessionStorage.getItem("workspace") as Workspace) || "automacao";
  });

  const setWorkspace = useCallback((ws: Workspace) => {
    setWorkspaceState(ws);
    sessionStorage.setItem("workspace", ws);
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        setWorkspace,
        isCRM: workspace === "crm",
        isGroups: workspace === "groups",
        isAutomacao: workspace === "automacao",
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => useContext(WorkspaceContext);
