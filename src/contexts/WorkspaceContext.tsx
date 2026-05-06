import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type Workspace = "automacao" | "crm" | "group-crm" | "group-manager";

interface WorkspaceContextValue {
  workspace: Workspace;
  setWorkspace: (ws: Workspace) => void;
  isCRM: boolean;
  isGroupCRM: boolean;
  isGroupManager: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: "automacao",
  setWorkspace: () => {},
  isCRM: false,
  isGroupCRM: false,
  isGroupManager: false,
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
        isGroupCRM: workspace === "group-crm",
        isGroupManager: workspace === "group-manager",
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => useContext(WorkspaceContext);
