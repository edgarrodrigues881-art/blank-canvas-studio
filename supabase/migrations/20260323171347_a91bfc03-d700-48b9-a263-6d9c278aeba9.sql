-- Update Junior's 4 existing principal instances with UAZAPI tokens and data from Bubble

-- Instância 1 -> Jose_Alberto_7
UPDATE public.devices
SET name = 'Jose_Alberto_7',
    uazapi_token = '2f646a42-d8fe-4e8f-a24d-0dda4d244948',
    uazapi_base_url = 'https://dgcontingencia.uazapi.com',
    number = '557193285799',
    status = 'connected',
    login_type = 'uazapi',
    updated_at = now()
WHERE id = '2bd4dbaa-0fbb-4a8c-a423-f73b09ac3b88'
  AND user_id = 'fe6c2288-5ed7-4714-ad80-3545ca0ea9d3';

-- Instância 2 -> Jose_Alberto_6
UPDATE public.devices
SET name = 'Jose_Alberto_6',
    uazapi_token = '034cc194-ebfc-48d5-907c-0513bc68aa56',
    uazapi_base_url = 'https://dgcontingencia.uazapi.com',
    number = '557193061855',
    status = 'connected',
    login_type = 'uazapi',
    updated_at = now()
WHERE id = 'c65c6f05-b129-41d2-ac2b-2ed880e81b27'
  AND user_id = 'fe6c2288-5ed7-4714-ad80-3545ca0ea9d3';

-- Instância 3 -> Jose_Alberto_5
UPDATE public.devices
SET name = 'Jose_Alberto_5',
    uazapi_token = '732371b2-07b5-4422-962d-83b101cd3c2f',
    uazapi_base_url = 'https://dgcontingencia.uazapi.com',
    number = '5511925583923',
    status = 'connected',
    login_type = 'uazapi',
    updated_at = now()
WHERE id = 'bf749c45-eb0f-4d11-b135-e15db8f90d90'
  AND user_id = 'fe6c2288-5ed7-4714-ad80-3545ca0ea9d3';

-- Instância 4 -> Jose_Alberto_4
UPDATE public.devices
SET name = 'Jose_Alberto_4',
    uazapi_token = '8bc38e40-83a8-4161-a5ab-7a6745e0e06b',
    uazapi_base_url = 'https://dgcontingencia.uazapi.com',
    number = '5511925161201',
    status = 'connected',
    login_type = 'uazapi',
    updated_at = now()
WHERE id = '0a13c636-0ce1-464f-9776-2082771e23c3'
  AND user_id = 'fe6c2288-5ed7-4714-ad80-3545ca0ea9d3';
