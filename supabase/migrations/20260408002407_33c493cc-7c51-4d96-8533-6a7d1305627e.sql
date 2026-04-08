INSERT INTO warmup_instance_groups (device_id, user_id, group_id, group_name, group_jid, invite_link, join_status, joined_at, updated_at)
SELECT d.device_id, d.user_id, g.group_id, g.group_name, g.group_jid, g.invite_link, 'joined', now(), now()
FROM (
  VALUES
    ('1387f28b-acb0-44f9-8c5c-30e5347bc5e0'::uuid, 'f5220141-3b20-4e85-90fd-8c85695686fa'::uuid),
    ('186485a5-7e53-473f-989d-f494221b02e6'::uuid, 'f5220141-3b20-4e85-90fd-8c85695686fa'::uuid),
    ('28cb0659-fc39-4c69-8862-8c7845c70648'::uuid, 'f5220141-3b20-4e85-90fd-8c85695686fa'::uuid),
    ('3494c34f-6ec3-4299-80d3-ed14b1708f1f'::uuid, 'f5220141-3b20-4e85-90fd-8c85695686fa'::uuid),
    ('752e7592-1f26-4789-af95-c75e2c8ccb78'::uuid, 'f5220141-3b20-4e85-90fd-8c85695686fa'::uuid),
    ('9c58297d-dec8-4165-abeb-534c3e83dcbf'::uuid, 'f5220141-3b20-4e85-90fd-8c85695686fa'::uuid),
    ('a3afafd8-a3ca-469e-bc5b-a59aae925f27'::uuid, 'f5220141-3b20-4e85-90fd-8c85695686fa'::uuid),
    ('de673e4a-a41f-4582-bce7-acf07f94e81b'::uuid, 'f5220141-3b20-4e85-90fd-8c85695686fa'::uuid),
    ('f074ede7-1ad0-4ee9-aa7c-7ff224243248'::uuid, 'f5220141-3b20-4e85-90fd-8c85695686fa'::uuid),
    ('449d845e-0606-496f-8109-eb8f7678992b'::uuid, '21c561db-309e-40a3-aead-8779fc3dcb15'::uuid)
) AS d(device_id, user_id)
CROSS JOIN (
  VALUES
    ('2f73275c-daa8-4753-a5c8-fd9b3e543d20'::uuid, 'DG CONTINGÊNCIA #01', '120363405809035769@g.us', 'https://chat.whatsapp.com/I1gvz1bfEhrEIM9iMFsCik'),
    ('1742f2b1-5233-45c3-a804-766ffeb8b910'::uuid, 'DG CONTINGÊNCIA #02', '120363405226063414@g.us', 'https://chat.whatsapp.com/BZNGH9zeFxF5UOj2pD2Wbk'),
    ('25462cff-aaf4-4ad0-86b2-0cd171a29014'::uuid, 'DG CONTINGÊNCIA #03', '120363404615141875@g.us', 'https://chat.whatsapp.com/JnIfueI6qZsFgWuoYimS85'),
    ('14711303-3c14-4b3f-880c-150881e73e02'::uuid, 'DG CONTINGÊNCIA #04', '120363406316804208@g.us', 'https://chat.whatsapp.com/LQ6FaAJJEg28Nm2uDQ0GZx'),
    ('0da622fa-a704-49b7-817a-390f733abfb8'::uuid, 'DG CONTINGÊNCIA #05', '120363406727648858@g.us', 'https://chat.whatsapp.com/KX87z8U37C2042v2Xpw8L9'),
    ('48486c20-92eb-4d33-bc1f-2b845d796bab'::uuid, 'DG CONTINGÊNCIA #06', '120363407593134921@g.us', 'https://chat.whatsapp.com/JXMhmfWADCf2HIMkCQuiyj'),
    ('955da165-9db9-4028-9b4d-781a1ef94d88'::uuid, 'DG CONTINGÊNCIA #07', '120363425044059581@g.us', 'https://chat.whatsapp.com/J0ZrvjhFYkNIqGCAubDWNY'),
    ('04c35078-31d3-4292-ac5a-ec0598bd0548'::uuid, 'DG CONTINGÊNCIA #08', '120363408035119092@g.us', 'https://chat.whatsapp.com/Hz06ObxWZ7ACLOYKCtoLoO')
) AS g(group_id, group_name, group_jid, invite_link)
WHERE NOT EXISTS (
  SELECT 1 FROM warmup_instance_groups wig
  WHERE wig.device_id = d.device_id AND wig.group_jid = g.group_jid
);