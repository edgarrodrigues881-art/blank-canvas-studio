import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AnnouncementPopup, type AnnouncementData } from "./AnnouncementPopup";

/**
 * This component is rendered inside DashboardLayout and shows
 * active announcements to the user based on display rules.
 */
export function AnnouncementManager() {
  const { user } = useAuth();
  const [visibleAnnouncement, setVisibleAnnouncement] = useState<AnnouncementData | null>(null);

  // Fetch active announcements
  const { data: announcements = [] } = useQuery({
    queryKey: ["user-announcements", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements" as any)
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 60_000,
  });

  // Fetch user dismissals
  const { data: dismissals = [] } = useQuery({
    queryKey: ["announcement-dismissals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcement_dismissals" as any)
        .select("announcement_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data || []).map((d: any) => d.announcement_id as string);
    },
    staleTime: 60_000,
  });

  const dismissMutation = useMutation({
    mutationFn: async (announcementId: string) => {
      await supabase.from("announcement_dismissals" as any).insert({
        user_id: user!.id,
        announcement_id: announcementId,
      });
    },
  });

  // Determine which announcement to show
  useEffect(() => {
    if (!announcements.length || !user) return;

    const now = new Date();
    const sessionKey = `announcement_session_${user.id}`;
    const sessionSeen = JSON.parse(sessionStorage.getItem(sessionKey) || "[]") as string[];

    for (const a of announcements) {
      // Date range check
      if (a.display_mode === "date_range") {
        if (a.start_date && new Date(a.start_date) > now) continue;
        if (a.end_date && new Date(a.end_date) < now) continue;
      }

      // "once" mode: skip if dismissed
      if (a.display_mode === "once" && dismissals.includes(a.id)) continue;

      // "always" mode: skip if already shown this session
      if (a.display_mode === "always" && sessionSeen.includes(a.id)) continue;

      // "date_range" mode: skip if dismissed
      if (a.display_mode === "date_range" && dismissals.includes(a.id)) continue;

      setVisibleAnnouncement({
        id: a.id,
        title: a.title,
        description: a.description,
        image_url: a.image_url,
        show_logo: a.show_logo,
        button_text: a.button_text,
        button_link: a.button_link,
        button_action: a.button_action,
        allow_close: a.allow_close,
        allow_dismiss: a.allow_dismiss,
      });
      return;
    }
  }, [announcements, dismissals, user]);

  const handleClose = () => {
    if (visibleAnnouncement && user) {
      // Mark as seen this session for "always" mode
      const sessionKey = `announcement_session_${user.id}`;
      const sessionSeen = JSON.parse(sessionStorage.getItem(sessionKey) || "[]") as string[];
      if (!sessionSeen.includes(visibleAnnouncement.id)) {
        sessionSeen.push(visibleAnnouncement.id);
        sessionStorage.setItem(sessionKey, JSON.stringify(sessionSeen));
      }
    }
    setVisibleAnnouncement(null);
  };

  const handleDismiss = () => {
    if (visibleAnnouncement) {
      dismissMutation.mutate(visibleAnnouncement.id);
    }
    setVisibleAnnouncement(null);
  };

  if (!visibleAnnouncement) return null;

  return (
    <AnnouncementPopup
      announcement={visibleAnnouncement}
      onClose={handleClose}
      onDismiss={handleDismiss}
    />
  );
}
