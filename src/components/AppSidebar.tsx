import {
  LayoutDashboard,
  Smartphone,
  Send,
  BookUser,
  SaveAll,
  Megaphone,
  FileText,
  Flame,
  Shield,
  UsersRound,
  BotMessageSquare,
  ArrowRightLeft,
  Heart,
  LogOut,
  LogIn,
  Settings,
  ChevronUp,
  Crown,
  
  ChevronRight,
  CreditCard,
  HelpCircle,
  ScrollText,
  Plus,
  FolderOpen,
  Pencil,
  Trash2,
  Lock,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { NavLink } from "@/components/NavLink";
import { useSidebarStats } from "@/hooks/useSidebarStats";
import { useWarmupFolders } from "@/hooks/useWarmupFolders";
import { useFeatureControls } from "@/hooks/useFeatureControls";
import { MaintenanceModal } from "@/components/MaintenanceModal";
import logo from "@/assets/logo-new.png";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { WarmupFolderDialog } from "@/components/warmup/WarmupFolderDialog";
import { cn } from "@/lib/utils";

const menuGroups = [
  {
    label: "Conexões",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, exact: true },
      { title: "Instâncias", url: "/dashboard/devices", icon: Smartphone },
      { title: "Enviar Mensagem", url: "/dashboard/campaigns", icon: Send },
      { title: "Campanhas", url: "/dashboard/campaign-list", icon: Megaphone, badgeKey: "activeCampaigns" as const },
      { title: "Template", url: "/dashboard/templates", icon: FileText },
      { title: "Meus Contatos", url: "/dashboard/contacts", icon: BookUser },
    ],
  },
];

const developmentItems = [
  { title: "Entrada em Grupos", url: "/dashboard/group-join", icon: LogIn, locked: true },
  { title: "Aquecimento Comunitário", url: "/dashboard/community-warmup", icon: Heart, locked: true },
  { title: "Conversa entre Chips", url: "/dashboard/chip-conversation", icon: ArrowRightLeft, locked: true },
  { title: "Interação de Grupos", url: "/dashboard/group-interaction", icon: UsersRound, locked: true },
  { title: "Resposta Automática", url: "/dashboard/auto-reply", icon: BotMessageSquare, locked: true },
];

type BadgeKey = "activeCampaigns" | "unreadNotifications";

