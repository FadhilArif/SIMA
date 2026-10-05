import { withSupabase } from "npm:@supabase/server@^1";
import nodemailer from "npm:nodemailer@^9";
import { json, options } from "../_shared/http.ts";

const transport = nodemailer.createTransport({
  host: Deno.env.get("SMTP_HOSTNAME")!,
  port: Number(Deno.env.get("SMTP_PORT") || 587),
  secure: Deno.env.get("SMTP_SECURE") === "true",
  auth: { user: Deno.env.get("SMTP_USERNAME")!, pass: Deno.env.get("SMTP_PASSWORD")! },
});

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const opt = options(req); if (opt) return opt;
    try {
      const { to, subject, text, html } = await req.json();
      if (!to || !subject || (!text && !html)) return json({ error: "Email tidak lengkap." }, 400);
      const { data: profile } = await ctx.supabaseAdmin.from("profiles").select("tipe").eq("id", ctx.user.id).maybeSingle();
      if (!["admin","wakil_rektor"].includes(profile?.tipe || "")) return json({ error: "Hanya Admin/Wakil Rektor." }, 403);
      await transport.sendMail({ from: Deno.env.get("SMTP_FROM")!, to, subject, text, html });
      return json({ ok: true });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }),
};
