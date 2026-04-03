-- welcome_automations
DROP POLICY "Users see own welcome automations" ON public.welcome_automations;
CREATE POLICY "Users see own welcome automations" ON public.welcome_automations FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY "Users insert own welcome automations" ON public.welcome_automations;
CREATE POLICY "Users insert own welcome automations" ON public.welcome_automations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY "Users update own welcome automations" ON public.welcome_automations;
CREATE POLICY "Users update own welcome automations" ON public.welcome_automations FOR UPDATE TO authenticated USING (user_id = auth.uid());

DROP POLICY "Users delete own welcome automations" ON public.welcome_automations;
CREATE POLICY "Users delete own welcome automations" ON public.welcome_automations FOR DELETE TO authenticated USING (user_id = auth.uid());

-- welcome_automation_groups (uses subquery on welcome_automations)
DROP POLICY "Users manage own welcome groups" ON public.welcome_automation_groups;
CREATE POLICY "Users manage own welcome groups" ON public.welcome_automation_groups FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM welcome_automations a WHERE a.id = welcome_automation_groups.automation_id AND a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM welcome_automations a WHERE a.id = welcome_automation_groups.automation_id AND a.user_id = auth.uid()));

-- welcome_automation_senders (uses subquery on welcome_automations)
DROP POLICY "Users manage own welcome senders" ON public.welcome_automation_senders;
CREATE POLICY "Users manage own welcome senders" ON public.welcome_automation_senders FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM welcome_automations a WHERE a.id = welcome_automation_senders.automation_id AND a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM welcome_automations a WHERE a.id = welcome_automation_senders.automation_id AND a.user_id = auth.uid()));

-- welcome_events
DROP POLICY "Users see own welcome events" ON public.welcome_events;
CREATE POLICY "Users see own welcome events" ON public.welcome_events FOR SELECT TO authenticated USING (user_id = auth.uid());

-- welcome_message_logs (uses subquery on welcome_queue)
DROP POLICY "Users see own welcome message logs" ON public.welcome_message_logs;
CREATE POLICY "Users see own welcome message logs" ON public.welcome_message_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM welcome_queue q WHERE q.id = welcome_message_logs.queue_id AND q.user_id = auth.uid()));

-- welcome_queue
DROP POLICY "Users see own welcome queue" ON public.welcome_queue;
CREATE POLICY "Users see own welcome queue" ON public.welcome_queue FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY "Users update own welcome queue" ON public.welcome_queue;
CREATE POLICY "Users update own welcome queue" ON public.welcome_queue FOR UPDATE TO authenticated USING (user_id = auth.uid());