const FOLDER_COLORS: Record<string, string> = {
  "#10b981": "text-emerald-400",
  "#f59e0b": "text-amber-400",
  "#ef4444": "text-red-400",
  "#3b82f6": "text-blue-400",
  "#8b5cf6": "text-violet-400",
  "#ec4899": "text-pink-400",
  "#06b6d4": "text-cyan-400",
  "#f97316": "text-orange-400",
};

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { data: stats } = useSidebarStats();
  const { folders, createFolder, updateFolder, deleteFolder, addDevices, removeDevice } = useWarmupFolders();
  const { isFeatureBlocked } = useFeatureControls();
  const [maintenanceModal, setMaintenanceModal] = useState<{ name: string; message: string | null } | null>(null);

  const [profileData, setProfileData] = useState<{ company: string | null; avatar_url: string | null; full_name: string | null } | null>(null);
  const [warmupExpanded, setWarmupExpanded] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<{ id: string; name: string; color: string; tags?: any[] } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("company, avatar_url, full_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfileData(data);
      });

    const channel = supabase
      .channel('profile-sidebar')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, (payload) => {
        const d = payload.new as any;
        setProfileData({ company: d.company, avatar_url: d.avatar_url, full_name: d.full_name });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Auto-expand folders only on warmup instance routes (not autosave/groups)
  useEffect(() => {
    if (location.pathname.startsWith("/dashboard/warmup")) {
      setWarmupExpanded(true);
    }
  }, [location.pathname]);

  const displayName = profileData?.company || profileData?.full_name || user?.email?.split("@")[0] || "Usuário";
  const avatarUrl = profileData?.avatar_url;
  const initials = displayName.slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  const isActive = (url: string, exact?: boolean) => {
    if (url === "/dashboard") return location.pathname === "/dashboard";
    if (exact) return location.pathname === url;
    return location.pathname === url || location.pathname.startsWith(url + "/");
  };

  const getBadgeValue = (key?: BadgeKey): number => {
    if (!key || !stats) return 0;
    return stats[key] || 0;
  };

  const warmupItems = [
    { title: "Aquecimento", url: "/dashboard/warmup-v2", icon: Flame },
    { title: "Proxy", url: "/dashboard/proxy", icon: Shield },
    { title: "Grupos", url: "/dashboard/groups", icon: UsersRound },
    { title: "Auto Save", url: "/dashboard/autosave", icon: SaveAll },
    { title: "Relatório Via WhatsApp", url: "/dashboard/reports/whatsapp", icon: ScrollText },
  ];

  const handleSaveFolder = useCallback(async (data: { name: string; color: string; tags?: any[]; deviceIds: string[] }) => {
    if (editingFolder) {
      await updateFolder.mutateAsync({ id: editingFolder.id, name: data.name, color: data.color, tags: data.tags });
      // Sync devices: remove old, add new
      const currentFolder = folders.find(f => f.id === editingFolder.id);
      const oldIds = new Set(currentFolder?.device_ids || []);
      const newIds = new Set(data.deviceIds);
      // Remove devices no longer in folder
      for (const did of oldIds) {
        if (!newIds.has(did)) {
          await removeDevice.mutateAsync({ folderId: editingFolder.id, deviceId: did });
        }
      }
      // Add new devices
      const toAdd = data.deviceIds.filter(did => !oldIds.has(did));
      if (toAdd.length > 0) {
        await addDevices.mutateAsync({ folderId: editingFolder.id, deviceIds: toAdd });
      }
    } else {
      const result = await createFolder.mutateAsync({ name: data.name, color: data.color, icon: "folder", tags: data.tags });
      if (data.deviceIds.length > 0 && result) {
        await addDevices.mutateAsync({ folderId: (result as any).id, deviceIds: data.deviceIds });
      }
    }
    setEditingFolder(null);
  }, [editingFolder, updateFolder, createFolder, addDevices, removeDevice, folders]);

  const handleDeleteFolder = useCallback(async (id: string) => {
    await deleteFolder.mutateAsync(id);
  }, [deleteFolder]);

  const renderNavItem = (item: { title: string; url: string; icon: any; exact?: boolean; badgeKey?: BadgeKey; locked?: boolean }, indent = false) => {
    const active = isActive(item.url, item.exact);
    const badgeVal = getBadgeValue(item.badgeKey);
    const blocked = isFeatureBlocked(item.url);
    const isLocked = item.locked || !!blocked;
    
    const handleClick = (e: React.MouseEvent) => {
      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
        setMaintenanceModal({ name: blocked.feature_name, message: blocked.maintenance_message });
      }
    };

    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild tooltip={isLocked ? `${item.title} (Em desenvolvimento)` : item.title}>
          <NavLink
            to={isLocked && !item.locked ? "#" : item.url}
            onClick={blocked ? handleClick : undefined}
            className={`sidebar-nav-item flex items-center rounded-[10px] text-[13px] relative
              transition-[background-color,color,opacity] duration-[120ms] ease-out
              ${collapsed ? 'gap-0 px-0 py-2.5 justify-center w-10 h-10 mx-auto' : `gap-[11px] ${indent ? 'pl-8' : 'px-3.5'} pr-3.5 py-[10px]`}
              ${isLocked
                ? 'text-muted-foreground/40 font-medium'
                : active
                  ? 'bg-primary/10 text-foreground font-semibold'
                  : 'text-muted-foreground font-medium hover:text-foreground hover:bg-muted/40'
              }`}
            activeClassName=""
          >
            {active && !isLocked && !collapsed && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
            )}
            <div className="relative shrink-0">
              <item.icon
                className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${isLocked ? 'text-muted-foreground/30' : active ? 'text-primary' : ''}`}
                strokeWidth={active ? 2.2 : 1.5}
              />
              {isLocked && (
                <Lock className="absolute -bottom-1 -right-1 w-[10px] h-[10px] text-amber-500/70" strokeWidth={2.5} />
              )}
            </div>
            {!collapsed && (
              <span className={`truncate flex-1 ${isLocked ? 'opacity-50' : ''}`}>{item.title}</span>
            )}
            {!collapsed && isLocked && (
              <Lock className="ml-auto w-3.5 h-3.5 text-amber-500/60 shrink-0" />
            )}
            {!collapsed && !isLocked && badgeVal > 0 && (
              <span className="ml-auto text-[10px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                {badgeVal}
              </span>
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="sidebar-premium">
      {/* Header / Brand */}
      <div className={`flex items-center border-b border-sidebar-border ${collapsed ? 'justify-center py-4 px-2' : 'gap-3 px-5 py-5'}`}>
        <img src={logo} alt="Logo" className="w-8 min-w-[32px] h-8 min-h-[32px] rounded-lg shrink-0 object-cover mx-auto" />
        {!collapsed && (
          <span className="text-[15px] font-bold tracking-tight text-sidebar-foreground truncate">
            <span className="text-primary">DG</span> Contingência <span className="text-primary">PRO</span>
          </span>
        )}
      </div>

      <SidebarContent className="py-2">
        {menuGroups.map((group, gi) => (
          <SidebarGroup key={gi} className={`py-0 ${gi > 0 ? 'mt-1' : ''}`}>
            {group.label && !collapsed && (
              <SidebarGroupLabel className="px-4 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold mb-0.5">
                {group.label}
              </SidebarGroupLabel>
            )}
            {collapsed && gi > 0 && group.label && (
              <div className="mx-3 my-1.5 border-t border-sidebar-border/50" />
            )}
            <SidebarGroupContent>
              <SidebarMenu className={cn("space-y-[2px]", collapsed ? "px-0 flex flex-col items-center" : "px-2.5")}>
                {group.items.map((item) => renderNavItem(item as any))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {/* ── Aquecimento section with folders ── */}
        <SidebarGroup className="py-0 mt-1">
          {!collapsed && (
            <SidebarGroupLabel className="px-4 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold mb-0.5">
              Aquecimento
            </SidebarGroupLabel>
          )}
          {collapsed && (
            <div className="mx-3 my-1.5 border-t border-sidebar-border/50" />
          )}
          <SidebarGroupContent>
            <SidebarMenu className={cn("space-y-[2px]", collapsed ? "px-0 flex flex-col items-center" : "px-2.5")}>
              {/* Main warmup item with expand arrow */}
              {(() => {
                const warmupBlocked = isFeatureBlocked("/dashboard/warmup-v2");
                const handleWarmupClick = (e: React.MouseEvent) => {
                  if (warmupBlocked) {
                    e.preventDefault();
                    e.stopPropagation();
                    setMaintenanceModal({ name: warmupBlocked.feature_name, message: warmupBlocked.maintenance_message });
                  }
                };
                return (
                  <SidebarMenuItem>
                    <div className="flex items-center">
                      <SidebarMenuButton asChild tooltip={warmupBlocked ? "Aquecimento (Em manutenção)" : "Aquecimento"} className="flex-1">
                        <NavLink
                          to={warmupBlocked ? "#" : "/dashboard/warmup-v2"}
                          onClick={handleWarmupClick}
                          className={`sidebar-nav-item flex items-center rounded-[10px] text-[13px] relative
                            transition-[background-color,color,opacity] duration-[120ms] ease-out
                            ${collapsed ? 'gap-0 px-0 py-2.5 justify-center w-10 h-10 mx-auto' : 'gap-[11px] px-3.5 py-[10px]'}
                            ${warmupBlocked
                              ? 'text-muted-foreground/40 font-medium cursor-not-allowed'
                              : isActive("/dashboard/warmup-v2")
                                ? 'bg-primary/10 text-foreground font-semibold'
                                : 'text-muted-foreground font-medium hover:text-foreground hover:bg-muted/40'
                            }`}
                          activeClassName=""
                        >
                          {isActive("/dashboard/warmup-v2") && !warmupBlocked && !collapsed && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
                          )}
                          <div className="relative shrink-0">
                            <Flame
                              className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${warmupBlocked ? 'text-muted-foreground/30' : isActive("/dashboard/warmup-v2") ? 'text-primary' : ''}`}
                              strokeWidth={isActive("/dashboard/warmup-v2") ? 2.2 : 1.5}
                            />
                            {warmupBlocked && (
                              <Lock className="absolute -bottom-1 -right-1 w-[10px] h-[10px] text-amber-500/70" strokeWidth={2.5} />
                            )}
                          </div>
                          {!collapsed && (
                            <span className={`truncate flex-1 ${warmupBlocked ? 'opacity-50' : ''}`}>Aquecimento</span>
                          )}
                          {!collapsed && warmupBlocked && (
                            <Lock className="ml-auto w-3.5 h-3.5 text-amber-500/60 shrink-0" />
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                      {!collapsed && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setWarmupExpanded(!warmupExpanded);
                          }}
                          className="p-2 rounded-lg hover:bg-muted/40 text-muted-foreground/40 hover:text-muted-foreground transition-colors mr-2"
                        >
                          <ChevronRight className={cn("w-3 h-3 transition-transform duration-200", warmupExpanded && "rotate-90")} />
                        </button>
                      )}
                    </div>
                  </SidebarMenuItem>
                );
              })()}

              {/* Folders only toggle with the arrow */}
              {warmupExpanded && !collapsed && folders.length > 0 && (
                <div className="mt-1 space-y-1.5">
                  {folders.map((folder) => {
                    const colorClass = FOLDER_COLORS[folder.color] || "text-emerald-400";
                    const folderUrl = `/dashboard/warmup-v2?folder=${folder.id}`;
                    const isActiveFolder = location.search.includes(folder.id);
                    return (
                      <SidebarMenuItem key={folder.id}>
                        <div className="group/folder relative">
                          <NavLink
                            to={folderUrl}
                            className={`sidebar-nav-item flex items-center rounded-[10px] text-[13px] relative w-full
                              transition-[background-color,color,opacity] duration-[120ms] ease-out
                              gap-[11px] px-3.5 py-[8px]
                              text-foreground font-medium hover:brightness-110`}
                            style={{ backgroundColor: `${folder.color}15` }}
                            activeClassName=""
                          >
                            {isActiveFolder && (
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full" style={{ backgroundColor: folder.color }} />
                            )}
                            <FolderOpen className="w-[18px] h-[18px] shrink-0" style={{ color: folder.color }} strokeWidth={isActiveFolder ? 2.2 : 1.5} />
                            <span className="truncate flex-1">{folder.name}</span>
                          </NavLink>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setEditingFolder({ id: folder.id, name: folder.name, color: folder.color, tags: folder.tags || [] });
                              setFolderDialogOpen(true);
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted/40 text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover/folder:opacity-100 transition-opacity z-10"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      </SidebarMenuItem>
                    );
                  })}
                </div>
              )}

              {/* Nova pasta - toggles with arrow */}
              {warmupExpanded && !collapsed && (
                <SidebarMenuItem>
                  <button
                    onClick={() => {
                      setEditingFolder(null);
                      setFolderDialogOpen(true);
                    }}
                    className="flex items-center gap-[11px] px-3.5 min-h-[36px] rounded-[10px] text-[13px] text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30 transition-colors w-full font-medium"
                  >
                    <Plus className="w-[18px] h-[18px]" strokeWidth={1.5} />
                    <span>Nova pasta</span>
                  </button>
                </SidebarMenuItem>
              )}

              {renderNavItem({ title: "Proxy", url: "/dashboard/proxy", icon: Shield })}
              {renderNavItem({ title: "Grupos", url: "/dashboard/groups", icon: UsersRound })}
              {renderNavItem({ title: "Auto Save", url: "/dashboard/autosave", icon: SaveAll })}
              {renderNavItem({ title: "Relatório Via WhatsApp", url: "/dashboard/reports/whatsapp", icon: ScrollText })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ── Desenvolvimento section ── */}
        <SidebarGroup className="py-0 mt-1">
          {!collapsed && (
            <SidebarGroupLabel className="px-4 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold mb-0.5">
              Desenvolvimento
            </SidebarGroupLabel>
          )}
          {collapsed && (
            <div className="mx-3 my-1.5 border-t border-sidebar-border/50" />
          )}
          <SidebarGroupContent>
            <SidebarMenu className={cn("space-y-[2px]", collapsed ? "px-0 flex flex-col items-center" : "px-2.5")}>
              {developmentItems.map((item) => renderNavItem(item as any))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ── Suporte section ── */}
        <SidebarGroup className="py-0 mt-1">
          {!collapsed && (
            <SidebarGroupLabel className="px-4 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold mb-0.5">
              Suporte
            </SidebarGroupLabel>
          )}
          {collapsed && (
            <div className="mx-3 my-1.5 border-t border-sidebar-border/50" />
          )}
          <SidebarGroupContent>
            <SidebarMenu className={cn("space-y-[2px]", collapsed ? "px-0 flex flex-col items-center" : "px-2.5")}>
              {/* Meu Plano - Premium animated button */}
              <SidebarMenuItem className="plan-gold-wrap">
                <SidebarMenuButton asChild tooltip="Meu Plano">
                  <NavLink
                    to="/dashboard/my-plan"
                    className={cn(
                      "plan-gold-btn sidebar-nav-item relative flex items-center text-[13px] transition-[color,opacity] duration-[120ms] ease-out group/plan",
                      collapsed ? 'gap-0 px-0 py-2.5 justify-center w-10 h-10 mx-auto' : 'gap-[11px] px-3.5 pr-3.5 py-[10px]',
                      isActive("/dashboard/my-plan")
                        ? 'text-foreground font-semibold'
                        : 'text-muted-foreground font-medium hover:text-amber-300'
                    )}
                    activeClassName=""
                  >
                    {isActive("/dashboard/my-plan") && !collapsed && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-amber-400 z-10" />
                    )}
                    <span className="relative z-10 flex items-center justify-center w-[18px] h-[18px] shrink-0">
                      <Crown className={cn("w-[16px] h-[16px] transition-colors duration-150", isActive("/dashboard/my-plan") ? "text-amber-400" : "text-amber-500/70 group-hover/plan:text-amber-400")} strokeWidth={isActive("/dashboard/my-plan") ? 2.2 : 1.8} />
                    </span>
                    {!collapsed && (
                      <span className="truncate flex-1 relative z-10">Meu Plano</span>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {renderNavItem({ title: "Comunidade", url: "/dashboard/community", icon: UsersRound })}
              {renderNavItem({ title: "Ajuda", url: "/dashboard/custom-module", icon: HelpCircle })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer profile */}
      <div className="mt-auto border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`flex items-center gap-3 w-full rounded-[10px] hover:bg-sidebar-accent/30 transition-colors duration-150 ${collapsed ? 'justify-center px-2 py-2' : 'px-2.5 py-2'}`}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-8 min-w-[32px] h-8 min-h-[32px] rounded-full shrink-0 object-cover ring-1 ring-border" />
              ) : (
                <div className="w-8 min-w-[32px] h-8 min-h-[32px] rounded-full shrink-0 bg-primary/10 ring-1 ring-border flex items-center justify-center">
                  <span className="text-[11px] font-semibold text-primary">{initials}</span>
                </div>
              )}
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-[13px] font-medium text-sidebar-foreground truncate leading-tight">{displayName}</p>
                    <p className="text-[11px] text-muted-foreground/50 truncate leading-tight">Gerenciar conta</p>
                  </div>
                  <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuItem onClick={() => navigate("/dashboard/settings")} className="gap-2 cursor-pointer">
              <Settings className="w-4 h-4" strokeWidth={1.5} />
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="gap-2 cursor-pointer text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4" strokeWidth={1.5} />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <WarmupFolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        editingFolder={editingFolder}
        onSave={handleSaveFolder}
        onDelete={handleDeleteFolder}
        currentDeviceIds={editingFolder ? (folders.find(f => f.id === editingFolder.id)?.device_ids || []) : []}
      />
      {maintenanceModal && (
        <MaintenanceModal
          open={true}
          onClose={() => setMaintenanceModal(null)}
          featureName={maintenanceModal.name}
          message={maintenanceModal.message}
        />
      )}
    </Sidebar>
  );
}
