import { Node } from "@xyflow/react";
import {
  X, Trash2, Copy, Plus, FileText, Unlink, ExternalLink,
  Image, Mic, Paperclip, MessageSquare, Link2, Phone,
  Clock, Hash, Bot, Zap, ChevronRight, MessageCircleReply,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FlowNodeData, FlowButton, FlowCondition, MessageMediaType, FlowButtonType } from "./types";
import { nextBtnId, nextCondId } from "./types";
import { MessagePreview } from "./MessagePreview";
import { MediaUpload } from "./MediaUpload";
import { useTemplates, type Template } from "@/hooks/useTemplates";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

interface Props {
  node: Node<FlowNodeData>;
  onUpdate: (id: string, data: Partial<FlowNodeData>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onClose: () => void;
}

const variables = ["{nome}", "{numero}", "{email}", "{empresa}"];

const BTN_TYPES: { value: FlowButtonType; label: string; icon: any; hint: string; color: string }[] = [
  { value: "reply",  label: "Resposta rápida", icon: MessageCircleReply, hint: "Conecta ao próximo bloco do fluxo",    color: "text-blue-400"    },
  { value: "url",    label: "Abrir link",       icon: Link2,              hint: "Abre um site no navegador",           color: "text-violet-400"  },
  { value: "phone",  label: "Abrir WhatsApp",   icon: Phone,              hint: "Inicia conversa com outro número",    color: "text-emerald-400" },
];

const MEDIA_TABS: { value: MessageMediaType; label: string; icon: any }[] = [
  { value: "none",        label: "Nenhuma",   icon: MessageSquare },
  { value: "image",       label: "Imagem",    icon: Image         },
  { value: "audio",       label: "Áudio",     icon: Mic           },
  { value: "file",        label: "Arquivo",   icon: Paperclip     },
];

export function EditPanel({ node, onUpdate, onDelete, onDuplicate, onClose }: Props) {
  const d = node.data;
  const isStart     = node.type === "startNode";
  const isEnd       = node.type === "endNode";
  const isMessage   = node.type === "messageNode";
  const isDelay     = node.type === "delayNode";
  const isCondition = node.type === "conditionNode";
  const isAI        = node.type === "aiNode";
  const isAction    = node.type === "actionNode";
  const isWait      = node.type === "waitResponseNode";
  const isRandom    = node.type === "randomNode";

  const navigate = useNavigate();
  const { data: templatesList } = useTemplates();
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [expandedBtn, setExpandedBtn] = useState<string | null>(null);

  const isUsingModel = !!d.templateId;
  const mediaType = (d.mediaType || (d.imageUrl ? "image" : "none")) as MessageMediaType;

  const setMediaType = (type: MessageMediaType) => {
    onUpdate(node.id, {
      mediaType: type,
      imageUrl: type !== "image" ? "" : d.imageUrl,
      audioUrl: type !== "audio" ? "" : d.audioUrl,
      fileUrl:  type !== "file"  ? "" : d.fileUrl,
      fileName: type !== "file"  ? "" : d.fileName,
    });
  };

  const insertVariable = (v: string) => {
    onUpdate(node.id, { text: (d.text || "") + v });
  };

  const addButton = () => {
    const newBtn: FlowButton = { id: nextBtnId(), label: "Botão", type: "reply", targetNodeId: "" };
    onUpdate(node.id, { buttons: [...(d.buttons || []), newBtn] });
    setExpandedBtn(newBtn.id);
  };

  const updateButton = (btnId: string, patch: Partial<FlowButton>) => {
    onUpdate(node.id, {
      buttons: (d.buttons || []).map((b) => b.id === btnId ? { ...b, ...patch } : b),
    });
  };

  const removeButton = (btnId: string) => {
    onUpdate(node.id, { buttons: (d.buttons || []).filter((b) => b.id !== btnId) });
    if (expandedBtn === btnId) setExpandedBtn(null);
  };

  const selectModel = (template: Template) => {
    const buttons: FlowButton[] = (template.buttons || []).map((btn: any, i: number) => ({
      id: nextBtnId(),
      label: typeof btn === "string" ? btn : btn.label || btn.text || btn.title || `Botão ${i + 1}`,
      type: "reply" as FlowButtonType,
      targetNodeId: "",
    }));
    onUpdate(node.id, {
      label: isStart ? template.name : d.label,
      templateId: template.id,
      templateName: template.name,
      text: template.content,
      imageUrl: template.media_url || "",
      mediaType: template.media_url ? "image" : "none",
      buttons,
    });
    setShowModelPicker(false);
  };

  const unlinkModel = () => {
    onUpdate(node.id, {
      templateId: undefined,
      templateName: undefined,
      ...(isStart ? { text: "", imageUrl: "", mediaType: "none", buttons: [] } : {}),
    });
  };

  // ── Helpers ──────────────────────────────────────────────

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-semibold">{children}</p>
  );

