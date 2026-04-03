-- Drop the public-role UPDATE policies (authenticated versions already exist)
DROP POLICY "Users can update own devices" ON public.devices;
DROP POLICY "Users can update own proxies" ON public.proxies;