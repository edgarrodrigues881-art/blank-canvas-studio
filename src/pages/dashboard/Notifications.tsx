import { useState, useMemo } from "react";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle2, AlertTriangle, XCircle, Info, CheckCheck, Trash2, Check, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const typeIcons = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

const typeColors = {
  success: "text-emerald-400",
  warning: "text-yellow-400",
  error: "text-destructive",
  info: "text-teal-400",
};

const typeBg = {
  success: "bg-emerald-500/10",
  warning: "bg-yellow-500/10",
  error: "bg-destructive/10",
  info: "bg-teal-500/10",
};

interface GroupedNotification extends Notification {
  count: number;
  groupedIds: string[];
}

const GROUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

const groupNotifications = (items: Notification[]): GroupedNotification[] => {
  const groups: GroupedNotification[] = [];

  for (const item of items) {
    const itemTime = new Date(item.created_at).getTime();
    // Find an existing group with same title+type within window
    const existing = groups.find((g) => {
      if (g.synthetic || item.synthetic) return false;
      if (g.type !== item.type) return false;
      if (g.title !== item.title) return false;
      const gTime = new Date(g.created_at).getTime();
      return Math.abs(gTime - itemTime) <= GROUP_WINDOW_MS;
    });

    if (existing) {
      existing.count += 1;
      existing.groupedIds.push(item.id);
      // Keep the most recent timestamp
      if (itemTime > new Date(existing.created_at).getTime()) {
        existing.created_at = item.created_at;
        existing.message = item.message;
      }
      // If any in the group is unread, keep group as unread
      if (!item.read) existing.read = false;
    } else {
      groups.push({ ...item, count: 1, groupedIds: [item.id] });
    }
  }

  return groups;
};

const Notifications = () => {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteOne,
    clearAll,
    systemNotificationsCount,
  } = useNotifications();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const grouped = useMemo(() => {
    const base = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;
    return groupNotifications(base);
  }, [notifications, filter]);

  const handleMarkRead = async (g: GroupedNotification) => {
    for (const id of g.groupedIds) {
      if (!id.startsWith("activity-")) await markAsRead(id);
    }
  };

  const handleDelete = async (g: GroupedNotification) => {
    for (const id of g.groupedIds) {
      await deleteOne(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notificações</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} não lida${unreadCount > 1 ? "s" : ""}` : "Todas lidas"}
          </p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={markAllAsRead}>
              <CheckCheck className="w-3.5 h-3.5" />
              Marcar todas como lidas
            </Button>
          )}
          {systemNotificationsCount > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive" onClick={clearAll}>
              <Trash2 className="w-3.5 h-3.5" />
              Limpar todas
            </Button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          Todas ({notifications.length})
        </Button>
        <Button
          variant={filter === "unread" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("unread")}
        >
          Não lidas ({unreadCount})
        </Button>
      </div>

      {/* Notification list */}
      <div className="space-y-2">
        {loading ? (
          <Card className="border-border/50">
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              Carregando notificações...
            </CardContent>
          </Card>
        ) : grouped.length === 0 ? (
          <Card className="border-border/50">
            <CardContent className="py-12 text-center">
              <Bell className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {filter === "unread" ? "Nenhuma notificação não lida" : "Nenhuma notificação"}
              </p>
            </CardContent>
          </Card>
        ) : (
          grouped.map((n) => {
            const Icon = typeIcons[n.type] || Info;
            const color = typeColors[n.type] || "text-muted-foreground";
            const bg = typeBg[n.type] || "bg-muted/10";
            const canAct = !n.synthetic && n.groupedIds.some((id) => !id.startsWith("activity-"));

            return (
              <Card
                key={n.id}
                className={`group border-border/50 transition-all duration-150 hover:border-border ${
                  !n.read ? "bg-muted/20 border-l-2 border-l-emerald-500" : "opacity-70 hover:opacity-100"
                }`}
              >
                <CardContent className="p-4 flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm flex items-center gap-2 ${!n.read ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        <span className="truncate">{n.title}</span>
                        {n.count > 1 && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground shrink-0">
                            ×{n.count}
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        {!n.read && <span className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_6px_hsl(var(--primary))]" />}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <p className="text-[10px] text-muted-foreground/60">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                      {canAct && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!n.read && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMarkRead(n);
                              }}
                            >
                              <Check className="w-3 h-3" />
                              Marcar como lida
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] gap-1 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(n);
                            }}
                          >
                            <X className="w-3 h-3" />
                            Excluir
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Notifications;
