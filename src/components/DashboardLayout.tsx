import { useState, useEffect } from "react";
import { useAutoSyncDevices } from "@/hooks/useAutoSyncDevices";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import { Bell, Info, CheckCircle2, AlertTriangle, XCircle, CheckCheck, Trash2, Sun, Moon, ArrowLeft, Headset, UsersRound, Flame } from "lucide-react";
import { useTheme } from "next-themes";
import { WorkspaceProvider, useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import logo from "@/assets/logo-new.png";

import { useNavigate, useLocation } from "react-router-dom";
import { useNotifications } from "@/hooks/useNotifications";
import { AnnouncementManager } from "@/components/AnnouncementManager";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useFeatureControls } from "@/hooks/useFeatureControls";
import { MaintenanceModal } from "@/components/MaintenanceModal";
import { HeaderProfileMenu } from "@/components/HeaderProfileMenu";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const typeIcons = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

const typeColors = {
  success: "text-[hsl(var(--success))]",
  warning: "text-[hsl(var(--warning))]",
  error: "text-destructive",
  info: "text-[hsl(var(--info))]",
};

const typeIconBg = {
  success: "bg-[hsl(var(--success))]/10 ring-1 ring-[hsl(var(--success))]/25",
  warning: "bg-[hsl(var(--warning))]/10 ring-1 ring-[hsl(var(--warning))]/25",
  error: "bg-destructive/10 ring-1 ring-destructive/25",
  info: "bg-[hsl(var(--info))]/10 ring-1 ring-[hsl(var(--info))]/25",
};

const typeAccentBar = {
  success: "bg-[hsl(var(--success))]",
  warning: "bg-[hsl(var(--warning))]",
  error: "bg-destructive",
  info: "bg-[hsl(var(--info))]",
};

