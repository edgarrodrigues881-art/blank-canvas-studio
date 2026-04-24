-- Move all existing leads from secondary default stages to "novo"
UPDATE public.service_contacts
SET pipeline_stage = 'novo', updated_at = now()
WHERE pipeline_stage IN ('respondeu','interessado','agendado','negociacao','fechado','perdido');