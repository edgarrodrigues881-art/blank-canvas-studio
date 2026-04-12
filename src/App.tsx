import { lazy, Suspense, useState, useEffect, memo } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { Toaster as ShadcnToaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// Lazy load DashboardLayout to avoid eagerly pulling in heavy deps (notifications, sidebar, icons)
const DashboardLayout = lazy(() => import("@/components/DashboardLayout"));

// Lazy pages with preload support
const lazyWithPreload = (factory: () => Promise<any>) => {
  const Component = lazy(factory);
  (Component as any).__preload = factory;
  return Component;
};

const Landing = lazyWithPreload(() => import("@/pages/Landing"));
const Auth = lazyWithPreload(() => import("@/pages/Auth"));
const ResetPassword = lazyWithPreload(() => import("@/pages/ResetPassword"));
const WelcomeSplash = lazyWithPreload(() => import("@/pages/WelcomeSplash"));
const NotFound = lazyWithPreload(() => import("@/pages/NotFound"));
const BackOffice = lazyWithPreload(() => import("@/pages/BackOffice"));
const InstallBackoffice = lazyWithPreload(() => import("@/pages/InstallBackoffice"));

// Dashboard pages
const DashboardHome = lazyWithPreload(() => import("@/pages/dashboard/DashboardHome"));
const Devices = lazyWithPreload(() => import("@/pages/dashboard/Devices"));
const WarmupInstances = lazyWithPreload(() => import("@/pages/dashboard/WarmupInstances"));
const WarmupInstanceDetail = lazyWithPreload(() => import("@/pages/dashboard/WarmupInstanceDetail"));
const CommunityWarmup = lazyWithPreload(() => import("@/pages/dashboard/CommunityWarmup"));
const CommunityWarmupComingSoon = lazyWithPreload(() => import("@/pages/dashboard/CommunityWarmupComingSoon"));
const Community = lazyWithPreload(() => import("@/pages/dashboard/Community"));
const Campaigns = lazyWithPreload(() => import("@/pages/dashboard/Campaigns"));
const CampaignList = lazyWithPreload(() => import("@/pages/dashboard/CampaignList"));
const CampaignDetail = lazyWithPreload(() => import("@/pages/dashboard/CampaignDetail"));
const GroupInteraction = lazyWithPreload(() => import("@/pages/dashboard/GroupInteraction"));
const GroupCapture = lazyWithPreload(() => import("@/pages/dashboard/GroupCapture"));
const GroupJoinCampaignList = lazyWithPreload(() => import("@/pages/dashboard/GroupJoinCampaignList"));
const GroupJoinCampaignNew = lazyWithPreload(() => import("@/pages/dashboard/GroupJoinCampaignNew"));
const GroupJoinCampaignDetail = lazyWithPreload(() => import("@/pages/dashboard/GroupJoinCampaignDetail"));
const MassGroupInject = lazyWithPreload(() => import("@/pages/dashboard/MassGroupInject"));
const WelcomeAutomation = lazyWithPreload(() => import("@/pages/dashboard/WelcomeAutomation"));
const GroupJoinComingSoon = lazyWithPreload(() => import("@/pages/dashboard/GroupJoinComingSoon"));
const ChipConversation = lazyWithPreload(() => import("@/pages/dashboard/ChipConversation"));
const ChipConversationComingSoon = lazyWithPreload(() => import("@/pages/dashboard/ChipConversationComingSoon"));
const AutoReplyList = lazyWithPreload(() => import("@/pages/dashboard/AutoReplyList"));
const AutoReply = lazyWithPreload(() => import("@/pages/dashboard/AutoReply"));
const AutoReplyComingSoon = lazyWithPreload(() => import("@/pages/dashboard/AutoReplyComingSoon"));
const Contacts = lazyWithPreload(() => import("@/pages/dashboard/Contacts"));
const GroupLeadExtractor = lazyWithPreload(() => import("@/pages/dashboard/GroupLeadExtractor"));
const WhatsAppVerifier = lazyWithPreload(() => import("@/pages/dashboard/WhatsAppVerifierCampaigns"));
const Templates = lazyWithPreload(() => import("@/pages/dashboard/Templates"));
const CarouselTemplates = lazyWithPreload(() => import("@/pages/dashboard/CarouselTemplates"));
const AutoSave = lazyWithPreload(() => import("@/pages/dashboard/AutoSave"));
const Reports = lazyWithPreload(() => import("@/pages/dashboard/Reports"));
const ReportWhatsApp = lazyWithPreload(() => import("@/pages/dashboard/ReportWhatsApp"));
const ReportConnection = lazyWithPreload(() => import("@/pages/dashboard/ReportConnection"));
const Notifications = lazyWithPreload(() => import("@/pages/dashboard/Notifications"));
const Settings = lazyWithPreload(() => import("@/pages/dashboard/Settings"));
const MyPlan = lazyWithPreload(() => import("@/pages/dashboard/MyPlan"));
const Proxy = lazyWithPreload(() => import("@/pages/dashboard/Proxy"));
const CustomModule = lazyWithPreload(() => import("@/pages/dashboard/CustomModule"));
const Prospeccao = lazyWithPreload(() => import("@/pages/dashboard/Prospeccao"));
const Conversations = lazyWithPreload(() => import("@/pages/dashboard/Conversations"));
const AISettings = lazyWithPreload(() => import("@/pages/dashboard/AISettings"));
const TeamManagement = lazyWithPreload(() => import("@/pages/dashboard/TeamManagement"));
const ServiceContacts = lazyWithPreload(() => import("@/pages/dashboard/ServiceContacts"));
const Schedules = lazyWithPreload(() => import("@/pages/dashboard/Schedules"));
const ActivityHistory = lazyWithPreload(() => import("@/pages/dashboard/ActivityHistory"));
const ConversationQueue = lazyWithPreload(() => import("@/pages/dashboard/ConversationQueue"));
const ServiceReports = lazyWithPreload(() => import("@/pages/dashboard/ServiceReports"));
const GroupCarouselDispatch = lazyWithPreload(() => import("@/pages/dashboard/GroupCarouselDispatch"));

// Backoffice pages
const BOCampaigns = lazyWithPreload(() => import("@/pages/backoffice/BOCampaigns"));
const BOCampaignList = lazyWithPreload(() => import("@/pages/backoffice/BOCampaignList"));
const BOCampaignDetail = lazyWithPreload(() => import("@/pages/backoffice/BOCampaignDetail"));

// Route preload map — used by sidebar to preload chunks on hover
export const routePreloadMap: Record<string, () => void> = {
  "/dashboard": () => { (DashboardHome as any).__preload?.(); },
  "/dashboard/devices": () => { (Devices as any).__preload?.(); },
  "/dashboard/warmup-v2": () => { (WarmupInstances as any).__preload?.(); },
  "/dashboard/campaigns": () => { (Campaigns as any).__preload?.(); },
  "/dashboard/campaign-list": () => { (CampaignList as any).__preload?.(); },
  "/dashboard/contacts": () => { (Contacts as any).__preload?.(); },
  "/dashboard/group-extractor": () => { (GroupLeadExtractor as any).__preload?.(); },
  "/dashboard/whatsapp-verifier": () => { (WhatsAppVerifier as any).__preload?.(); },
  "/dashboard/templates": () => { (Templates as any).__preload?.(); },
  "/dashboard/carousel-templates": () => { (CarouselTemplates as any).__preload?.(); },
  "/dashboard/autosave": () => { (AutoSave as any).__preload?.(); },
  "/dashboard/proxy": () => { (Proxy as any).__preload?.(); },
  "/dashboard/group-interaction": () => { (GroupInteraction as any).__preload?.(); },
  "/dashboard/groups": () => { (GroupCapture as any).__preload?.(); },
  "/dashboard/reports": () => { (Reports as any).__preload?.(); },
  "/dashboard/reports/whatsapp": () => { (ReportWhatsApp as any).__preload?.(); },
  "/dashboard/my-plan": () => { (MyPlan as any).__preload?.(); },
  "/dashboard/settings": () => { (Settings as any).__preload?.(); },
  "/dashboard/group-join": () => { (GroupJoinCampaignList as any).__preload?.(); },
  "/dashboard/welcome": () => { (WelcomeAutomation as any).__preload?.(); },
  "/dashboard/notifications": () => { (Notifications as any).__preload?.(); },
  "/dashboard/prospeccao": () => { (Prospeccao as any).__preload?.(); },
  "/dashboard/conversations": () => { (Conversations as any).__preload?.(); },
  "/dashboard/ai-settings": () => { (AISettings as any).__preload?.(); },
  "/dashboard/team": () => { (TeamManagement as any).__preload?.(); },
  "/dashboard/service-contacts": () => { (ServiceContacts as any).__preload?.(); },
  "/dashboard/schedules": () => { (Schedules as any).__preload?.(); },
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 60_000,        // 1min default — prevents duplicate fetches across components
      gcTime: 300_000,          // 5min garbage collection
    },
  },
});

