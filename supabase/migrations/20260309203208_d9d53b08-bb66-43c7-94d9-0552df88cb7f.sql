
-- 1) Create a function to atomically claim pending messages (prevents parallel processing)
CREATE OR REPLACE FUNCTION public.claim_pending_messages(_limit integer DEFAULT 50)
RETURNS SETOF message_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.message_queue
  SET status = 'sent', updated_at = now()
  WHERE id IN (
    SELECT id FROM public.message_queue
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

-- 2) Update handle_new_user to NOT insert WELCOME into message_queue (wa-lifecycle handles it)
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, full_name, phone, company)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'phone',
    NEW.raw_user_meta_data ->> 'company'
  );

  -- Create Trial subscription: 3 instances, 3 days
  INSERT INTO public.subscriptions (user_id, plan_name, plan_price, max_instances, started_at, expires_at)
  VALUES (
    NEW.id,
    'Trial',
    0,
    3,
    now(),
    now() + interval '3 days'
  );

  -- Create initial subscription cycle
  INSERT INTO public.subscription_cycles (user_id, plan_name, cycle_amount, cycle_start, cycle_end, status)
  VALUES (
    NEW.id,
    'Trial',
    0,
    now(),
    now() + interval '3 days',
    'paid'
  );

  -- Assign default 'user' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- NOTE: WELCOME message is now handled by wa-lifecycle (called from provision-trial)
  -- No longer inserting into message_queue here to avoid duplicate messages

  -- Log
  INSERT INTO public.admin_logs (admin_id, target_user_id, action, details)
  VALUES (
    NEW.id,
    NEW.id,
    'auto-trial',
    'Trial automático criado: 3 instâncias por 3 dias'
  );

  RETURN NEW;
END;
$function$;
