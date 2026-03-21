
-- Update handle_new_user to auto-create free subscription (3 instances, 3 days)
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

  -- Create free subscription: 3 instances, 3 days trial
  INSERT INTO public.subscriptions (user_id, plan_name, plan_price, max_instances, started_at, expires_at)
  VALUES (
    NEW.id,
    'Free',
    0,
    3,
    now(),
    now() + interval '3 days'
  );

  -- Create initial subscription cycle
  INSERT INTO public.subscription_cycles (user_id, plan_name, cycle_amount, cycle_start, cycle_end, status)
  VALUES (
    NEW.id,
    'Free',
    0,
    now(),
    now() + interval '3 days',
    'paid'
  );

  -- Log
  INSERT INTO public.admin_logs (admin_id, target_user_id, action, details)
  VALUES (
    NEW.id,
    NEW.id,
    'auto-free-trial',
    'Trial gratuito criado automaticamente: 3 instâncias por 3 dias'
  );

  RETURN NEW;
END;
$function$;
