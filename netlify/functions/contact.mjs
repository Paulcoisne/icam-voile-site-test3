import { store, json, ipKey, getSettings, sendMail, mailConfigured, forwardToGoogle, fill, textToHtml, esc, mailLayout } from "../lib/util.mjs";
import crypto from "node:crypto";

export default async (req, context) => {
  if (req.method !== "POST") return json({ ok: false, erreur: "methode" }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ ok: false, erreur: "format" }, 400); }
  if (b.website) return json({ ok: true }); // pot de miel anti-robots
  const f = (k, n = 200) => String(b[k] || "").trim().slice(0, n);
  const lead = {
    prenom: f("prenom", 80), nom: f("nom", 80), ent: f("ent", 120), fonction: f("fonction", 120),
    mail: f("mail", 160), tel: f("tel", 40), type: f("type", 80), formule: f("formule", 80), message: f("message", 3000),
  };
  if (!lead.prenom || !lead.nom || !lead.ent || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.mail) || !b.rgpd)
    return json({ ok: false, erreur: "champs" }, 400);

  const s = store();
  const rk = `rl/${ipKey(req, context)}`;
  const rl = (await s.get(rk, { type: "json" })) || { n: 0, t: Date.now() };
  if (Date.now() - rl.t > 3600e3) { rl.n = 0; rl.t = Date.now(); }
  if (rl.n >= 5) return json({ ok: false, erreur: "limite" }, 429);
  rl.n++; await s.setJSON(rk, rl);

  const id = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const record = { id, date: new Date().toISOString(), ...lead, status: "nouveau", notes: "", history: [] };

  const st = await getSettings();
  const vars = { prenom: lead.prenom, nom: lead.nom, entreprise: lead.ent };
  let googleOk = false;
  if (st.forwardGoogle && st.appsScriptUrl) {
    const g = await forwardToGoogle(st.appsScriptUrl, lead);
    googleOk = g.ok;
    record.history.push({ date: record.date, kind: "e-mails via Google", ok: g.ok, error: g.error || "" });
  }
  // Envoi par Resend seulement s'il est configuré et que le script Google n'a pas pris le relais
  const useResend = mailConfigured() && !googleOk;
  if (useResend && st.notifyTo?.length) {
    const rows = Object.entries({ Nom: `${lead.prenom} ${lead.nom}`, Entreprise: lead.ent, Fonction: lead.fonction, "E-mail": lead.mail, Téléphone: lead.tel, Soutien: lead.type, Formule: lead.formule })
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#4f6b84">${k}</td><td><b>${esc(v)}</b></td></tr>`).join("");
    const r = await sendMail({ to: st.notifyTo, replyTo: lead.mail, subject: `Nouvelle demande de partenariat : ${lead.ent}`,
      html: mailLayout(`<p>Nouvelle demande reçue via le site.</p><table>${rows}</table><p>${textToHtml(lead.message)}</p>`) });
    record.history.push({ date: record.date, kind: "notification", ok: r.ok, error: r.error || "" });
  }
  if (useResend && st.sendConfirmation) {
    const r = await sendMail({ to: lead.mail, replyTo: st.notifyTo?.[0], subject: fill(st.confirmSubject, vars, false),
      html: mailLayout(`<p>${textToHtml(fill(st.confirmBody, vars, false))}</p>`) });
    record.history.push({ date: record.date, kind: "confirmation", ok: r.ok, error: r.error || "" });
  }
  await s.setJSON(`leads/${id}`, record);
  return json({ ok: true });
};
export const config = { path: "/api/contact" };
