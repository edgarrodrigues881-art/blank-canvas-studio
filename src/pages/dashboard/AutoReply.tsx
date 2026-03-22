import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
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
import { FlowSidebar } from "@/components/autoreply/FlowSidebar";
import { EditPanel } from "@/components/autoreply/EditPanel";
import { FlowHeader } from "@/components/autoreply/FlowHeader";
import type { FlowNodeData } from "@/components/autoreply/types";
import { nextNodeId, nextBtnId } from "@/components/autoreply/types";
import { MessageSquare, Square, Timer } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const nodeTypes = {
  startNode: StartNode,
  messageNode: MessageNode,
  delayNode: DelayNode,
  endNode: EndNode,
};

const defaultEdgeOptions = {
  type: "smoothstep",
  animated: true,
  style: { stroke: "hsl(var(--primary) / 0.5)", strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary) / 0.6)", width: 16, height: 16 },
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

function FlowCanvas() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = id === "new";
  const [flowId, setFlowId] = useState<string | null>(isNew ? null : id || null);

  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState("Minha Automação");
  const [isActive, setIsActive] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [dropMenu, setDropMenu] = useState<DropMenu | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(isNew);
  const [isDirty, setIsDirty] = useState(false);
  const pendingConnection = useRef<{ source: string; sourceHandle: string } | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const initialLoadDone = useRef(false);

  // Track dirty state after initial load
  useEffect(() => {
    if (!initialLoadDone.current) return;
    setIsDirty(true);
  }, [nodes, edges, flowName, isActive, deviceId]);

  // Load existing flow
  useEffect(() => {
    if (isNew || !flowId || !user) {
      setLoaded(true);
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
        navigate("/dashboard/auto-reply");
        return;
      }
      setFlowName(data.name);
      setIsActive(data.is_active);
      setDeviceId((data as any).device_id || null);
      if (Array.isArray(data.nodes) && data.nodes.length > 0) {
        setNodes(data.nodes as any);
      }
      if (Array.isArray(data.edges)) {
        setEdges(data.edges as any);
      }
      setLoaded(true);
      // Mark initial load done after state settles
      setTimeout(() => { initialLoadDone.current = true; }, 100);
    })();
  }, [flowId, isNew, user]);

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
    if (!user) { toast.error("Faça login para salvar"); return; }
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

  const onConnect = useCallback(
    (params: Connection) => {
      pendingConnection.current = null;
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges]
  );

  const onConnectStart = useCallback((_: any, params: any) => {
    if (params.nodeId && params.handleId) {
      pendingConnection.current = { source: params.nodeId, sourceHandle: params.handleId };
    }
  }, []);

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (!pendingConnection.current) return;

      const targetIsNode = (event.target as HTMLElement)?.closest?.(".react-flow__node");
      const targetIsHandle = (event.target as HTMLElement)?.closest?.(".react-flow__handle");
      if (targetIsNode || targetIsHandle) {
        pendingConnection.current = null;
        return;
      }

      const clientX = "changedTouches" in event ? event.changedTouches[0].clientX : event.clientX;
      const clientY = "changedTouches" in event ? event.changedTouches[0].clientY : event.clientY;
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY });

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
    (type: "messageNode" | "endNode" | "delayNode") => {
      if (!dropMenu) return;

      const id = nextNodeId(type);
      let data: FlowNodeData;

      if (type === "endNode") {
        data = { label: "Finalizar", action: "end_flow" };
      } else if (type === "delayNode") {
        data = { label: "Temporizador", delaySeconds: 5 };
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
    [dropMenu, setNodes, setEdges]
  );

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setDropMenu(null);
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

      // Prevent dropping duplicate start nodes
      if (type === "startNode") {
        const hasStart = nodes.some((n) => n.type === "startNode");
        if (hasStart) {
          toast.error("Só é permitido um bloco de Início por fluxo");
          return;
        }
      }

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = nextNodeId(type);

      let data: FlowNodeData;
      if (type === "startNode") {
        data = { label: "Início", trigger: "keyword", keyword: "" };
      } else if (type === "endNode") {
        data = { label: "Finalizar", action: "end_flow" };
      } else if (type === "delayNode") {
        data = { label: "Temporizador", delaySeconds: 5 };
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
    },
    [screenToFlowPosition, setNodes, nodes]
  );

  const updateNodeData = useCallback(
    (id: string, newData: Partial<FlowNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...newData } } : n))
      );
    },
    [setNodes]
  );

  const deleteNode = useCallback(
    (id: string) => {
      // Prevent deleting the start node
      const node = nodes.find((n) => n.id === id);
      if (node?.type === "startNode") {
        toast.error("O bloco de Início não pode ser removido");
        return;
      }
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      if (selectedNodeId === id) setSelectedNodeId(null);
    },
    [setNodes, setEdges, selectedNodeId, nodes]
  );

  const duplicateNode = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.id === id);
      if (!node || node.type === "startNode") return;
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
    [nodes, setNodes]
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
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <FlowSidebar hasStartNode={nodes.some((n) => n.type === "startNode")} />
        <div ref={reactFlowWrapper} className="flex-1 min-w-0 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            deleteKeyCode={["Backspace", "Delete"]}
            className="bg-background"
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={0.8} className="!bg-background" color="hsl(var(--muted-foreground) / 0.08)" />
            <Controls
              showInteractive={false}
              className="!bg-card/90 !backdrop-blur-sm !border-border/50 !shadow-xl !rounded-2xl !overflow-hidden [&>button]:!bg-transparent [&>button]:!border-b [&>button]:!border-border/30 [&>button]:!text-muted-foreground [&>button:hover]:!bg-muted/50 [&>button:hover]:!text-foreground [&>button]:!transition-colors [&>button]:!duration-150 [&>button:last-child]:!border-b-0"
            />
          </ReactFlow>

          {/* Drop menu */}
          {dropMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setDropMenu(null)} />
              <div
                className="fixed z-50 animate-in fade-in zoom-in-95 duration-150"
                style={{
                  left: dropMenu.x,
                  top: dropMenu.y,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div className="bg-card/95 backdrop-blur-md border border-border/60 rounded-2xl shadow-2xl p-1.5 min-w-[180px]">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold px-3 pt-2 pb-1.5">
                    Adicionar bloco
                  </p>
                  <button
                    onClick={() => createNodeFromMenu("messageNode")}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm text-foreground hover:bg-primary/10 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                      <MessageSquare className="w-3.5 h-3.5 text-primary" />
                    </div>
                    Mensagem
                  </button>
                  <button
                    onClick={() => createNodeFromMenu("delayNode")}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm text-foreground hover:bg-amber-500/10 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <Timer className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                    Temporizador
                  </button>
                  <button
                    onClick={() => createNodeFromMenu("endNode")}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm text-foreground hover:bg-destructive/10 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center">
                      <Square className="w-3.5 h-3.5 text-destructive" />
                    </div>
                    Finalizar
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
