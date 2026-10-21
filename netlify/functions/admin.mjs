import { store, json, checkPassword, sign, verify, ipKey, getSettings, DEFAULT_SETTINGS, sendMail, mailConfigured, forwardToGoogle, fill, textToHtml, mailLayout } from "../lib/util.mjs";
import crypto from "node:crypto";

export default async (req, context) => {
  const s = store();
  const route = new URL(req.url).pathname.replace(/^\/api\/admin\/?/, "").replace(/\/$/, "");
  const method = req.method;
  const body = async () => { try { return await req.json(); } catch { return {}; } };

  if (route === "login" && method === "POST") {
    const k = `lock/${ipKey(req, context)}`;
    const lock = (await s.get(k, { type: "json" })) || { n: 0, t: Date.now() };
    if (Date.now() - lock.t > 15 * 60e3) { lock.n = 0; lock.t = Date.now(); }
    if (lock.n >= 8) return json({ error: "Trop de tentatives. Réessayez dans 15 minutes." }, 429);
    const { password } = await body();
    if (!checkPassword(password)) { lock.n++; await s.setJSON(k, lock); await new Promise((r) => setTimeout(r, 600)); return json({ error: "Mot de passe incorrect." }, 401); }
    await s.delete(k);
    return json({ token: await sign() });
  }

  if (!(await verify(req))) return json({ error: "Session expirée. Reconnectez-vous." }, 401);

  if (route === "content" && method === "PUT") {
    const c = await body();
    if (!c || !Array.isArray(c.team) || !c.budget) return json({ error: "Contenu invalide." }, 400);
    c.updatedAt = new Date().toISOString();
    await s.setJSON("content", c);
    return json({ ok: true, updatedAt: c.updatedAt });
  }

  if (route === "media" && method === "POST") {
    const { dataUrl } = await body();
    const m = /^data:(image\/(png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
    if (!m) return json({ error: "Image invalide (PNG, JPG, WebP ou SVG)." }, 400);
    const buf = Buffer.from(m[3], "base64");
    if (buf.length > 2_000_000) return json({ error: "Image trop lourde (2 Mo maximum)." }, 400);
    const id = crypto.randomBytes(12).toString("hex");
    await s.set(`media/${id}`, buf, { metadata: { type: m[1] } });
    return json({ url: `/api/media/${id}` });
  }

  if (route === "leads" && method === "GET") {
    const { blobs } = await s.list({ prefix: "leads/" });
    const leads = (await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })))).filter(Boolean);
    leads.sort((a, b) => (a.date < b.date ? 1 : -1));
    return json({ leads });
  }

  if (route === "lead" && method === "PATCH") {
    const { id, status, notes } = await body();
    const l = await s.get(`leads/${id}`, { type: "json" });
    if (!l) return json({ error: "Demande introuvable." }, 404);
    if (status) l.status = String(status).slice(0, 30);
    if (notes !== undefined) l.notes = String(notes).slice(0, 5000);
    await s.setJSON(`leads/${id}`, l);
    return json({ ok: true, lead: l });
  }

  if (route === "lead" && method === "DELETE") {
    const { id } = await body();
    await s.delete(`leads/${id}`);
    return json({ ok: true });
  }

  if (route === "settings" && method === "GET") return json({ settings: await getSettings(), mailConfigured: mailConfigured(), from: process.env.MAIL_FROM || "" });

  if (route === "settings" && method === "PUT") {
    const b = await body();
    const st = { ...DEFAULT_SETTINGS, ...b };
    st.forwardGoogle = !!st.forwardGoogle;
    st.appsScriptUrl = String(st.appsScriptUrl || "").trim();
    st.notifyTo = (Array.isArray(st.notifyTo) ? st.notifyTo : String(st.notifyTo).split(/[,;\s]+/)).map((x) => x.trim()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)).slice(0, 10);
    await s.setJSON("settings", st);
    return json({ ok: true, settings: st });
  }

  if (route === "test-google" && method === "POST") {
    const st = await getSettings();
    const { to } = await body();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to || "")) return json({ error: "Adresse e-mail invalide." }, 400);
    const g = await forwardToGoogle(st.appsScriptUrl, { prenom: "Test", nom: "Admin", ent: "Test depuis l'administration", mail: to, type: "Test", formule: "", message: "Demande de test envoyée depuis l'administration du site." });
    return g.ok ? json({ ok: true }) : json({ error: g.error }, 502);
  }

  if (route === "send" && method === "POST") {
    const { leadId, to, subject, body: text } = await body();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to || "") || !subject || !text) return json({ error: "Destinataire, objet et message sont obligatoires." }, 400);
    const st = await getSettings();
    let lead = leadId ? await s.get(`leads/${leadId}`, { type: "json" }) : null;
    const vars = lead ? { prenom: lead.prenom, nom: lead.nom, entreprise: lead.ent } : {};
    const r = await sendMail({ to, replyTo: st.notifyTo?.[0], subject: fill(subject, vars, false), html: mailLayout(`<p>${textToHtml(fill(text, vars, false))}</p>`) });
    if (lead) {
      lead.history = lead.history || [];
      lead.history.push({ date: new Date().toISOString(), kind: "envoi", subject: fill(subject, vars, false), ok: r.ok, error: r.error || "" });
      if (r.ok && lead.status === "nouveau") lead.status = "contacté";
      await s.setJSON(`leads/${leadId}`, lead);
    }
    return r.ok ? json({ ok: true, lead }) : json({ error: r.error, lead }, 502);
  }

  return json({ error: "Route inconnue." }, 404);
};
export const config = { path: "/api/admin/*" };
