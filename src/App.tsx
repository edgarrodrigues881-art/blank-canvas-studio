import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";

// Lazy pages
const Landing = lazy(() => import("@/pages/Landing"));
const Auth = lazy(() => import("@/pages/Auth"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const WelcomeSplash = lazy(() => import("@/pages/WelcomeSplash"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const BackOffice = lazy(() => import("@/pages/BackOffice"));

// Dashboard pages
const DashboardHome = lazy(() => import("@/pages/dashboard/DashboardHome"));
const Devices = lazy(() => import("@/pages/dashboard/Devices"));
const WarmupInstances = lazy(() => import("@/pages/dashboard/WarmupInstances"));
const WarmupInstanceDetail = lazy(() => import("@/pages/dashboard/WarmupInstanceDetail"));
const CommunityWarmup = lazy(() => import("@/pages/dashboard/CommunityWarmup"));
const CommunityWarmupComingSoon = lazy(() => import("@/pages/dashboard/CommunityWarmupComingSoon"));
const Community = lazy(() => import("@/pages/dashboard/Community"));
const Campaigns = lazy(() => import("@/pages/dashboard/Campaigns"));
const CampaignList = lazy(() => import("@/pages/dashboard/CampaignList"));
const CampaignDetail = lazy(() => import("@/pages/dashboard/CampaignDetail"));
const GroupInteraction = lazy(() => import("@/pages/dashboard/GroupInteraction"));
const GroupInteractionComingSoon = lazy(() => import("@/pages/dashboard/GroupInteractionComingSoon"));
const GroupCapture = lazy(() => import("@/pages/dashboard/GroupCapture"));
const GroupJoinCampaignList = lazy(() => import("@/pages/dashboard/GroupJoinCampaignList"));
const GroupJoinCampaignNew = lazy(() => import("@/pages/dashboard/GroupJoinCampaignNew"));
const GroupJoinCampaignDetail = lazy(() => import("@/pages/dashboard/GroupJoinCampaignDetail"));
const GroupJoinComingSoon = lazy(() => import("@/pages/dashboard/GroupJoinComingSoon"));
const ChipConversation = lazy(() => import("@/pages/dashboard/ChipConversation"));
const ChipConversationComingSoon = lazy(() => import("@/pages/dashboard/ChipConversationComingSoon"));
const AutoReplyList = lazy(() => import("@/pages/dashboard/AutoReplyList"));
const AutoReply = lazy(() => import("@/pages/dashboard/AutoReply"));
const AutoReplyComingSoon = lazy(() => import("@/pages/dashboard/AutoReplyComingSoon"));
const Contacts = lazy(() => import("@/pages/dashboard/Contacts"));
const Templates = lazy(() => import("@/pages/dashboard/Templates"));
const AutoSave = lazy(() => import("@/pages/dashboard/AutoSave"));
const Reports = lazy(() => import("@/pages/dashboard/Reports"));
const ReportWhatsApp = lazy(() => import("@/pages/dashboard/ReportWhatsApp"));
const ReportConnection = lazy(() => import("@/pages/dashboard/ReportConnection"));
const Notifications = lazy(() => import("@/pages/dashboard/Notifications"));
const Settings = lazy(() => import("@/pages/dashboard/Settings"));
const MyPlan = lazy(() => import("@/pages/dashboard/MyPlan"));
const Proxy = lazy(() => import("@/pages/dashboard/Proxy"));
const CustomModule = lazy(() => import("@/pages/dashboard/CustomModule"));

// Backoffice pages
const BOCampaigns = lazy(() => import("@/pages/backoffice/BOCampaigns"));
const BOCampaignList = lazy(() => import("@/pages/backoffice/BOCampaignList"));
const BOCampaignDetail = lazy(() => import("@/pages/backoffice/BOCampaignDetail"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const Loading = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
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
                <Route path="/dashboard/community-warmup" element={<ProtectedRoute><DashboardLayout><CommunityWarmupComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/community-warmup-soon" element={<ProtectedRoute><DashboardLayout><CommunityWarmupComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/community" element={<ProtectedRoute><DashboardLayout><Community /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/campaigns" element={<ProtectedRoute><DashboardLayout><Campaigns /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/campaign-list" element={<ProtectedRoute><DashboardLayout><CampaignList /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/campaigns/list" element={<ProtectedRoute><DashboardLayout><CampaignList /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/campaign/:id" element={<ProtectedRoute><DashboardLayout><CampaignDetail /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/campaigns/:id" element={<ProtectedRoute><DashboardLayout><CampaignDetail /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/group-interaction" element={<ProtectedRoute><DashboardLayout><GroupInteractionComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/group-interaction-soon" element={<ProtectedRoute><DashboardLayout><GroupInteractionComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/groups" element={<ProtectedRoute><DashboardLayout><GroupCapture /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/group-capture" element={<ProtectedRoute><DashboardLayout><GroupCapture /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/group-join" element={<ProtectedRoute><DashboardLayout><GroupJoinComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/group-join/new" element={<ProtectedRoute><DashboardLayout><GroupJoinComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/group-join/:id" element={<ProtectedRoute><DashboardLayout><GroupJoinComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/group-join-soon" element={<ProtectedRoute><DashboardLayout><GroupJoinComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/chip-conversation" element={<ProtectedRoute><DashboardLayout><ChipConversationComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/chip-conversation-soon" element={<ProtectedRoute><DashboardLayout><ChipConversationComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/auto-reply" element={<ProtectedRoute><DashboardLayout><AutoReplyComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/auto-reply/:id" element={<ProtectedRoute><DashboardLayout><AutoReplyComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/autoreply" element={<ProtectedRoute><DashboardLayout><AutoReplyComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/autoreply/:id" element={<ProtectedRoute><DashboardLayout><AutoReplyComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/autoreply-soon" element={<ProtectedRoute><DashboardLayout><AutoReplyComingSoon /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/contacts" element={<ProtectedRoute><DashboardLayout><Contacts /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard/templates" element={<ProtectedRoute><DashboardLayout><Templates /></DashboardLayout></ProtectedRoute>} />
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
            <Sonner />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
