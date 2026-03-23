-- Create subscription for Junior (10 instances Start plan)
INSERT INTO public.subscriptions (user_id, plan_name, plan_price, max_instances, started_at, expires_at)
VALUES ('fe6c2288-5ed7-4714-ad80-3545ca0ea9d3', 'Start', 178.80, 10, now(), (now() + interval '30 days'));
