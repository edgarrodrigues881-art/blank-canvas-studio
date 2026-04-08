import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Connection,
  Node,
  Edge,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { StartNode } from "@/components/autoreply/StartNode";
import { MessageNode } from "@/components/autoreply/MessageNode";
import { EndNode } from "@/components/autoreply/EndNode";
import { DelayNode } from "@/components/autoreply/DelayNode";
import { ConditionNode } from "@/components/autoreply/ConditionNode";
import { AINode } from "@/components/autoreply/AINode";
import { FlowSidebar } from "@/components/autoreply/FlowSidebar";
import { EditPanel } from "@/components/autoreply/EditPanel";
import { FlowHeader } from "@/components/autoreply/FlowHeader";
import type { FlowNodeData } from "@/components/autoreply/types";
import { nextNodeId, nextBtnId } from "@/components/autoreply/types";
import { MessageSquare, Square, Timer, GitBranch, Bot, Unplug } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const nodeTypes = {
  startNode: StartNode,
  messageNode: MessageNode,
  delayNode: DelayNode,
  conditionNode: ConditionNode,
  aiNode: AINode,
  endNode: EndNode,
};

const defaultEdgeOptions = {
  type: "smoothstep",
  animated: true,
  style: { stroke: "hsl(var(--primary) / 0.45)", strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary) / 0.5)", width: 12, height: 12 },
};

const defaultNodes: Node<FlowNodeData>[] = [
  {
    id: "start-1",
    type: "startNode",
    position: { x: 100, y: 200 },
    data: { label: "Início", trigger: "keyword", keyword: "" },
  },
];

const defaultEdges: Edge[] = [];

interface DropMenu {
  x: number;
  y: number;
  flowX: number;
  flowY: number;
  sourceNodeId: string;
  sourceHandleId: string;
}

interface EdgeMenu {
  x: number;
  y: number;
  edgeId: string;
}

interface FlowSnapshot {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
}

