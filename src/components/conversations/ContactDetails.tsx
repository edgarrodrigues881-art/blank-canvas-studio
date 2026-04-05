import {
  X,
  Phone,
  Mail,
  Tag,
  Smartphone,
  StickyNote,
  Calendar,
  MessageSquare,
  Star,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type Conversation } from "./types";
import { cn } from "@/lib/utils";

interface ContactDetailsProps {
  conversation: Conversation;
  onClose: () => void;
}

export function ContactDetails({ conversation, onClose }: ContactDetailsProps) {
  const infoItems = [
    { icon: Phone, label: "Telefone", value: conversation.phone },
    conversation.email ? { icon: Mail, label: "Email", value: conversation.email } : null,
    conversation.deviceName ? { icon: Smartphone, label: "Instância", value: conversation.deviceName } : null,
  ].filter(Boolean) as { icon: any; label: string; value: string }[];

  return (
    <>
      {/* Header */}
      <div className="h-[60px] border-b border-border flex items-center justify-between px-4 shrink-0">
        <h3 className="text-sm font-semibold text-foreground">Detalhes do contato</h3>
        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Avatar + Name */}
          <div className="flex flex-col items-center text-center space-y-2">
            {conversation.avatar_url ? (
              <img src={conversation.avatar_url} alt={conversation.name} className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-lg font-bold text-primary">{conversation.name.slice(0, 2).toUpperCase()}</span>
              </div>
            )}
            <div>
              <p className="text-sm font-bold text-foreground">{conversation.name}</p>
              <p className="text-xs text-muted-foreground">{conversation.phone}</p>
            </div>
            <div className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold",
              conversation.status === "online" ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
            )}>
              <span className={cn("w-1.5 h-1.5 rounded-full", conversation.status === "online" ? "bg-emerald-500" : "bg-muted-foreground/50")} />
              {conversation.status === "online" ? "Online" : "Offline"}
            </div>
          </div>

          <Separator />

          {/* Quick Actions */}
          <div className="flex justify-center gap-3">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
              <Star className="w-3.5 h-3.5" /> Favoritar
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
              <ExternalLink className="w-3.5 h-3.5" /> Ver perfil
            </Button>
          </div>

          <Separator />

          {/* Info */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Informações</h4>
            {infoItems.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <item.icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground">{item.label}</p>
                  <p className="text-xs font-medium text-foreground">{item.value}</p>
                </div>
              </div>
            ))}
          </div>

          <Separator />

          {/* Tags */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tags</h4>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary">
                <Tag className="w-3 h-3 mr-1" /> Adicionar
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {conversation.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-2 py-0.5 font-medium">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notas</h4>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary">
                <StickyNote className="w-3 h-3 mr-1" /> Adicionar
              </Button>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
              <p className="text-xs text-muted-foreground italic">
                {conversation.notes || "Nenhuma nota adicionada"}
              </p>
            </div>
          </div>
        </div>
      </ScrollArea>
    </>
  );
}