const Loading = memo(() => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4 animate-fade-in">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-primary/30" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
      </div>
      <span className="text-xs text-muted-foreground font-medium">Carregando...</span>
    </div>
  </div>
));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (!cancelled) setIsAdmin(!!data);
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (loading || isAdmin === null) return <Loading />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<Loading />}>
              <Routes>
                {/* Public */}
                <Route path="/" element={<PublicOnlyRoute><Landing /></PublicOnlyRoute>} />
                <Route path="/auth" element={<PublicOnlyRoute><Auth /></PublicOnlyRoute>} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/install-backoffice" element={<InstallBackoffice />} />
                
                <Route path="/welcome" element={<ProtectedRoute><WelcomeSplash /></ProtectedRoute>} />

                {/* Dashboard */}
                <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout><DashboardHome /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/devices" element={<ProtectedRoute><DashboardLayout><Devices /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/warmup" element={<ProtectedRoute><DashboardLayout><WarmupInstances /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/warmup-v2" element={<ProtectedRoute><DashboardLayout><WarmupInstances /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/warmup/:deviceId" element={<ProtectedRoute><DashboardLayout><WarmupInstanceDetail /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/warmup-v2/:deviceId" element={<ProtectedRoute><DashboardLayout><WarmupInstanceDetail /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/community-warmup" element={<ProtectedRoute><DashboardLayout><CommunityWarmup /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/community-warmup-soon" element={<ProtectedRoute><DashboardLayout><CommunityWarmupComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/community" element={<ProtectedRoute><DashboardLayout><Community /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/campaigns" element={<ProtectedRoute><DashboardLayout><Campaigns /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/campaign-list" element={<ProtectedRoute><DashboardLayout><CampaignList /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/campaigns/list" element={<ProtectedRoute><DashboardLayout><CampaignList /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/campaign/:id" element={<ProtectedRoute><DashboardLayout><CampaignDetail /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/campaigns/:id" element={<ProtectedRoute><DashboardLayout><CampaignDetail /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/group-interaction" element={<ProtectedRoute><DashboardLayout><GroupInteraction /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/group-interaction-soon" element={<ProtectedRoute><DashboardLayout><GroupInteraction /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/groups" element={<ProtectedRoute><DashboardLayout><GroupCapture /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/group-capture" element={<ProtectedRoute><DashboardLayout><GroupCapture /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/group-join" element={<ProtectedRoute><DashboardLayout><GroupJoinCampaignList /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/group-join/new" element={<ProtectedRoute><DashboardLayout><GroupJoinCampaignNew /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/group-join/:id" element={<ProtectedRoute><DashboardLayout><GroupJoinCampaignDetail /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/group-join-soon" element={<ProtectedRoute><DashboardLayout><GroupJoinCampaignList /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/mass-inject" element={<ProtectedRoute><DashboardLayout><MassGroupInject /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/welcome" element={<ProtectedRoute><DashboardLayout><WelcomeAutomation /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/chip-conversation" element={<ProtectedRoute><DashboardLayout><ChipConversation /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/auto-reply" element={<ProtectedRoute><DashboardLayout><AutoReplyList /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/auto-reply/:id" element={<ProtectedRoute><DashboardLayout><AutoReply /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/autoreply" element={<ProtectedRoute><DashboardLayout><AutoReplyList /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/autoreply/:id" element={<ProtectedRoute><DashboardLayout><AutoReply /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/flows" element={<ProtectedRoute><DashboardLayout><AutoReplyList /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/contacts" element={<ProtectedRoute><DashboardLayout><Contacts /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/group-extractor" element={<ProtectedRoute><DashboardLayout><GroupLeadExtractor /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/whatsapp-verifier" element={<ProtectedRoute><DashboardLayout><WhatsAppVerifier /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/templates" element={<ProtectedRoute><DashboardLayout><Templates /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/carousel-templates" element={<ProtectedRoute><DashboardLayout><CarouselTemplates /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/autosave" element={<ProtectedRoute><DashboardLayout><AutoSave /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/reports" element={<ProtectedRoute><DashboardLayout><Reports /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/reports/whatsapp" element={<ProtectedRoute><DashboardLayout><ReportWhatsApp /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/reports/connection" element={<ProtectedRoute><DashboardLayout><ReportConnection /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/notifications" element={<ProtectedRoute><DashboardLayout><Notifications /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/settings" element={<ProtectedRoute><DashboardLayout><Settings /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/my-plan" element={<ProtectedRoute><DashboardLayout><MyPlan /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/proxy" element={<ProtectedRoute><DashboardLayout><Proxy /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/custom-module" element={<ProtectedRoute><DashboardLayout><CustomModule /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/prospeccao" element={<ProtectedRoute><DashboardLayout><Prospeccao /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/conversations" element={<ProtectedRoute><DashboardLayout><Conversations /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/ai-settings" element={<ProtectedRoute><DashboardLayout><AISettings /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/team" element={<ProtectedRoute><DashboardLayout><TeamManagement /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/service-contacts" element={<ProtectedRoute><DashboardLayout><ServiceContacts /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/schedules" element={<ProtectedRoute><DashboardLayout><Schedules /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/history" element={<ProtectedRoute><DashboardLayout><ActivityHistory /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/queue" element={<ProtectedRoute><DashboardLayout><ConversationQueue /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/service-reports" element={<ProtectedRoute><DashboardLayout><ServiceReports /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/group-carousel" element={<ProtectedRoute><DashboardLayout><GroupCarouselDispatch /></DashboardLayout></ProtectedRoute>} />

                {/* Backoffice — BackOffice.tsx manages its own auth + admin login internally */}
                <Route path="/backoffice" element={<BackOffice />} />
                <Route path="/backoffice/campaigns" element={<AdminRoute><BOCampaigns /></AdminRoute>} />
                <Route path="/backoffice/campaign-list" element={<AdminRoute><BOCampaignList /></AdminRoute>} />
                <Route path="/backoffice/campaigns/list" element={<AdminRoute><BOCampaignList /></AdminRoute>} />
                <Route path="/backoffice/campaign/:id" element={<AdminRoute><BOCampaignDetail /></AdminRoute>} />
                <Route path="/backoffice/campaigns/:id" element={<AdminRoute><BOCampaignDetail /></AdminRoute>} />

                {/* Fallback */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            <Toaster />
            <ShadcnToaster />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
