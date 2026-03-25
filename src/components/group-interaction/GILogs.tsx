import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollText, ChevronDown, CheckCircle2, XCircle } from "lucide-react";
import type { GroupInteractionLog } from "@/hooks/useGroupInteraction";

const PAGE_SIZE = 20;

export default function GILogs({ logs }: { logs: GroupInteractionLog[] }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visible = logs.slice(0, visibleCount);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-primary" />
            Histórico de Execução
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {logs.length} registros
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum log registrado ainda
          </p>
        ) : (
          <>
            <ScrollArea className="h-[320px]">
              <div className="space-y-1">
                {visible.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/20 transition-colors"
                  >
                    {log.status === "sent" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    )}
                    <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                      {new Date(log.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {log.group_name || log.group_id?.slice(0, 8)}
                    </span>
                    <span className="text-xs truncate flex-1">{log.message_content}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
            {visibleCount < logs.length && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2 gap-1 text-xs"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                <ChevronDown className="w-3.5 h-3.5" />
                Carregar mais ({logs.length - visibleCount} restantes)
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