  const renderModelPicker = () => {
    if (!showModelPicker) return null;
    return (
      <div className="rounded-xl border border-border/40 bg-card/80 overflow-hidden">
        <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground/60">Selecionar modelo</span>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowModelPicker(false)}>
            <X className="w-3 h-3" />
          </Button>
        </div>
        <ScrollArea className="max-h-[220px]">
          {!templatesList || templatesList.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-xs text-muted-foreground/50 mb-2">Nenhum modelo cadastrado</p>
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => navigate("/dashboard/templates")}>
                Ir para Modelos
              </Button>
            </div>
          ) : (
            <div className="p-1.5 space-y-1">
              {templatesList.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => selectModel(tpl)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors group/item ${d.templateId === tpl.id ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <FileText className="w-3 h-3 text-muted-foreground/40 group-hover/item:text-primary/60" />
                    <span className="text-xs font-medium text-foreground truncate">{tpl.name}</span>
                    {tpl.buttons && Array.isArray(tpl.buttons) && tpl.buttons.length > 0 && (
                      <Badge variant="outline" className="text-[9px] px-1.5 h-4 border-border/30 text-muted-foreground/40 ml-auto shrink-0">
                        {tpl.buttons.length} botão{tpl.buttons.length !== 1 ? "ões" : ""}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground/40 line-clamp-1 pl-5">{tpl.content}</p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    );
  };

  const renderLinkedModel = () => {
    if (!isUsingModel) return null;
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-3.5 h-3.5 text-primary/70 shrink-0" />
            <span className="text-xs font-medium text-foreground truncate">{d.templateName}</span>
          </div>
          <Badge variant="outline" className="text-[9px] px-1.5 h-4 border-primary/20 text-primary/60 bg-primary/5 shrink-0">
            Vinculado
          </Badge>
        </div>
        {isStart && <MessagePreview data={d} />}
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 flex-1 border-border/40" onClick={() => setShowModelPicker(true)}>
            Trocar modelo
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 border-border/40" onClick={unlinkModel}>
            <Unlink className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 border-border/40" onClick={() => navigate("/dashboard/templates")}>
            <ExternalLink className="w-3 h-3" />
          </Button>
        </div>
      </div>
    );
  };

  // ── Main ─────────────────────────────────────────────────

  return (
    <div className="w-[340px] shrink-0 border-l border-border/40 bg-card/50 backdrop-blur-sm flex flex-col max-h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 bg-card/80 backdrop-blur-sm z-10 shrink-0">
        <h3 className="text-[13px] font-semibold text-foreground">Editar Bloco</h3>
        <div className="flex items-center gap-0.5">
          {!isStart && (
            <>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground/50 hover:text-foreground" onClick={() => onDuplicate(node.id)}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground/50 hover:text-destructive" onClick={() => onDelete(node.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground/50 hover:text-foreground" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5 space-y-5">

          {/* Block name */}
          <div className="space-y-2">
            <SectionLabel>Nome do bloco</SectionLabel>
            <Input
              value={d.label}
              onChange={(e) => onUpdate(node.id, { label: e.target.value })}
              className="h-9 text-sm"
              placeholder="Ex: Boas-vindas"
            />
          </div>

          {/* ── START NODE ─────────────────────────── */}
          {isStart && (
            <>
              <div className="space-y-2">
                <SectionLabel>Tipo de gatilho</SectionLabel>
                <Select
                  value={d.trigger || "keyword"}
                  onValueChange={(v) => {
                    const updates: Partial<FlowNodeData> = { trigger: v as any };
                    if (v === "template") {
                      updates.label = "Template";
                      updates.keyword = "";
                    } else {
                      updates.label = "Início";
                      updates.templateId = undefined;
                      updates.templateName = undefined;
                      updates.text = "";
                      updates.imageUrl = "";
                      updates.mediaType = "none";
                      updates.buttons = [];
                    }
                    onUpdate(node.id, updates);
                  }}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keyword">
                      <div className="flex items-center gap-2"><Hash className="w-3.5 h-3.5" /> Palavra-chave</div>
                    </SelectItem>
                    <SelectItem value="template">
                      <div className="flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Template disparado</div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {d.trigger === "keyword" && (
                <div className="space-y-2">
                  <SectionLabel>Palavra-chave</SectionLabel>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
                    <Input
                      placeholder="oi, olá, bom dia"
                      value={d.keyword || ""}
                      onChange={(e) => onUpdate(node.id, { keyword: e.target.value })}
                      className="h-9 text-sm pl-8"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground/40">
                    Separe múltiplas palavras com vírgula. O fluxo inicia quando qualquer uma for enviada.
                  </p>
                </div>
              )}

              {d.trigger === "template" && (
                <div className="space-y-2">
                  <SectionLabel>Modelo vinculado</SectionLabel>
                  {isUsingModel ? renderLinkedModel() : (
                    <div className="rounded-xl border border-dashed border-border/50 p-4 text-center space-y-2">
                      <FileText className="w-6 h-6 text-muted-foreground/30 mx-auto" />
                      <p className="text-xs text-muted-foreground/50">Nenhum modelo selecionado</p>
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-border/40 hover:border-primary/40 hover:text-primary" onClick={() => setShowModelPicker(true)}>
                        <FileText className="w-3 h-3" /> Selecionar modelo
                      </Button>
                    </div>
                  )}
                  {renderModelPicker()}
                </div>
              )}
            </>
          )}

          {/* ── DELAY NODE ─────────────────────────── */}
          {isDelay && (
            <div className="space-y-3">
              <SectionLabel>Tempo de espera</SectionLabel>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-orange-400/60" />
                  <Input
                    type="number"
                    min={1}
                    max={3600}
                    value={d.delaySeconds ?? 5}
                    onChange={(e) => onUpdate(node.id, { delaySeconds: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="h-9 text-sm pl-8"
                  />
                </div>
                <span className="text-sm text-muted-foreground/60 shrink-0">segundos</span>
              </div>
              <div className="flex gap-2">
                {[5, 10, 30, 60].map((s) => (
                  <button
                    key={s}
                    onClick={() => onUpdate(node.id, { delaySeconds: s })}
                    className={`flex-1 py-1.5 text-[11px] font-medium rounded-lg border transition-colors
                      ${(d.delaySeconds ?? 5) === s
                        ? "bg-orange-500/12 border-orange-500/30 text-orange-400"
                        : "border-border/30 text-muted-foreground/50 hover:border-border/60"
                      }`}
                  >
                    {s < 60 ? `${s}s` : `${s / 60}min`}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/40">
                O fluxo aguardará antes de enviar o próximo bloco.
              </p>
            </div>
          )}

          {/* ── END NODE ───────────────────────────── */}
          {isEnd && (
            <div className="space-y-2">
              <SectionLabel>Ação final</SectionLabel>
              <Select value={d.action || "end_flow"} onValueChange={(v) => onUpdate(node.id, { action: v as any })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="end_flow">Encerrar fluxo</SelectItem>
                  <SelectItem value="wait_response">Aguardar resposta</SelectItem>
                  <SelectItem value="transfer_human">Transferir para humano</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground/40">
                Define o que acontece quando o contato chega neste bloco.
              </p>
            </div>
          )}

          {/* ── AI NODE ────────────────────────────── */}
          {isAI && (
            <div className="space-y-3">
              <SectionLabel>Instruções para a IA</SectionLabel>
              <div className="relative">
                <Bot className="absolute left-3 top-3 w-3.5 h-3.5 text-cyan-400/60" />
                <Textarea
                  value={d.aiPrompt || ""}
                  onChange={(e) => onUpdate(node.id, { aiPrompt: e.target.value })}
                  placeholder="Ex: Responda de forma amigável e ofereça ajuda sobre nossos produtos. Se perguntar sobre preço, informe que depende do pedido."
                  className="min-h-[120px] text-sm resize-none pl-8 pt-2.5"
                />
              </div>
              <div className="rounded-lg bg-cyan-500/5 border border-cyan-500/15 p-3 space-y-1">
                <p className="text-[10px] font-semibold text-cyan-400/70">Dica</p>
                <p className="text-[10px] text-muted-foreground/50">
                  Seja específico: diga o tom (formal/informal), o que pode e não pode informar, e como encerrar o atendimento.
                </p>
              </div>
            </div>
          )}

          {/* ── CONDITION NODE ─────────────────────── */}
          {isCondition && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <SectionLabel>Condições</SectionLabel>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground/60 hover:text-foreground"
                  onClick={() => {
                    const newCond: FlowCondition = {
                      id: nextCondId(), label: "", variable: "mensagem", operator: "contains", value: "",
                    };
                    onUpdate(node.id, { conditions: [...(d.conditions || []), newCond] });
                  }}
                >
                  <Plus className="w-3 h-3 mr-1" /> Adicionar
                </Button>
              </div>

              {(d.conditions || []).length === 0 && (
                <div className="rounded-xl border border-dashed border-border/30 p-4 text-center">
                  <p className="text-[11px] text-muted-foreground/40">
                    Nenhuma condição. O fluxo sempre seguirá pela saída "Senão".
                  </p>
                </div>
              )}

              {(d.conditions || []).map((cond, i) => (
                <div key={cond.id} className="space-y-2 rounded-xl border border-border/30 p-3 bg-card/30">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-violet-400">Condição {i + 1}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground/30 hover:text-destructive"
                      onClick={() => onUpdate(node.id, { conditions: (d.conditions || []).filter((c) => c.id !== cond.id) })}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <Input
                    value={cond.label}
                    onChange={(e) => onUpdate(node.id, { conditions: (d.conditions || []).map((c) => c.id === cond.id ? { ...c, label: e.target.value } : c) })}
                    placeholder="Nome da condição (ex: Cliente disse sim)"
                    className="h-8 text-xs"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={cond.variable} onValueChange={(v) => onUpdate(node.id, { conditions: (d.conditions || []).map((c) => c.id === cond.id ? { ...c, variable: v } : c) })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mensagem">Mensagem</SelectItem>
                        <SelectItem value="nome">Nome</SelectItem>
                        <SelectItem value="numero">Número</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={cond.operator} onValueChange={(v) => onUpdate(node.id, { conditions: (d.conditions || []).map((c) => c.id === cond.id ? { ...c, operator: v as any } : c) })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contains">Contém</SelectItem>
                        <SelectItem value="equals">É igual a</SelectItem>
                        <SelectItem value="starts_with">Começa com</SelectItem>
                        <SelectItem value="ends_with">Termina com</SelectItem>
                        <SelectItem value="not_equals">Diferente de</SelectItem>
                        <SelectItem value="exists">Existe</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {cond.operator !== "exists" && (
                    <Input
                      value={cond.value}
                      onChange={(e) => onUpdate(node.id, { conditions: (d.conditions || []).map((c) => c.id === cond.id ? { ...c, value: e.target.value } : c) })}
                      placeholder="Valor para comparar"
                      className="h-8 text-xs"
                    />
                  )}
                </div>
              ))}

              {(d.conditions || []).length > 0 && (
                <p className="text-[10px] text-muted-foreground/40">
                  Cada condição gera uma saída. A saída "Senão" é usada quando nenhuma condição for atendida.
                </p>
              )}
            </div>
          )}

          {/* ── WAIT RESPONSE NODE ─────────────────── */}
          {isWait && (
            <>
              <div className="space-y-2">
                <SectionLabel>Salvar resposta como variável</SectionLabel>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/40 font-mono">{`{`}</span>
                  <Input
                    value={d.saveReplyAs || ""}
                    onChange={(e) => onUpdate(node.id, { saveReplyAs: e.target.value.replace(/[^a-z0-9_]/gi, "") })}
                    placeholder="nome, resposta, escolha..."
                    className="h-9 text-sm pl-6 pr-6"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/40 font-mono">{`}`}</span>
                </div>
                <p className="text-[10px] text-muted-foreground/40">
                  A resposta do contato ficará salva nessa variável para usar nos próximos blocos.
                </p>
              </div>

              <div className="space-y-2">
                <SectionLabel>Timeout (sem resposta)</SectionLabel>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sky-400/60" />
                    <Input
                      type="number"
                      min={0}
                      value={d.waitTimeoutSeconds ?? 0}
                      onChange={(e) => onUpdate(node.id, { waitTimeoutSeconds: parseInt(e.target.value) || 0 })}
                      className="h-9 text-sm pl-8"
                    />
                  </div>
                  <span className="text-sm text-muted-foreground/60 shrink-0">segundos</span>
                </div>
                <p className="text-[10px] text-muted-foreground/40">
                  0 = aguarda indefinidamente. Se houver timeout, seguirá pela saída "Se não responder".
                </p>
              </div>
            </>
          )}

          {/* ── MESSAGE NODE ────────────────────────── */}
          {isMessage && (
            <>
              {/* Template selector */}
              <div className="space-y-2">
                <SectionLabel>Modelo de mensagem (opcional)</SectionLabel>
                {isUsingModel ? (
                  <div className="space-y-3">
                    {renderLinkedModel()}
                    <MessagePreview data={d} />
                  </div>
                ) : (
                  <button
                    onClick={() => setShowModelPicker(true)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border/40 hover:border-border/70 hover:bg-muted/20 transition-all text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground/50" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground/70">Usar modelo existente</p>
                      <p className="text-[10px] text-muted-foreground/40">Importar texto e mídia de um template</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
                  </button>
                )}
                {renderModelPicker()}
              </div>

              {/* Mensagem de texto */}
              <div className="space-y-2">
                <SectionLabel>Mensagem</SectionLabel>
                <Textarea
                  value={d.text || ""}
                  onChange={(e) => onUpdate(node.id, { text: e.target.value })}
                  className="min-h-[110px] text-sm resize-none"
                  placeholder="Digite a mensagem que será enviada..."
                />
                <div className="flex flex-wrap gap-1.5">
                  {variables.map((v) => (
                    <button
                      key={v}
                      onClick={() => insertVariable(v)}
                      className="text-[10px] font-mono px-2 py-1 rounded-lg bg-primary/6 text-primary/70 hover:bg-primary/12 hover:text-primary transition-colors border border-primary/10"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mídia */}
              <div className="space-y-2">
                <SectionLabel>Mídia</SectionLabel>

                {/* Type tabs */}
                <div className="grid grid-cols-4 gap-1 p-1 bg-muted/20 rounded-xl border border-border/30">
                  {MEDIA_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const active = mediaType === tab.value;
                    return (
                      <button
                        key={tab.value}
                        onClick={() => setMediaType(tab.value)}
                        className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-medium transition-all
                          ${active
                            ? "bg-card shadow-sm text-foreground border border-border/40"
                            : "text-muted-foreground/50 hover:text-muted-foreground/80"
                          }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${active ? "text-primary" : ""}`} />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Upload area */}
                {mediaType === "image" && (
                  <MediaUpload
                    kind="image"
                    url={d.imageUrl || ""}
                    onChange={(url) => onUpdate(node.id, { imageUrl: url, mediaType: "image" })}
                    onRemove={() => onUpdate(node.id, { imageUrl: "", mediaType: "none" })}
                  />
                )}
                {mediaType === "audio" && (
                  <MediaUpload
                    kind="audio"
                    url={d.audioUrl || ""}
                    onChange={(url) => onUpdate(node.id, { audioUrl: url, mediaType: "audio" })}
                    onRemove={() => onUpdate(node.id, { audioUrl: "", mediaType: "none" })}
                  />
                )}
                {mediaType === "file" && (
                  <MediaUpload
                    kind="file"
                    url={d.fileUrl || ""}
                    fileName={d.fileName}
                    onChange={(url, name) => onUpdate(node.id, { fileUrl: url, fileName: name, mediaType: "file" })}
                    onRemove={() => onUpdate(node.id, { fileUrl: "", fileName: "", mediaType: "none" })}
                  />
                )}

                {/* Caption for image */}
                {mediaType === "image" && d.imageUrl && (
                  <Input
                    value={d.imageCaption || ""}
                    onChange={(e) => onUpdate(node.id, { imageCaption: e.target.value })}
                    placeholder="Legenda da imagem (opcional)"
                    className="h-9 text-sm"
                  />
                )}
              </div>

              {/* Delay de envio */}
              <div className="space-y-2">
                <SectionLabel>Delay antes de enviar</SectionLabel>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-400/60" />
                    <Input
                      type="number"
                      min={0}
                      value={d.delay || 0}
                      onChange={(e) => onUpdate(node.id, { delay: parseInt(e.target.value) || 0 })}
                      className="h-9 text-sm pl-8"
                    />
                  </div>
                  <span className="text-sm text-muted-foreground/60 shrink-0">seg</span>
                </div>
                <p className="text-[10px] text-muted-foreground/40">
                  Simula digitação. 0 = envia imediatamente.
                </p>
              </div>

              {/* Botões interativos */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <SectionLabel>Botões interativos</SectionLabel>
                  {(d.buttons || []).length < 3 && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground/60 hover:text-foreground" onClick={addButton}>
                      <Plus className="w-3 h-3 mr-1" /> Adicionar
                    </Button>
                  )}
                </div>

                {(d.buttons || []).length === 0 && (
                  <div className="rounded-xl border border-dashed border-border/30 p-4 text-center space-y-2">
                    <div className="flex justify-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <MessageCircleReply className="w-3.5 h-3.5 text-blue-400/60" />
                      </div>
                      <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                        <Link2 className="w-3.5 h-3.5 text-violet-400/60" />
                      </div>
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <Phone className="w-3.5 h-3.5 text-emerald-400/60" />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground/40">
                      Adicione até 3 botões interativos
                    </p>
                    <p className="text-[10px] text-muted-foreground/30">
                      Resposta rápida · Abrir link · Abrir WhatsApp
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  {(d.buttons || []).map((btn, i) => {
                    const meta = BTN_TYPES.find((t) => t.value === (btn.type || "reply")) || BTN_TYPES[0];
                    const BtnIcon = meta.icon;
                    const isExpanded = expandedBtn === btn.id;
                    return (
                      <div key={btn.id} className="rounded-xl border border-border/30 overflow-hidden bg-card/30">
                        {/* Collapsed header */}
                        <div
                          className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors"
                          onClick={() => setExpandedBtn(isExpanded ? null : btn.id)}
                        >
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0
                            ${btn.type === "url"   ? "bg-violet-500/10"  :
                              btn.type === "phone" ? "bg-emerald-500/10" :
                                                     "bg-blue-500/10"}`}
                          >
                            <BtnIcon className={`w-3 h-3 ${meta.color}`} />
                          </div>
                          <span className="flex-1 text-xs font-medium text-foreground/80 truncate">
                            {btn.label || `Botão ${i + 1}`}
                          </span>
                          <Badge variant="outline" className="text-[9px] px-1.5 h-4 border-border/30 text-muted-foreground/40 shrink-0">
                            {meta.label}
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground/30 hover:text-destructive shrink-0"
                            onClick={(e) => { e.stopPropagation(); removeButton(btn.id); }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>

                        {/* Expanded editor */}
                        {isExpanded && (
                          <div className="border-t border-border/30 px-3 py-3 space-y-3">
                            {/* Button type selector */}
                            <div className="space-y-1.5">
                              <p className="text-[10px] text-muted-foreground/40 font-medium">Tipo do botão</p>
                              <div className="space-y-1.5">
                                {BTN_TYPES.map((t) => {
                                  const TIcon = t.icon;
                                  const active = (btn.type || "reply") === t.value;
                                  return (
                                    <button
                                      key={t.value}
                                      onClick={() => updateButton(btn.id, { type: t.value })}
                                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all text-left
                                        ${active
                                          ? "border-primary/30 bg-primary/5"
                                          : "border-border/20 hover:border-border/50 hover:bg-muted/20"
                                        }`}
                                    >
                                      <TIcon className={`w-3.5 h-3.5 shrink-0 ${t.color}`} />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[11px] font-medium text-foreground/80">{t.label}</p>
                                        <p className="text-[10px] text-muted-foreground/40">{t.hint}</p>
                                      </div>
                                      {active && <CheckCircle2 className="w-3.5 h-3.5 text-primary/60 shrink-0" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Button label */}
                            <div className="space-y-1.5">
                              <p className="text-[10px] text-muted-foreground/40 font-medium">Texto do botão</p>
                              <Input
                                value={btn.label}
                                onChange={(e) => updateButton(btn.id, { label: e.target.value })}
                                placeholder="Ex: Sim, quero!"
                                className="h-8 text-xs"
                                maxLength={20}
                              />
                              <p className="text-[9px] text-muted-foreground/30 text-right">{btn.label.length}/20 caracteres</p>
                            </div>

                            {/* URL field */}
                            {btn.type === "url" && (
                              <div className="space-y-1.5">
                                <p className="text-[10px] text-muted-foreground/40 font-medium">URL do link</p>
                                <div className="relative">
                                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-violet-400/60" />
                                  <Input
                                    value={btn.url || ""}
                                    onChange={(e) => updateButton(btn.id, { url: e.target.value })}
                                    placeholder="https://seusite.com"
                                    className="h-8 text-xs pl-8"
                                  />
                                </div>
                              </div>
                            )}

                            {/* Phone field */}
                            {btn.type === "phone" && (
                              <div className="space-y-1.5">
                                <p className="text-[10px] text-muted-foreground/40 font-medium">Número de telefone</p>
                                <div className="relative">
                                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-emerald-400/60" />
                                  <Input
                                    value={btn.phone || ""}
                                    onChange={(e) => updateButton(btn.id, { phone: e.target.value.replace(/\D/g, "") })}
                                    placeholder="5511999999999"
                                    className="h-8 text-xs pl-8"
                                  />
                                </div>
                                <p className="text-[9px] text-muted-foreground/30">
                                  Código do país + DDD + número (ex: 5511999999999)
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {(d.buttons || []).length > 0 && (d.buttons || []).length < 3 && (
                  <p className="text-[10px] text-muted-foreground/30 text-center">
                    {3 - (d.buttons || []).length} botão{3 - (d.buttons || []).length !== 1 ? "ões" : ""} restante{3 - (d.buttons || []).length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>

              {/* Preview */}
              {(d.text || d.imageUrl || d.audioUrl || d.fileUrl || (d.buttons && d.buttons.length > 0)) && (
                <div className="space-y-2">
                  <SectionLabel>Preview</SectionLabel>
                  <MessagePreview data={d} />
                </div>
              )}
            </>
          )}

        </div>
      </ScrollArea>
    </div>
  );
}
