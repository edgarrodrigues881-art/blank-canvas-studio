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
import { ConditionNode } from "@/components/autoreply/ConditionNode";
import { AINode } from "@/components/autoreply/AINode";
import { FlowSidebar } from "@/components/autoreply/FlowSidebar";
import { EditPanel } from "@/components/autoreply/EditPanel";
import { FlowHeader } from "@/components/autoreply/FlowHeader";
import type { FlowNodeData, FlowCondition } from "@/components/autoreply/types";
import { nextNodeId, nextBtnId } from "@/components/autoreply/types";
import { MessageSquare, Square, Timer, GitBranch, Bot } from "lucide-react";
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
        navigate("/dashboard/conversations");
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
    (type: "messageNode" | "endNode" | "delayNode" | "conditionNode" | "aiNode") => {
      if (!dropMenu) return;

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
            fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
            deleteKeyCode={["Backspace", "Delete"]}
            className="bg-background"
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-[hsl(var(--background))]" color="hsl(var(--muted-foreground) / 0.1)" />
            <Controls
              showInteractive={false}
              className="!bg-card !border !border-white/[0.06] !shadow-lg !rounded-lg !overflow-hidden [&>button]:!bg-transparent [&>button]:!border-b [&>button]:!border-white/[0.04] [&>button]:!text-muted-foreground/50 [&>button:hover]:!bg-white/[0.04] [&>button:hover]:!text-foreground [&>button]:!transition-colors [&>button]:!duration-100 [&>button:last-child]:!border-b-0 [&>button]:!w-6 [&>button]:!h-6"
            />
          </ReactFlow>

          {/* Drop menu */}
          {dropMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setDropMenu(null)} />
              <div
                className="fixed z-50 animate-in fade-in zoom-in-95 duration-100"
                style={{
                  left: dropMenu.x,
                  top: dropMenu.y,
                  transform: "translate(-50%, -50%)",
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
