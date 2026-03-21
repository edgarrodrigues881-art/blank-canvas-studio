import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = claimsData.claims.sub;

  try {
    const { action, contacts, contactId, updates } = await req.json();

    // Bulk import with deduplication
    if (action === "bulk-import") {
      if (!contacts || !Array.isArray(contacts)) {
        return new Response(JSON.stringify({ error: "Lista de contatos inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get existing contacts for dedup
      const { data: existing } = await supabase
        .from("contacts")
        .select("phone");

      const existingPhones = new Set((existing || []).map((c: any) => c.phone.replace(/\D/g, "")));

      // Filter and validate
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
        });
      }

      let imported = 0;
      if (validated.length > 0) {
        // Insert in batches of 100
        for (let i = 0; i < validated.length; i += 100) {
          const batch = validated.slice(i, i + 100);
          const { error } = await supabase.from("contacts").insert(batch);
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
      const { data: allContacts } = await supabase
        .from("contacts")
        .select("id, phone, created_at")
        .order("created_at", { ascending: true });

      if (!allContacts) {
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
        // Delete in batches
        for (let i = 0; i < toDelete.length; i += 100) {
          const batch = toDelete.slice(i, i + 100);
          await supabase.from("contacts").delete().in("id", batch);
        }
      }

      return new Response(
        JSON.stringify({ removed: toDelete.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate phone numbers
    if (action === "validate-phones") {
      const { data: allContacts } = await supabase
        .from("contacts")
        .select("id, phone, name");

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
      const { contactIds, tag } = await req.json();
      if (!contactIds || !tag) {
        return new Response(JSON.stringify({ error: "IDs e tag são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, tags")
        .in("id", contactIds);

      let updated = 0;
      for (const c of contacts || []) {
        const tags = c.tags || [];
        if (!tags.includes(tag)) {
          await supabase
            .from("contacts")
            .update({ tags: [...tags, tag] })
            .eq("id", c.id);
          updated++;
        }
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
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
