import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface CrmCampaign {
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
  device_ids: any;
  messages_per_instance: number | null;
  pause_on_disconnect: boolean;
}

export function useCrmCampaigns() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["crm_campaigns", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CrmCampaign[];
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: (query) => {
      if (document.hidden) return false;
      const campaigns = query.state.data;
      const hasActive = campaigns?.some((c: CrmCampaign) => ["running", "processing"].includes(c.status));
      return hasActive ? 5_000 : 120_000;
    },
  });
}

export function useCreateCrmCampaign() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (campaign: {
      name: string;
      message_type: string;
      message_content?: string;
      media_url?: string;
      buttons?: any[];
      carousel_cards?: any[];
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

      let validDeviceId: string | null = null;
      if (campaignData.device_id) {
        const { data: deviceCheck } = await supabase
          .from("devices")
          .select("id")
          .eq("id", campaignData.device_id)
          .maybeSingle();
        if (deviceCheck) validDeviceId = deviceCheck.id;
      }

      const { data: newCampaign, error: campError } = await supabase
        .from("crm_campaigns")
        .insert({
          name: campaignData.name,
          message_type: campaignData.message_type,
          message_content: campaignData.message_content || null,
          media_url: campaignData.media_url || null,
          buttons: campaignData.buttons || [],
          carousel_cards: campaignData.carousel_cards || null,
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
          name: (c.name || "").trim() || null,
          status: "pending",
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
          .from("crm_campaign_contacts")
          .insert(contactRows);
        if (contactsError) throw contactsError;
      }

      return newCampaign;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm_campaigns"] }),
  });
}

export function useDeleteCrmCampaign() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_campaigns").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["crm_campaigns"] });
      const previous = queryClient.getQueryData(["crm_campaigns", user?.id]);
      queryClient.setQueryData(["crm_campaigns", user?.id], (old: CrmCampaign[] | undefined) =>
        old ? old.filter(c => c.id !== id) : old
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(["crm_campaigns", user?.id], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["crm_campaigns"] }),
  });
}

export function useStartCrmCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, deviceId }: { campaignId: string; deviceId?: string }) => {
      const { data, error } = await supabase.functions.invoke("process-campaign", {
        body: { action: "start", campaignId, deviceId, source: "crm" },
      });
      if (error) throw error;
      if (data?.status === "queued") return data;
      if (data?.error && !data?.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm_campaigns"] }),
  });
}
