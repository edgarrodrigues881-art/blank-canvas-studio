CREATE POLICY "Users can update own folder devices"
ON public.warmup_folder_devices
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);