const DashboardLayoutInner = ({ children }: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, clearAll, systemNotificationsCount } = useNotifications();
  const { resolvedTheme, setTheme } = useTheme();
  const { isFeatureBlocked } = useFeatureControls();

  // Auto-sync devices every 15s with global semaphore protection
  useAutoSyncDevices();

  // Presence heartbeat — update last_seen_at every 60s
  useEffect(() => {
    if (!user) return;
    const update = () => supabase.from("profiles").update({ last_seen_at: new Date().toISOString() } as any).eq("id", user.id).then(() => {});
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [user]);

  // Realtime device status change notifications — REMOVED
  // This was a duplicate of the realtime subscription in useAutoSyncDevices.
  // The hook already handles cache updates and sidebar stats invalidation.
  // Toast notifications for connect/disconnect are handled by the DB trigger
  // (notify_device_status_change) which inserts into the notifications table,
  // picked up by the useNotifications realtime subscription.

  // Check if current route is blocked
  const blockedFeature = isFeatureBlocked(location.pathname);
  const showMaintenance = !!blockedFeature;

  const { isCRM, isGroupCRM, setWorkspace } = useWorkspace();

  return (
    <SidebarProvider>
      <div className="app-root min-h-screen flex w-full overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-h-screen min-w-0">
          <header className="h-11 sm:h-14 border-b border-border bg-card shadow-sm flex items-center px-3 sm:px-4 shrink-0 gap-2 sm:gap-3">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground w-7 h-7 sm:w-8 sm:h-8" />
            <img src={logo} alt="DG Contingência Pro" className="w-6 h-6 rounded-md sm:hidden" />

            {/* Spacer */}
            <div className="flex-1" />

            {/* CRM quick toggle */}
            <button
              onClick={() => {
                if (isCRM) {
                  setWorkspace("automacao");
                  navigate("/dashboard");
                } else {
                  setWorkspace("crm");
                  navigate("/dashboard/crm");
                }
              }}
              title={isCRM ? "Sair do CRM" : "Acessar CRM"}
              className={`relative shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl border flex items-center justify-center transition-all duration-150 ${
                isCRM
                  ? "bg-primary/15 border-primary/30 text-primary hover:bg-primary/20"
                  : "bg-muted/40 border-border/30 text-muted-foreground hover:bg-muted/70 hover:border-border/50 hover:text-foreground"
              }`}
            >
              {isCRM ? (
                <ArrowLeft className="w-4 h-4 sm:w-[17px] sm:h-[17px]" strokeWidth={1.8} />
              ) : (
                <Headset className="w-4 h-4 sm:w-[17px] sm:h-[17px]" strokeWidth={1.6} />
              )}
              <span className="sr-only">{isCRM ? "Sair do CRM" : "Acessar CRM"}</span>
            </button>

            {/* Group CRM quick toggle */}
            <button
              onClick={() => {
                if (isGroupCRM) {
                  setWorkspace("automacao");
                  navigate("/dashboard");
                } else {
                  setWorkspace("group-crm");
                  navigate("/dashboard/group-crm");
                }
              }}
              title={isGroupCRM ? "Sair do CRM de Grupo" : "Acessar CRM de Grupo"}
              className={`relative shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl border flex items-center justify-center transition-all duration-150 ${
                isGroupCRM
                  ? "bg-primary/15 border-primary/30 text-primary hover:bg-primary/20"
                  : "bg-muted/40 border-border/30 text-muted-foreground hover:bg-muted/70 hover:border-border/50 hover:text-foreground"
              }`}
            >
              {isGroupCRM ? (
                <ArrowLeft className="w-4 h-4 sm:w-[17px] sm:h-[17px]" strokeWidth={1.8} />
              ) : (
                <UsersRound className="w-4 h-4 sm:w-[17px] sm:h-[17px]" strokeWidth={1.6} />
              )}
              <span className="sr-only">{isGroupCRM ? "Sair do CRM de Grupo" : "Acessar CRM de Grupo"}</span>
            </button>

            {/* Theme toggle */}
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="relative shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-muted/40 border border-border/30 hover:bg-muted/70 hover:border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all duration-150"
            >
              <Sun className="w-4 h-4 sm:w-[17px] sm:h-[17px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" strokeWidth={1.6} />
              <Moon className="absolute w-4 h-4 sm:w-[17px] sm:h-[17px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" strokeWidth={1.6} />
              <span className="sr-only">Alternar tema</span>
            </button>

            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground shrink-0 w-8 h-8 sm:w-9 sm:h-9">
                  <Bell className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 text-[10px] font-bold bg-sidebar-primary text-sidebar-primary-foreground rounded-full flex items-center justify-center ring-2 ring-card">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[360px] bg-popover border-border max-h-[460px] overflow-y-auto p-0 rounded-xl shadow-xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 sticky top-0 bg-popover/95 backdrop-blur z-10">
                  <div className="flex items-center gap-2">
                    <DropdownMenuLabel className="text-sm font-semibold text-foreground p-0">Notificações</DropdownMenuLabel>
                    {unreadCount > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-sidebar-primary/15 text-sidebar-primary">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={(e) => { e.preventDefault(); markAllAsRead(); }}
                      className="flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                    >
                      <CheckCheck className="w-3 h-3" />
                      Marcar todas como lidas
                    </button>
                  )}
                </div>

                {loading ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">Carregando...</div>
                ) : notifications.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-muted/40 flex items-center justify-center">
                      <Bell className="w-5 h-5 text-muted-foreground/50" />
                    </div>
                    <p className="text-xs text-muted-foreground">Nenhuma notificação</p>
                  </div>
                ) : (
                  <div className="py-1">
                    {notifications.map((n) => {
                      const Icon = typeIcons[n.type] || Info;
                      const color = typeColors[n.type] || "text-muted-foreground";
                      const iconBg = typeIconBg[n.type] || "bg-muted/40";
                      const accentBar = typeAccentBar[n.type] || "bg-muted-foreground/40";
                      return (
                        <DropdownMenuItem
                          key={n.id}
                          className={`relative flex items-start gap-3 px-4 py-3 cursor-pointer rounded-none border-b border-border/40 last:border-b-0 transition-colors ${!n.read ? "bg-muted/20 hover:bg-muted/40" : "hover:bg-muted/30"}`}
                          onClick={() => { if (!n.read && !n.synthetic) markAsRead(n.id); }}
                        >
                          {!n.read && (
                            <span className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full ${accentBar}`} />
                          )}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
                            <Icon className={`w-4 h-4 ${color}`} strokeWidth={2.2} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-[13px] leading-tight ${!n.read ? "font-semibold text-foreground" : "font-medium text-foreground/80"}`}>
                                {n.title}
                              </p>
                              {!n.read && <span className="w-2 h-2 bg-sidebar-primary rounded-full shrink-0 mt-1" />}
                            </div>
                            <p className="text-[12px] text-muted-foreground line-clamp-2 mt-1 leading-snug">{n.message}</p>
                            <p className="text-[10.5px] text-muted-foreground/60 mt-1.5 font-medium">
                              {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                            </p>
                          </div>
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                )}

                {systemNotificationsCount > 0 && (
                  <div className="border-t border-border/60 bg-muted/10">
                    <DropdownMenuItem
                      className="flex items-center justify-center gap-1.5 text-[11px] cursor-pointer text-destructive hover:text-destructive font-medium py-2.5"
                      onClick={(e) => { e.preventDefault(); clearAll(); }}
                    >
                      <Trash2 className="w-3 h-3" />
                      Limpar todas as notificações
                    </DropdownMenuItem>
                  </div>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-center text-xs text-primary justify-center cursor-pointer"
                  onClick={() => navigate("/dashboard/notifications")}
                >
                  Ver todas as notificações
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Profile menu */}
            <HeaderProfileMenu />
          </header>
          <main className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto p-2.5 sm:p-5 md:p-8 has-[.flow-builder-fullscreen]:!p-0 has-[.flow-builder-fullscreen]:!overflow-hidden">
            {showMaintenance ? (
              <div className="flex items-center justify-center min-h-[60vh]">
                <MaintenanceModal
                  open={true}
                  onClose={() => navigate("/dashboard")}
                  featureName={blockedFeature!.feature_name}
                  message={blockedFeature!.maintenance_message}
                />
              </div>
            ) : (
              <div
                key={location.pathname}
                className="animate-page-in h-full"
              >
                {children}
              </div>
            )}
          </main>
          <AnnouncementManager />
        </div>
      </div>
    </SidebarProvider>
  );
};

const DashboardLayout = ({ children }: DashboardLayoutProps) => (
  <WorkspaceProvider>
    <DashboardLayoutInner>{children}</DashboardLayoutInner>
  </WorkspaceProvider>
);

export default DashboardLayout;
