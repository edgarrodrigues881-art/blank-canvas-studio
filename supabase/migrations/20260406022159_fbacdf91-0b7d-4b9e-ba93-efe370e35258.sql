
-- Team members table
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  member_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'atendente' CHECK (role IN ('admin', 'atendente')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'inactive')),
  invited_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id, member_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Owner can manage their team
CREATE POLICY "Owner can manage team"
ON public.team_members FOR ALL
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- Members can view their own team
CREATE POLICY "Members can view own team"
ON public.team_members FOR SELECT
TO authenticated
USING (member_id = auth.uid());

CREATE INDEX idx_team_members_owner ON public.team_members(owner_id);
CREATE INDEX idx_team_members_member ON public.team_members(member_id);

-- Team invites table
CREATE TABLE public.team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'atendente',
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id, email)
);

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage invites"
ON public.team_invites FOR ALL
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- Add last_seen_at to profiles for presence
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();

-- Allow team members to see owner's conversations (hybrid visibility)
CREATE POLICY "Team members can view owner conversations"
ON public.conversations FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.owner_id = conversations.user_id
    AND team_members.member_id = auth.uid()
    AND team_members.status = 'active'
  )
);

-- Allow team members to update owner's conversations (assign, status change)
CREATE POLICY "Team members can update owner conversations"
ON public.conversations FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.owner_id = conversations.user_id
    AND team_members.member_id = auth.uid()
    AND team_members.status = 'active'
  )
);

-- Allow team members to view and send messages in owner's conversations
CREATE POLICY "Team members can view owner messages"
ON public.conversation_messages FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.owner_id = conversation_messages.user_id
    AND team_members.member_id = auth.uid()
    AND team_members.status = 'active'
  )
);

CREATE POLICY "Team members can send messages"
ON public.conversation_messages FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.conversations c ON c.user_id = tm.owner_id
    WHERE tm.member_id = auth.uid()
    AND tm.status = 'active'
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_team_members_updated_at
BEFORE UPDATE ON public.team_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
