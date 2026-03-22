-- Insert admin role for the primary admin (bypasses RLS via migration)
INSERT INTO public.user_roles (user_id, role)
VALUES ('86d67880-af22-4c3f-a2c4-fa324a354737', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;