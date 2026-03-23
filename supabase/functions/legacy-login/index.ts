import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const USER_ID_TABLES = [
  "alerts",
  "autoreply_flows",
  "autoreply_sessions",
  "campaign_device_locks",
  "campaigns",
  "chip_conversation_logs",
  "chip_conversations",
  "client_messages",
  "community_warmup_configs",
  "community_warmup_logs",
  "contacts",
  "delay_profiles",
  "devices",
  "group_interaction_logs",
  "group_interactions",
  "group_join_campaigns",
  "group_join_logs",
  "group_join_queue",
  "message_queue",
  "notifications",
  "operation_logs",
  "payments",
  "proxies",
  "report_wa_configs",
  "report_wa_logs",
  "subscription_cycles",
  "subscriptions",
  "templates",
  "user_api_tokens",
  "user_roles",
  "warmup_audit_logs",
  "warmup_autosave_contacts",
  "warmup_community_membership",
  "warmup_cycles",
  "warmup_jobs",
  "warmup_groups",
  "admin_dispatch_contacts",
];

const TARGET_USER_ID_TABLES = ["admin_logs"];

const digitsOnly = (value: string | null | undefined) => (value || "").replace(/\D/g, "");

const normalizeIdentity = (value: string | null | undefined) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

const isEmailIdentifier = (value: string) => value.includes("@");

const buildPhoneCandidates = (input: string) => {
  const digits = digitsOnly(input);
  const values = new Set<string>();
  if (!digits) return [];

  values.add(digits);

  if (digits.length >= 11) values.add(digits.slice(-11));
  if (digits.length >= 10) values.add(digits.slice(-10));

  if (digits.startsWith("55") && digits.length > 11) {
    values.add(digits.slice(2));
  } else if (!digits.startsWith("55")) {
    values.add(`55${digits}`);
  }

  return [...values].filter(Boolean);
};

const phoneMatches = (storedPhone: string | null, candidates: string[]) => {
  const storedDigits = digitsOnly(storedPhone);
  if (!storedDigits) return false;

  return candidates.some((candidate) => {
    if (!candidate) return false;
    return storedDigits === candidate || storedDigits.endsWith(candidate) || candidate.endsWith(storedDigits);
  });
};

const resolveProfileFromEmail = (
  profiles: Array<{ id: string; full_name: string | null; company: string | null; phone: string | null }>,
  email: string,
) => {
  const emailStem = normalizeIdentity(email.split("@")[0]);
  if (!emailStem) return null;

  const ranked = profiles
    .map((profile) => {
      const fullName = normalizeIdentity(profile.full_name);
      const company = normalizeIdentity(profile.company);

      let score = 0;
      if (fullName) {
        if (emailStem === fullName) score = Math.max(score, 100);
        else if (emailStem.includes(fullName) || fullName.includes(emailStem)) score = Math.max(score, 90);
      }

      if (company) {
        if (emailStem === company) score = Math.max(score, 70);
        else if (emailStem.includes(company) || company.includes(emailStem)) score = Math.max(score, 60);
      }

      return { profile, score };
    })
    .filter((entry) => entry.score >= 90)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return null;
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) return null;
  return ranked[0].profile;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function updateUserId(adminClient: any, table: string, fromUserId: string, toUserId: string) {
  try {
    const { error } = await adminClient.from(table).update({ user_id: toUserId }).eq("user_id", fromUserId);
    if (error) {
      console.error(`[legacy-login] ${table} user_id migration failed:`, error.message);
    }
  } catch (error) {
    console.error(`[legacy-login] ${table} user_id migration exception:`, error);
  }
}

async function updateTargetUserId(adminClient: any, table: string, fromUserId: string, toUserId: string) {
  try {
    const { error } = await adminClient.from(table).update({ target_user_id: toUserId }).eq("target_user_id", fromUserId);
    if (error) {
      console.error(`[legacy-login] ${table} target_user_id migration failed:`, error.message);
    }
  } catch (error) {
    console.error(`[legacy-login] ${table} target_user_id migration exception:`, error);
  }
}

