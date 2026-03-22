import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Bell, Info, CheckCircle2, AlertTriangle, XCircle, CheckCheck, Trash2, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
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
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { AnnouncementManager } from "@/components/AnnouncementManager";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useFeatureControls } from "@/hooks/useFeatureControls";
import { MaintenanceModal } from "@/components/MaintenanceModal";

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

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, clearAll } = useNotifications();
  const { resolvedTheme, setTheme } = useTheme();
  const { isFeatureBlocked } = useFeatureControls();
  const [maintenanceModal, setMaintenanceModal] = useState<{ name: string; message: string | null } | null>(null);

  // Auto-sync temporariamente desativado para isolar a sobrecarga do backend.

  // Check if current route is blocked
  const blockedFeature = isFeatureBlocked(location.pathname);
  const showMaintenance = !!blockedFeature;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-h-screen min-w-0">
          <header className="h-11 sm:h-14 border-b border-border bg-card shadow-sm flex items-center px-3 sm:px-4 shrink-0 gap-2 sm:gap-3">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground w-7 h-7 sm:w-8 sm:h-8" />
            <img src={logo} alt="DG Contingência Pro" className="w-6 h-6 rounded-md sm:hidden" />

            {/* Spacer */}
            <div className="flex-1" />

            {/* Theme toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="text-muted-foreground hover:text-foreground shrink-0 w-8 h-8 sm:w-9 sm:h-9"
            >
              <Sun className="w-4 h-4 sm:w-[18px] sm:h-[18px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute w-4 h-4 sm:w-[18px] sm:h-[18px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Alternar tema</span>
            </Button>

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
              <DropdownMenuContent align="end" className="w-80 bg-popover border-border max-h-[400px] overflow-y-auto">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <DropdownMenuLabel className="text-xs font-medium text-foreground p-0">Notificações</DropdownMenuLabel>
                  {unreadCount > 0 && (
                    <button
                      onClick={(e) => { e.preventDefault(); markAllAsRead(); }}
                      className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                    >
                      <CheckCheck className="w-3 h-3" />
                      Marcar todas como lidas
                    </button>
                  )}
                </div>
                <DropdownMenuSeparator />

                {loading ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">Carregando...</div>
                ) : notifications.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">Nenhuma notificação</div>
                ) : (
                  notifications.map((n) => {
                    const Icon = typeIcons[n.type] || Info;
                    const color = typeColors[n.type] || "text-muted-foreground";
                    return (
                      <DropdownMenuItem
                        key={n.id}
                        className={`flex items-start gap-3 py-3 cursor-pointer ${!n.read ? "bg-muted/30" : ""}`}
                        onClick={() => { if (!n.read) markAsRead(n.id); }}
                      >
                        <Icon className={`w-4 h-4 ${color} mt-0.5 shrink-0`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-sm truncate ${!n.read ? "font-medium text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                            {!n.read && <span className="w-1.5 h-1.5 bg-sidebar-primary rounded-full shrink-0" />}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                          </p>
                        </div>
                      </DropdownMenuItem>
                    );
                  })
                )}
                {notifications.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="flex items-center justify-center gap-1.5 text-xs cursor-pointer"
                      onClick={(e) => { e.preventDefault(); markAllAsRead(); }}
                    >
                      <CheckCheck className="w-3 h-3" />
                      Marcar todas como lidas
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="flex items-center justify-center gap-1.5 text-xs cursor-pointer text-destructive hover:text-destructive"
                      onClick={(e) => { e.preventDefault(); clearAll(); }}
                    >
                      <Trash2 className="w-3 h-3" />
                      Limpar todas as notificações
                    </DropdownMenuItem>
                  </>
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
            ) : children}
          </main>
          <AnnouncementManager />
          {maintenanceModal && (
            <MaintenanceModal
              open={true}
              onClose={() => setMaintenanceModal(null)}
              featureName={maintenanceModal.name}
              message={maintenanceModal.message}
            />
          )}
        </div>
      </div>
    </SidebarProvider>
  );
};

export default DashboardLayout;
