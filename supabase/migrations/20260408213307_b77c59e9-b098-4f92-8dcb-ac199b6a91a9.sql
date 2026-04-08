DELETE FROM autoreply_sessions a
USING autoreply_sessions b
WHERE a.id < b.id
  AND a.flow_id = b.flow_id
  AND a.device_id = b.device_id
  AND a.contact_phone = b.contact_phone;

CREATE UNIQUE INDEX IF NOT EXISTS autoreply_sessions_flow_device_phone_uniq
  ON autoreply_sessions (flow_id, device_id, contact_phone);