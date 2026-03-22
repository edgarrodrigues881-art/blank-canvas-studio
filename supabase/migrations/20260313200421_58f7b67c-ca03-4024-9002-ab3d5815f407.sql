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

  -- Auto-populate warmup groups from pool
  INSERT INTO public.warmup_groups (user_id, name, link, description)
  SELECT
    NEW.id,
    gp.name,
    gp.external_group_ref,
    'Grupo de aquecimento automático'
  FROM public.warmup_groups_pool gp
  WHERE gp.is_active = true;

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