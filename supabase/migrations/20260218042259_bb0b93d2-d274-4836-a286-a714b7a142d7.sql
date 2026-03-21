
ALTER TABLE public.devices
DROP CONSTRAINT devices_proxy_id_fkey,
ADD CONSTRAINT devices_proxy_id_fkey
  FOREIGN KEY (proxy_id) REFERENCES public.proxies(id)
  ON DELETE RESTRICT;
