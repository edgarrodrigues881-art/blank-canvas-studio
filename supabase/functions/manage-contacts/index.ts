import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = user.id;

  try {
    const body = await req.json();
    const { action } = body;

    // Bulk import with deduplication
    if (action === "bulk-import") {
      const { contacts } = body;
      if (!contacts || !Array.isArray(contacts)) {
        return new Response(JSON.stringify({ error: "Lista de contatos inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get existing contacts for dedup
      const { data: existing } = await admin
        .from("contacts")
        .select("phone")
        .eq("user_id", userId);

      const existingPhones = new Set((existing || []).map((c: any) => c.phone.replace(/\D/g, "")));

      const validated: any[] = [];
      const skipped: string[] = [];

      for (const c of contacts) {
        const phone = (c.phone || "").replace(/\D/g, "");
        if (phone.length < 10) {
          skipped.push(`${c.name || "?"}: número inválido`);
          continue;
        }
        if (existingPhones.has(phone)) {
          skipped.push(`${c.name || "?"}: duplicado`);
          continue;
        }
        existingPhones.add(phone);

        const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;
        validated.push({
          user_id: userId,
          name: c.name || "Sem nome",
          phone: formattedPhone,
          email: c.email || null,
          tags: c.tags || [],
          notes: c.notes || null,
          var1: c.var1 || "", var2: c.var2 || "", var3: c.var3 || "", var4: c.var4 || "",
          var5: c.var5 || "", var6: c.var6 || "", var7: c.var7 || "", var8: c.var8 || "",
          var9: c.var9 || "", var10: c.var10 || "",
        });
      }

      let imported = 0;
      if (validated.length > 0) {
        const BATCH = 500;
        for (let i = 0; i < validated.length; i += BATCH) {
          const batch = validated.slice(i, i + BATCH);
          const { error } = await admin.from("contacts").insert(batch);
          if (error) throw error;
          imported += batch.length;
        }
      }

      return new Response(
        JSON.stringify({ imported, skipped: skipped.length, skippedDetails: skipped.slice(0, 20), total: contacts.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Remove duplicates
    if (action === "remove-duplicates") {
      const { data: allContacts } = await admin
        .from("contacts")
        .select("id, phone, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (!allContacts?.length) {
        return new Response(JSON.stringify({ removed: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const seen = new Map<string, string>();
      const toDelete: string[] = [];

      for (const c of allContacts) {
        const normalized = c.phone.replace(/\D/g, "");
        if (seen.has(normalized)) {
          toDelete.push(c.id);
        } else {
          seen.set(normalized, c.id);
        }
      }

      if (toDelete.length > 0) {
        const BATCH = 500;
        for (let i = 0; i < toDelete.length; i += BATCH) {
          const batch = toDelete.slice(i, i + BATCH);
          await admin.from("contacts").delete().in("id", batch);
        }
      }

      return new Response(
        JSON.stringify({ removed: toDelete.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate phone numbers
    if (action === "validate-phones") {
      const { data: allContacts } = await admin
        .from("contacts")
        .select("id, phone, name")
        .eq("user_id", userId);

      const invalid: any[] = [];
      for (const c of allContacts || []) {
        const phone = c.phone.replace(/\D/g, "");
        if (phone.length < 10 || phone.length > 15) {
          invalid.push({ id: c.id, name: c.name, phone: c.phone, reason: "Tamanho inválido" });
        }
      }

      return new Response(
        JSON.stringify({ total: (allContacts || []).length, invalid }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Bulk tag
    if (action === "bulk-tag") {
      const { contactIds, tag } = body;
      if (!contactIds || !tag) {
        return new Response(JSON.stringify({ error: "IDs e tag são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: contacts } = await admin
        .from("contacts")
        .select("id, tags")
        .eq("user_id", userId)
        .in("id", contactIds);

      let updated = 0;
      const BATCH = 50;
      const toUpdate = (contacts || []).filter((c: any) => !(c.tags || []).includes(tag));

      for (let i = 0; i < toUpdate.length; i += BATCH) {
        const chunk = toUpdate.slice(i, i + BATCH);
        await Promise.all(
          chunk.map((c: any) =>
            admin.from("contacts").update({ tags: [...(c.tags || []), tag] }).eq("id", c.id)
          )
        );
        updated += chunk.length;
      }

      return new Response(
        JSON.stringify({ updated }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
