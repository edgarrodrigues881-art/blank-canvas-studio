-- Allow admins to update all devices
CREATE POLICY "Admins can update all devices"
ON public.devices
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete all devices
CREATE POLICY "Admins can delete all devices"
ON public.devices
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Transfer the report device to the new admin account
UPDATE public.devices 
SET user_id = 'a5411444-1c99-4319-8307-e4372f37b40f'
WHERE id = '3d3f547d-780c-45b1-a874-614bf348948c';

-- Also update community_settings to ensure wa_report_device_id is accessible
UPDATE public.community_settings 
SET updated_by = 'a5411444-1c99-4319-8307-e4372f37b40f'
WHERE key IN ('wa_report_device_id', 'wa_report_group_id', 'wa_report_group_name');