import { lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { Toaster as ShadcnToaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";

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
const GroupJoinComingSoon = lazyWithPreload(() => import("@/pages/dashboard/GroupJoinComingSoon"));
const ChipConversation = lazyWithPreload(() => import("@/pages/dashboard/ChipConversation"));
const ChipConversationComingSoon = lazyWithPreload(() => import("@/pages/dashboard/ChipConversationComingSoon"));
const AutoReplyList = lazyWithPreload(() => import("@/pages/dashboard/AutoReplyList"));
const AutoReply = lazyWithPreload(() => import("@/pages/dashboard/AutoReply"));
const AutoReplyComingSoon = lazyWithPreload(() => import("@/pages/dashboard/AutoReplyComingSoon"));
const Contacts = lazyWithPreload(() => import("@/pages/dashboard/Contacts"));
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
  "/dashboard/notifications": () => { (Notifications as any).__preload?.(); },
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

const Loading = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <motion.div
      className="flex flex-col items-center gap-4"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="relative w-10 h-10">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-primary/30"
        />
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
        />
      </div>
      <motion.span
        className="text-xs text-muted-foreground font-medium"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        Carregando...
      </motion.span>
    </motion.div>
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/auth" replace />;
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
                <Route path="/dashboard/chip-conversation" element={<ProtectedRoute><DashboardLayout><ChipConversation /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/auto-reply" element={<ProtectedRoute><DashboardLayout><AutoReplyComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/auto-reply/:id" element={<ProtectedRoute><DashboardLayout><AutoReplyComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/autoreply" element={<ProtectedRoute><DashboardLayout><AutoReplyComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/autoreply/:id" element={<ProtectedRoute><DashboardLayout><AutoReplyComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/autoreply-soon" element={<ProtectedRoute><DashboardLayout><AutoReplyComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/contacts" element={<ProtectedRoute><DashboardLayout><Contacts /></DashboardLayout></ProtectedRoute>} />
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

                {/* Backoffice */}
                <Route path="/backoffice" element={<BackOffice />} />
                <Route path="/backoffice/campaigns" element={<BOCampaigns />} />
                <Route path="/backoffice/campaign-list" element={<BOCampaignList />} />
                <Route path="/backoffice/campaigns/list" element={<BOCampaignList />} />
                <Route path="/backoffice/campaign/:id" element={<BOCampaignDetail />} />
                <Route path="/backoffice/campaigns/:id" element={<BOCampaignDetail />} />

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