async function migrateProfileRow(adminClient: any, legacyUserId: string, newUserId: string) {
  const { data: legacyProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("admin_notes, avatar_url, client_type, company, created_at, document, full_name, instance_override, notificacao_liberada, phone, risk_flag, status, updated_at, whatsapp_monitor_token")
    .eq("id", legacyUserId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`profile_migration_failed:${profileError.message}`);
  }

  if (!legacyProfile) {
    throw new Error("legacy_profile_not_found");
  }

  const { error: upsertError } = await adminClient.from("profiles").upsert(
    {
      id: newUserId,
      ...legacyProfile,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (upsertError) {
    throw new Error(`profile_upsert_failed:${upsertError.message}`);
  }

  if (legacyUserId !== newUserId) {
    await adminClient.from("profiles").delete().eq("id", legacyUserId);
  }
}

async function migrateAdminProfileData(adminClient: any, legacyUserId: string, newUserId: string) {
  const { data } = await adminClient
    .from("admin_profile_data")
    .select("admin_notes, created_at, risk_flag, updated_at")
    .eq("id", legacyUserId)
    .maybeSingle();

  if (!data) return;

  const { error } = await adminClient.from("admin_profile_data").upsert(
    {
      id: newUserId,
      ...data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("[legacy-login] admin_profile_data migration failed:", error.message);
    return;
  }

  if (legacyUserId !== newUserId) {
    await adminClient.from("admin_profile_data").delete().eq("id", legacyUserId);
  }
}

async function restoreLegacyData(adminClient: any, legacyUserId: string, newUserId: string) {
  await migrateProfileRow(adminClient, legacyUserId, newUserId);
  await migrateAdminProfileData(adminClient, legacyUserId, newUserId);

  await Promise.all([
    ...USER_ID_TABLES.map((table) => updateUserId(adminClient, table, legacyUserId, newUserId)),
    ...TARGET_USER_ID_TABLES.map((table) => updateTargetUserId(adminClient, table, legacyUserId, newUserId)),
  ]);
}

async function listAuthUsers(adminClient: any) {
  const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    throw new Error(`auth_list_failed:${error.message}`);
  }
  return data.users || [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "missing_server_configuration" }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { identifier, password } = await req.json();

    const rawIdentifier = String(identifier || "").trim().toLowerCase();
    const emailIdentifier = isEmailIdentifier(rawIdentifier);
    const normalizedIdentifier = emailIdentifier ? rawIdentifier : digitsOnly(rawIdentifier);

    if (!normalizedIdentifier || (!emailIdentifier && normalizedIdentifier.length < 10)) {
      return json({ error: emailIdentifier ? "invalid_email_identifier" : "invalid_phone_identifier" }, 400);
    }

    if (typeof password !== "string" || password.length < 8) {
      return json({ error: "invalid_password" }, 400);
    }

    const { data: profiles, error: profileFetchError } = await adminClient
      .from("profiles")
      .select("id, full_name, phone, company")
      .order("created_at", { ascending: false });

    if (profileFetchError) {
      console.error("[legacy-login] profile fetch failed:", profileFetchError.message);
      return json({ error: "profile_lookup_failed" }, 500);
    }

    const authUsers = await listAuthUsers(adminClient);
    const existingAuthUser = authUsers.find((user: { email?: string | null }) => (user.email || "").toLowerCase() === rawIdentifier);

    const phoneCandidates = emailIdentifier ? [] : buildPhoneCandidates(normalizedIdentifier);
    const legacyProfile = emailIdentifier
      ? resolveProfileFromEmail(profiles || [], rawIdentifier)
      : (profiles || []).find((profile: { phone: string | null }) => phoneMatches(profile.phone, phoneCandidates));

    if (existingAuthUser) {
      if (legacyProfile && existingAuthUser.id !== legacyProfile.id) {
        await restoreLegacyData(adminClient, legacyProfile.id, existingAuthUser.id);
        await adminClient.auth.admin.updateUserById(existingAuthUser.id, {
          user_metadata: {
            ...(existingAuthUser.user_metadata || {}),
            full_name: legacyProfile.full_name || existingAuthUser.user_metadata?.full_name || "",
            company: legacyProfile.company || existingAuthUser.user_metadata?.company || "",
            phone: digitsOnly(legacyProfile.phone) || existingAuthUser.user_metadata?.phone || "",
            legacy_restored_from: legacyProfile.id,
          },
        });
      }

      return json({ email: existingAuthUser.email, restored: false, linked: Boolean(legacyProfile) });
    }

    if (!legacyProfile) {
      return json({ error: "legacy_profile_not_found" }, 404);
    }

    const normalizedPhone = digitsOnly(legacyProfile.phone) || normalizedIdentifier;
    const loginEmail = emailIdentifier ? rawIdentifier : `legacy.${normalizedPhone}.${legacyProfile.id.slice(0, 8)}@dg-login.local`;

    const { data: createdUserData, error: createError } = await adminClient.auth.admin.createUser({
      email: loginEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: legacyProfile.full_name || "",
        company: legacyProfile.company || "",
        phone: normalizedPhone,
        legacy_restored_from: legacyProfile.id,
      },
    });

    if (createError || !createdUserData.user) {
      console.error("[legacy-login] auth user create failed:", createError?.message);
      return json({ error: "legacy_auth_create_failed" }, 500);
    }

    await restoreLegacyData(adminClient, legacyProfile.id, createdUserData.user.id);

    return json({
      email: loginEmail,
      restored: true,
      linked: false,
      user_id: createdUserData.user.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("[legacy-login] unexpected error:", message);
    return json({ error: message }, 500);
  }
});