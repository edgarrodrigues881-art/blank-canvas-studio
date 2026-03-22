
-- Allow users to update their own tokens (needed for auto-assign on device creation)
CREATE POLICY "Users can update own tokens" ON public.user_api_tokens
FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
