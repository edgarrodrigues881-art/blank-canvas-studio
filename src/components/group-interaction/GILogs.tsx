import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollText, ChevronDown } from "lucide-react";
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
              <div className="space-y-1.5">
                {visible.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/20 border border-border/50"
                  >
                    <div
                      className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        log.status === "sent" ? "bg-emerald-500" : "bg-red-500"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {new Date(log.sent_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                        <Badge variant="outline" className="text-[9px] capitalize">
                          {log.message_category}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground truncate">
                          Grupo: {log.group_name || log.group_id?.slice(0, 12)}
                        </span>
                      </div>
                      <p className="text-sm mt-0.5 truncate">{log.message_content}</p>
                      {log.error_message && (
                        <p className="text-xs text-red-400 mt-0.5">{log.error_message}</p>
                      )}
                    </div>
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
