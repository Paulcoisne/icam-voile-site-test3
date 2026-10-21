import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const store = () => getStore({ name: "icamvoile", consistency: "strong" });

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

// SHA-256 du mot de passe administrateur. Le mot de passe n'apparait nulle part en clair.
// Pour le changer : definir la variable d'environnement ADMIN_PASSWORD_SHA256 dans Netlify.
const DEFAULT_HASH = "af663ba52c6bb89d7d568720b1167bb3408c44fd37a722b463ac3c8f7d7de76e";

export function checkPassword(pw) {
  const h = crypto.createHash("sha256").update(String(pw || "")).digest("hex");
  const target = (process.env.ADMIN_PASSWORD_SHA256 || DEFAULT_HASH).toLowerCase();
  return h.length === target.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(target));
}

async function secret() {
  if (process.env.ADMIN_SECRET) return process.env.ADMIN_SECRET;
  const s = store();
  let v = await s.get("_secret");
  if (!v) { v = crypto.randomBytes(32).toString("hex"); await s.set("_secret", v); }
  return v;
}

export async function sign(hours = 8) {
  const exp = Date.now() + hours * 3600e3;
  const p = `admin.${exp}`;
  const mac = crypto.createHmac("sha256", await secret()).update(p).digest("hex");
  return `${p}.${mac}`;
}

export async function verify(req) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const [a, exp, mac] = t.split(".");
  if (a !== "admin" || !exp || !mac || +exp < Date.now()) return false;
  const good = crypto.createHmac("sha256", await secret()).update(`admin.${exp}`).digest("hex");
  return mac.length === good.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good));
}

export const ipKey = (req, ctx) =>
  crypto.createHash("sha256").update(String(ctx?.ip || req.headers.get("x-nf-client-connection-ip") || "0")).digest("hex").slice(0, 24);

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fill = (tpl, vars, escape = true) => String(tpl || "").replace(/\{\{(\w+)\}\}/g, (_, k) => (escape ? esc(vars[k] ?? "") : String(vars[k] ?? "")));
export const textToHtml = (t) => esc(t).replace(/\n/g, "<br>");

export const DEFAULT_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbxXE1if0V5uULzHmGSBOEVixrsTmT0_Ffu-8WO_CVRpO9EG7n2FG2oemTuIxRD-wAo/exec";

// Transmet la demande au script Google de l'association (celui de la premiere version du site),
// qui envoie les e-mails depuis le compte Google : notification a l'equipe et confirmation au prospect.
export async function forwardToGoogle(url, lead) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url || "")) return { ok: false, error: "Lien du script Google invalide." };
  const d = new URLSearchParams();
  ["prenom", "nom", "ent", "fonction", "mail", "tel", "type", "formule", "message"].forEach((k) => d.append(k, lead[k] || ""));
  d.append("website", "");
  try {
    const r = await fetch(url, { method: "POST", body: d, redirect: "follow", signal: AbortSignal.timeout(12000) });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch {}
    if (j && j.ok) return { ok: true };
    if (j && j.erreur) return { ok: false, error: `Script Google : ${j.erreur}` };
    return r.ok ? { ok: true } : { ok: false, error: `Script Google : erreur ${r.status}` };
  } catch (e) {
    return { ok: false, error: "Script Google injoignable." };
  }
}

export const DEFAULT_SETTINGS = {
  forwardGoogle: true,
  appsScriptUrl: DEFAULT_APPS_SCRIPT,
  notifyTo: ["timothee.stevens@2028.icam.fr"],
  sendConfirmation: true,
  confirmSubject: "Icam Voile Lille : nous avons bien reçu votre demande",
  confirmBody:
    "Bonjour {{prenom}},\n\nMerci pour l'intérêt que {{entreprise}} porte à notre campagne pour la Course Croisière EDHEC 2027. Nous revenons vers vous sous 48 heures ouvrées pour fixer un premier échange.\n\nL'équipage d'Icam Voile Lille",
  templates: [
    { name: "Proposition de rendez-vous", subject: "Icam Voile Lille x {{entreprise}} : échangeons sur votre projet",
      body: "Bonjour {{prenom}},\n\nMerci pour votre message. Seriez-vous disponible pour un échange de 20 minutes cette semaine ou la suivante ? Nous vous présenterons le projet et les formules adaptées à vos objectifs de marque employeur.\n\nBien cordialement,\nL'équipe Icam Voile Lille" },
    { name: "Envoi du dossier de partenariat", subject: "Dossier de partenariat Icam Voile Lille",
      body: "Bonjour {{prenom}},\n\nComme convenu, vous trouverez notre dossier de partenariat en suivant ce lien : [lien].\n\nNous restons à votre disposition pour toute question.\n\nBien cordialement,\nL'équipe Icam Voile Lille" },
  ],
};

export async function getSettings() {
  const s = await store().get("settings", { type: "json" });
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}

export const mailConfigured = () => !!process.env.RESEND_API_KEY;

export async function sendMail({ to, subject, html, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "Envoi d'e-mails non configuré (variable RESEND_API_KEY absente)." };
  const from = process.env.MAIL_FROM || "Icam Voile Lille <onboarding@resend.dev>";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, reply_to: replyTo || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, id: j.id } : { ok: false, error: j.message || `Erreur ${r.status}` };
  } catch (e) {
    return { ok: false, error: "Service d'e-mail injoignable." };
  }
}

export const mailLayout = (inner) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f2c47;max-width:600px">${inner}<hr style="border:0;border-top:1px solid #d3e0ea;margin:24px 0"><div style="font-size:12px;color:#4f6b84">Icam Voile Lille, Course Croisière EDHEC 2027</div></div>`;
