import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export interface TeamMember {
  id: string;
  owner_id: string;
  member_id: string;
  role: "admin" | "atendente";
  status: "pending" | "active" | "inactive";
  invited_email: string | null;
  created_at: string;
  // joined
  profile?: { full_name: string | null; email: string | null; last_seen_at: string | null };
}

export interface TeamInvite {
  id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export function useTeam() {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [myTeamRole, setMyTeamRole] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  // Determine if this user is owner or a team member
  useEffect(() => {
    if (!user) return;

    const checkRole = async () => {
      // Check if user is a member of someone's team
      const { data: membership } = await supabase
        .from("team_members")
        .select("*")
        .eq("member_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (membership) {
        setMyTeamRole(membership.role);
        setOwnerId(membership.owner_id);
      } else {
        // User is the owner of their own workspace
        setMyTeamRole("admin");
        setOwnerId(user.id);
      }
    };
    checkRole();
  }, [user]);

  const fetchMembers = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("team_members")
      .select("*")
      .eq("owner_id", ownerId || user.id)
      .order("created_at", { ascending: true });

    if (!error && data) {
      // Fetch profiles for each member
      const memberIds = data.map((m: any) => m.member_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, phone, last_seen_at")
        .in("id", memberIds);

      const profileMap = new Map(
        (profiles || []).map((p: any) => [p.id, p])
      );

      const enriched: TeamMember[] = data.map((m: any) => ({
        ...m,
        profile: profileMap.get(m.member_id) || null,
      }));

      setMembers(enriched);
    }
    setLoading(false);
  }, [user, ownerId]);

  const fetchInvites = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("team_invites")
      .select("*")
      .eq("owner_id", user.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });

    setInvites((data || []) as TeamInvite[]);
  }, [user]);

  useEffect(() => {
    if (ownerId) {
      fetchMembers();
      fetchInvites();
    }
  }, [ownerId, fetchMembers, fetchInvites]);

  // Invite a new team member by email
  const inviteMember = useCallback(async (email: string, role: string = "atendente") => {
    if (!user) return;
    const { error } = await supabase.from("team_invites").insert({
      owner_id: user.id,
      email: email.toLowerCase().trim(),
      role,
    } as any);

    if (error) {
      if (error.code === "23505") toast.error("Este email já foi convidado");
      else toast.error("Erro ao enviar convite: " + error.message);
      return false;
    }
    toast.success(`Convite enviado para ${email}`);
    fetchInvites();
    return true;
  }, [user, fetchInvites]);

  // Create a team member directly (admin creates account)
  const addMemberDirectly = useCallback(async (memberId: string, role: string = "atendente") => {
    if (!user) return;
    const { error } = await supabase.from("team_members").insert({
      owner_id: user.id,
      member_id: memberId,
      role,
      status: "active",
    } as any);

    if (error) {
      if (error.code === "23505") toast.error("Este membro já faz parte da equipe");
      else toast.error("Erro ao adicionar membro: " + error.message);
      return false;
    }
    toast.success("Membro adicionado à equipe");
    fetchMembers();
    return true;
  }, [user, fetchMembers]);

  // Update member role
  const updateMemberRole = useCallback(async (memberId: string, newRole: string) => {
    await supabase.from("team_members")
      .update({ role: newRole } as any)
      .eq("id", memberId);
    toast.success("Papel atualizado");
    fetchMembers();
  }, [fetchMembers]);

  // Remove member
  const removeMember = useCallback(async (id: string) => {
    await supabase.from("team_members")
      .update({ status: "inactive" } as any)
      .eq("id", id);
    toast.success("Membro removido");
    fetchMembers();
  }, [fetchMembers]);

  // Cancel invite
  const cancelInvite = useCallback(async (id: string) => {
    await supabase.from("team_invites").delete().eq("id", id);
    toast.success("Convite cancelado");
    fetchInvites();
  }, [fetchInvites]);

  // Update presence (call periodically)
  const updatePresence = useCallback(async () => {
    if (!user) return;
    await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() } as any).eq("id", user.id);
  }, [user]);

  // Check if member is online (seen in last 2 minutes)
  const isOnline = useCallback((lastSeenAt: string | null) => {
    if (!lastSeenAt) return false;
    return Date.now() - new Date(lastSeenAt).getTime() < 2 * 60 * 1000;
  }, []);

  return {
    members: members.filter((m) => m.status === "active"),
    invites,
    loading,
    myTeamRole,
    ownerId,
    inviteMember,
    addMemberDirectly,
    updateMemberRole,
    removeMember,
    cancelInvite,
    updatePresence,
    isOnline,
    fetchMembers,
  };
}