function FlowCanvas() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = id === "new";
  const [flowId, setFlowId] = useState<string | null>(isNew ? null : id || null);

  const [nodes, setNodes] = useState<Node<FlowNodeData>[]>(defaultNodes);
  const [edges, setEdges] = useState<Edge[]>(defaultEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState("Minha Automação");
  const [isActive, setIsActive] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [dropMenu, setDropMenu] = useState<DropMenu | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<EdgeMenu | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(isNew);
  const [isDirty, setIsDirty] = useState(false);
  const [undoStack, setUndoStack] = useState<FlowSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<FlowSnapshot[]>([]);
  const pendingConnection = useRef<{ source: string; sourceHandle: string } | null>(null);
  const initialLoadDone = useRef(false);
  const isRestoringRef = useRef(false);
  const { screenToFlowPosition } = useReactFlow();

  const snapshotFlow = useCallback((): FlowSnapshot => {
    return {
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
      selectedNodeId,
    };
  }, [nodes, edges, selectedNodeId]);

  const rememberHistory = useCallback(() => {
    if (!initialLoadDone.current || isRestoringRef.current) return;

    const snapshot = snapshotFlow();

    setUndoStack((prev) => {
      const last = prev[prev.length - 1];
      if (last) {
        const isSame =
          JSON.stringify(last.nodes) === JSON.stringify(snapshot.nodes) &&
          JSON.stringify(last.edges) === JSON.stringify(snapshot.edges) &&
          last.selectedNodeId === snapshot.selectedNodeId;

        if (isSame) return prev;
      }

      const next = [...prev, snapshot];
      return next.length > 50 ? next.slice(-50) : next;
    });
    setRedoStack([]);
  }, [snapshotFlow]);

  const restoreSnapshot = useCallback((snapshot: FlowSnapshot) => {
    isRestoringRef.current = true;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setSelectedNodeId(snapshot.selectedNodeId);
    setDropMenu(null);
    setEdgeMenu(null);

    requestAnimationFrame(() => {
      isRestoringRef.current = false;
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;

    const previousSnapshot = undoStack[undoStack.length - 1];
    const currentSnapshot = snapshotFlow();

    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [currentSnapshot, ...prev].slice(0, 50));
    restoreSnapshot(previousSnapshot);
  }, [undoStack, snapshotFlow, restoreSnapshot]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;

    const nextSnapshot = redoStack[0];
    const currentSnapshot = snapshotFlow();

    setRedoStack((prev) => prev.slice(1));
    setUndoStack((prev) => [...prev, currentSnapshot].slice(-50));
    restoreSnapshot(nextSnapshot);
  }, [redoStack, snapshotFlow, restoreSnapshot]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          !!target.closest("input, textarea, [contenteditable='true']"));

      if (isEditable) return;

      const isMeta = event.ctrlKey || event.metaKey;
      if (!isMeta) return;

      const key = event.key.toLowerCase();

      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }

      if (key === "y") {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [handleUndo, handleRedo]);

  useEffect(() => {
    if (!initialLoadDone.current) return;
    setIsDirty(true);
  }, [nodes, edges, flowName, isActive, deviceId]);

  useEffect(() => {
    if (isNew || !flowId || !user) {
      setLoaded(true);
      setUndoStack([]);
      setRedoStack([]);
      initialLoadDone.current = true;
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("autoreply_flows")
        .select("*")
        .eq("id", flowId)
        .single();

      if (error || !data) {
        toast.error("Fluxo não encontrado");
        navigate("/dashboard/conversations");
        return;
      }

      setFlowName(data.name);
      setIsActive(data.is_active);
      setDeviceId((data as any).device_id || null);

      if (Array.isArray(data.nodes) && data.nodes.length > 0) {
        setNodes(data.nodes as unknown as Node<FlowNodeData>[]);
      }

      if (Array.isArray(data.edges)) {
        setEdges(data.edges as unknown as Edge[]);
      }

      setUndoStack([]);
      setRedoStack([]);
      setIsDirty(false);
      setLoaded(true);

      setTimeout(() => {
        initialLoadDone.current = true;
      }, 100);
    })();
  }, [flowId, isNew, user, navigate]);

  const validateFlow = useCallback((): boolean => {
    if (!flowName.trim()) {
      toast.error("Digite um nome para a automação");
      return false;
    }

    const startNode = nodes.find((n) => n.type === "startNode");
    if (!startNode) {
      toast.error("O fluxo precisa de um bloco de Início");
      return false;
    }

    const startData = startNode.data as FlowNodeData;
    if (startData.trigger === "keyword" && !startData.keyword?.trim()) {
      toast.error("Defina uma palavra-chave no bloco de Início");
      return false;
    }

    if (startData.trigger === "template" && !startData.templateId) {
      toast.error("Selecione um modelo no bloco de Início");
      return false;
    }

    return true;
  }, [nodes, flowName]);

  const handleSave = useCallback(async () => {
    if (!user) {
      toast.error("Faça login para salvar");
      return;
    }
    if (!validateFlow()) return;

    setSaving(true);
    try {
      const payload = {
        name: flowName.trim(),
        is_active: isActive,
        device_id: deviceId,
        nodes: nodes as any,
        edges: edges as any,
        user_id: user.id,
      };

      if (flowId) {
        const { error } = await supabase
          .from("autoreply_flows")
          .update({ name: payload.name, is_active: payload.is_active, device_id: payload.device_id, nodes: payload.nodes, edges: payload.edges })
          .eq("id", flowId);
        if (error) throw error;
        toast.success("Fluxo salvo com sucesso!");
      } else {
        const { data, error } = await supabase
          .from("autoreply_flows")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        setFlowId(data.id);
        navigate(`/dashboard/auto-reply/${data.id}`, { replace: true });
        toast.success("Fluxo criado com sucesso!");
      }
      setIsDirty(false);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || "erro desconhecido"));
    } finally {
      setSaving(false);
    }
  }, [user, flowId, flowName, isActive, deviceId, nodes, edges, navigate, validateFlow]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const onNodesChange = useCallback(
    (changes: any[]) => {
      const shouldTrack = changes.some((change) => {
        if (change.type === "select") return false;
        if (change.type === "position" && change.dragging) return false;
        return true;
      });

      if (shouldTrack) rememberHistory();
      setNodes((currentNodes) => applyNodeChanges(changes, currentNodes) as Node<FlowNodeData>[]);
    },
    [rememberHistory]
  );

  const onEdgesChange = useCallback(
    (changes: any[]) => {
      const shouldTrack = changes.some((change) => change.type !== "select");
      if (shouldTrack) rememberHistory();
      setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));

      if (changes.some((change) => change.type === "remove")) {
        setEdgeMenu(null);
      }
    },
    [rememberHistory]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      pendingConnection.current = null;
      rememberHistory();
      setDropMenu(null);
      setEdgeMenu(null);
      setEdges((eds) => addEdge(params, eds));
    },
    [rememberHistory]
  );

  const onConnectStart = useCallback((_: any, params: any) => {
    if (params.nodeId && params.handleId) {
      pendingConnection.current = { source: params.nodeId, sourceHandle: params.handleId };
    }
  }, []);

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (!pendingConnection.current) return;

      const target = event.target as HTMLElement;
      if (!target) {
        pendingConnection.current = null;
        return;
      }

      const targetIsNode = target.closest?.(".react-flow__node");
      const targetIsHandle = target.closest?.(".react-flow__handle");
      if (targetIsNode || targetIsHandle) {
        pendingConnection.current = null;
        return;
      }

      const clientX = "changedTouches" in event ? event.changedTouches[0].clientX : (event as MouseEvent).clientX;
      const clientY = "changedTouches" in event ? event.changedTouches[0].clientY : (event as MouseEvent).clientY;
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY });

      setEdgeMenu(null);
      setDropMenu({
        x: clientX,
        y: clientY,
        flowX: flowPos.x,
        flowY: flowPos.y,
        sourceNodeId: pendingConnection.current.source,
        sourceHandleId: pendingConnection.current.sourceHandle,
      });

      pendingConnection.current = null;
    },
    [screenToFlowPosition]
  );

  const createNodeFromMenu = useCallback(
    (type: "messageNode" | "endNode" | "delayNode" | "conditionNode" | "aiNode") => {
      if (!dropMenu) return;

      rememberHistory();

      const id = nextNodeId(type);
      let data: FlowNodeData;

      if (type === "endNode") {
        data = { label: "Finalizar", action: "end_flow" };
      } else if (type === "delayNode") {
        data = { label: "Temporizador", delaySeconds: 5 };
      } else if (type === "conditionNode") {
        data = { label: "Condição", conditions: [] };
      } else if (type === "aiNode") {
        data = { label: "Resposta IA", aiPrompt: "", aiModel: "gpt-4o" };
      } else {
        data = {
          label: "Nova Mensagem",
          text: "",
          imageUrl: "",
          imageCaption: "",
          delay: 0,
          buttons: [],
        };
      }

      const newNode: Node<FlowNodeData> = {
        id,
        type,
        position: { x: dropMenu.flowX - 125, y: dropMenu.flowY - 30 },
        data,
      };

      setNodes((nds) => nds.concat(newNode));

      const newEdge: Edge = {
        id: `e-${dropMenu.sourceNodeId}-${id}`,
        source: dropMenu.sourceNodeId,
        sourceHandle: dropMenu.sourceHandleId,
        target: id,
        targetHandle: "in",
      };
      setEdges((eds) => addEdge(newEdge, eds));

      setSelectedNodeId(id);
      setDropMenu(null);
    },
    [dropMenu, rememberHistory]
  );

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
    setDropMenu(null);
    setEdgeMenu(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setDropMenu(null);
    setEdgeMenu(null);
  }, []);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setSelectedNodeId(null);
    setDropMenu(null);

    const menuWidth = 170;
    const menuHeight = 58;
    const x = Math.min(event.clientX + 8, window.innerWidth - menuWidth - 8);
    const y = Math.min(event.clientY + 8, window.innerHeight - menuHeight - 8);

    setEdgeMenu({ x, y, edgeId: edge.id });
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/reactflow");
      if (!type) return;

      if (type === "startNode") {
        const hasStart = nodes.some((n) => n.type === "startNode");
        if (hasStart) {
          toast.error("Só é permitido um bloco de Início por fluxo");
          return;
        }
      }

      rememberHistory();

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = nextNodeId(type);

      let data: FlowNodeData;
      if (type === "startNode") {
        data = { label: "Início", trigger: "keyword", keyword: "" };
      } else if (type === "endNode") {
        data = { label: "Finalizar", action: "end_flow" };
      } else if (type === "delayNode") {
        data = { label: "Temporizador", delaySeconds: 5 };
      } else if (type === "conditionNode") {
        data = { label: "Condição", conditions: [] };
      } else if (type === "aiNode") {
        data = { label: "Resposta IA", aiPrompt: "", aiModel: "gpt-4o" };
      } else {
        data = {
          label: "Nova Mensagem",
          text: "",
          imageUrl: "",
          imageCaption: "",
          delay: 0,
          buttons: [],
        };
      }

      const newNode: Node<FlowNodeData> = { id, type, position, data };
      setNodes((nds) => nds.concat(newNode));
      setSelectedNodeId(id);
      setEdgeMenu(null);
    },
    [screenToFlowPosition, nodes, rememberHistory]
  );

  const updateNodeData = useCallback(
    (id: string, newData: Partial<FlowNodeData>) => {
      rememberHistory();
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...newData } } : n))
      );
    },
    [rememberHistory]
  );

  const deleteNode = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.id === id);
      if (node?.type === "startNode") {
        toast.error("O bloco de Início não pode ser removido");
        return;
      }

      rememberHistory();
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      if (selectedNodeId === id) setSelectedNodeId(null);
    },
    [rememberHistory, selectedNodeId, nodes]
  );

  const duplicateNode = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.id === id);
      if (!node || node.type === "startNode") return;

      rememberHistory();

      const newId = nextNodeId(node.type || "node");
      const nodeData = node.data as FlowNodeData;
      const newNode: Node<FlowNodeData> = {
        ...node,
        id: newId,
        position: { x: node.position.x + 50, y: node.position.y + 50 },
        data: {
          ...nodeData,
          label: `${nodeData.label} (cópia)`,
          buttons: nodeData.buttons?.map((b) => ({ ...b, id: nextBtnId() })),
        },
        selected: false,
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [nodes, rememberHistory]
  );

  const removeEdge = useCallback(
    (edgeId: string) => {
      rememberHistory();
      setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
      setEdgeMenu(null);
      toast.success("Conexão removida");
    },
    [rememberHistory]
  );

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-muted-foreground/50">Carregando fluxo...</div>
      </div>
    );
  }

  return (
    <div className="flow-builder-fullscreen flex flex-col h-full w-full overflow-hidden">
      <FlowHeader
        flowId={flowId}
        name={flowName}
        onNameChange={setFlowName}
        isActive={isActive}
        onToggleActive={setIsActive}
        onSave={handleSave}
        saving={saving}
        deviceId={deviceId}
        onDeviceChange={setDeviceId}
        nodes={nodes}
        edges={edges as { id: string; source: string; target: string }[]}
        isDirty={isDirty}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <FlowSidebar hasStartNode={nodes.some((n) => n.type === "startNode")} />
        <div className="flex-1 min-w-0 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onNodeClick={onNodeClick}
            onEdgeContextMenu={onEdgeContextMenu}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
            deleteKeyCode={["Backspace", "Delete"]}
            panOnDrag={[2]}
            selectionOnDrag
            edgesReconnectable
            className="bg-background"
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-[hsl(var(--background))]" color="hsl(var(--muted-foreground) / 0.1)" />
            <Controls
              showInteractive={false}
              className="!bg-card !border !border-white/[0.06] !shadow-lg !rounded-lg !overflow-hidden [&>button]:!bg-transparent [&>button]:!border-b [&>button]:!border-white/[0.04] [&>button]:!text-muted-foreground/50 [&>button:hover]:!bg-white/[0.04] [&>button:hover]:!text-foreground [&>button]:!transition-colors [&>button]:!duration-100 [&>button:last-child]:!border-b-0 [&>button]:!w-6 [&>button]:!h-6"
            />
          </ReactFlow>

          {dropMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setDropMenu(null)} />
              <div
                className="fixed z-50 animate-in fade-in zoom-in-95 duration-100"
                style={{
                  left: dropMenu.x + 8,
                  top: dropMenu.y - 20,
                }}
              >
                <div className="bg-card border border-white/[0.08] rounded-lg shadow-2xl p-1 min-w-[160px]">
                  <p className="text-[8px] uppercase tracking-[0.15em] text-muted-foreground/30 font-bold px-2.5 pt-1.5 pb-1">
                    Adicionar
                  </p>
                  {[
                    { type: "messageNode" as const, label: "Mensagem", icon: MessageSquare, color: "text-primary", bg: "bg-primary/12", hover: "hover:bg-primary/8" },
                    { type: "aiNode" as const, label: "IA", icon: Bot, color: "text-cyan-400", bg: "bg-cyan-500/12", hover: "hover:bg-cyan-500/8" },
                    { type: "conditionNode" as const, label: "Condição", icon: GitBranch, color: "text-violet-400", bg: "bg-violet-500/12", hover: "hover:bg-violet-500/8" },
                    { type: "delayNode" as const, label: "Delay", icon: Timer, color: "text-amber-400", bg: "bg-amber-500/12", hover: "hover:bg-amber-500/8" },
                    { type: "endNode" as const, label: "Finalizar", icon: Square, color: "text-rose-400", bg: "bg-rose-500/12", hover: "hover:bg-rose-500/8" },
                  ].map((item) => (
                    <button
                      key={item.type}
                      onClick={() => createNodeFromMenu(item.type)}
                      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-[11px] text-foreground/70 ${item.hover} transition-colors`}
                    >
                      <div className={`w-5 h-5 rounded ${item.bg} flex items-center justify-center`}>
                        <item.icon className={`w-3 h-3 ${item.color}`} />
                      </div>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {edgeMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setEdgeMenu(null)} />
              <div
                className="fixed z-50 animate-in fade-in zoom-in-95 duration-100"
                style={{ left: edgeMenu.x, top: edgeMenu.y }}
              >
                <div className="bg-card border border-white/[0.08] rounded-lg shadow-2xl p-1 min-w-[150px]">
                  <button
                    onClick={() => removeEdge(edgeMenu.edgeId)}
                    className="flex items-center gap-2 w-full px-2.5 py-2 rounded text-[11px] text-foreground/75 hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="w-5 h-5 rounded bg-destructive/10 flex items-center justify-center">
                      <Unplug className="w-3 h-3 text-destructive" />
                    </div>
                    Desconectar
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        {selectedNode && (
          <EditPanel
            node={selectedNode}
            onUpdate={updateNodeData}
            onDelete={deleteNode}
            onDuplicate={duplicateNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  );
}

export default function AutoReply() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
