import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface Campaign {
  id: string;
  name: string;
  status: string;
  message_type: string;
  message_content: string | null;
  media_url: string | null;
  buttons: any[];
  template_id: string | null;
  total_contacts: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  min_delay_seconds: number;
  max_delay_seconds: number;
  pause_every_min: number;
  pause_every_max: number;
  pause_duration_min: number;
  pause_duration_max: number;
  device_id: string | null;
}

export interface CampaignContact {
  id: string;
  campaign_id: string;
  contact_id: string | null;
  phone: string;
  name: string | null;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

export function useCampaigns() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("campaigns-list-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campaigns", filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["campaigns"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  return useQuery({
    queryKey: ["campaigns", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, status, message_type, message_content, media_url, buttons, template_id, total_contacts, sent_count, delivered_count, failed_count, scheduled_at, started_at, completed_at, created_at, updated_at, min_delay_seconds, max_delay_seconds, pause_every_min, pause_every_max, pause_duration_min, pause_duration_max, device_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Campaign[];
    },
    enabled: !!user,
    refetchInterval: (query) => {
      const campaigns = query.state.data;
      const hasActive = campaigns?.some((c: Campaign) => ["running", "processing"].includes(c.status));
      return hasActive ? 5000 : false; // Only poll when active campaigns exist; realtime handles the rest
    },
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (campaign: {
      name: string;
      message_type: string;
      message_content?: string;
      media_url?: string;
      buttons?: any[];
      template_id?: string;
      scheduled_at?: string;
      min_delay_seconds?: number;
      max_delay_seconds?: number;
      pause_every_min?: number;
      pause_every_max?: number;
      pause_duration_min?: number;
      pause_duration_max?: number;
      device_id?: string;
      device_ids?: string[];
      messages_per_instance?: number;
      pause_on_disconnect?: boolean;
      contacts: { phone: string; name?: string; var1?: string; var2?: string; var3?: string; var4?: string; var5?: string; var6?: string; var7?: string; var8?: string; var9?: string; var10?: string }[];
    }) => {
      const { contacts, ...campaignData } = campaign;

      // Validate device_id exists before inserting
      let validDeviceId: string | null = null;
      if (campaignData.device_id) {
        const { data: deviceCheck } = await supabase
          .from("devices")
          .select("id")
          .eq("id", campaignData.device_id)
          .maybeSingle();
        if (deviceCheck) {
          validDeviceId = deviceCheck.id;
        }
      }

      const { data: newCampaign, error: campError } = await supabase
        .from("campaigns")
        .insert({
          name: campaignData.name,
          message_type: campaignData.message_type,
          message_content: campaignData.message_content || null,
          media_url: campaignData.media_url || null,
          buttons: campaignData.buttons || [],
          template_id: campaignData.template_id || null,
          scheduled_at: campaignData.scheduled_at || null,
          min_delay_seconds: campaignData.min_delay_seconds ?? 8,
          max_delay_seconds: campaignData.max_delay_seconds ?? 25,
          pause_every_min: campaignData.pause_every_min ?? 10,
          pause_every_max: campaignData.pause_every_max ?? 20,
          pause_duration_min: campaignData.pause_duration_min ?? 30,
          pause_duration_max: campaignData.pause_duration_max ?? 120,
          device_id: validDeviceId,
          device_ids: campaignData.device_ids || [],
          messages_per_instance: campaignData.messages_per_instance || 0,
          pause_on_disconnect: campaignData.pause_on_disconnect ?? true,
          user_id: user!.id,
          total_contacts: contacts.length,
          status: campaignData.scheduled_at ? "scheduled" : "pending",
        })
        .select("id, name, status, user_id, device_id, device_ids, total_contacts, scheduled_at, created_at")
        .single();
      if (campError) throw campError;

      if (contacts.length > 0) {
        const contactRows = contacts.map(c => ({
          campaign_id: newCampaign.id,
          phone: c.phone,
          name: c.name || null,
          var1: c.var1 || "",
          var2: c.var2 || "",
          var3: c.var3 || "",
          var4: c.var4 || "",
          var5: c.var5 || "",
          var6: c.var6 || "",
          var7: c.var7 || "",
          var8: c.var8 || "",
          var9: c.var9 || "",
          var10: c.var10 || "",
        }));
        const { error: contactsError } = await supabase
          .from("campaign_contacts")
          .insert(contactRows);
        if (contactsError) throw contactsError;
      }

      return newCampaign;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

export function useStartCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, deviceId }: { campaignId: string; deviceId?: string }) => {
      const { data, error } = await supabase.functions.invoke("process-campaign", {
        body: { action: "start", campaignId, deviceId },
      });
      if (error) throw error;
      // Handle queued status (device busy)
      if (data?.status === "queued") {
        return data; // Not an error — campaign is queued
      }
      // Handle unexpected errors
      if (data?.error && !data?.success) {
        throw new Error(data.error);
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["campaigns"] });
      const previous = queryClient.getQueryData(["campaigns", user?.id]);
      queryClient.setQueryData(["campaigns", user?.id], (old: Campaign[] | undefined) =>
        old ? old.filter(c => c.id !== id) : old
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(["campaigns", user?.id], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}
