// Trouve le logo d'une entreprise a partir de son nom de domaine, sans IA :
// 1) logo declare dans la page d'accueil (SVG en ligne, <img> "logo"), 2) icone haute definition, 3) favicon.
import { store, json } from "../lib/util.mjs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const okHost = (h) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(h) && !/^\d+(\.\d+){3}$/.test(h) && !/(^|\.)(localhost|local|internal)$/i.test(h);

async function get(url, ms = 6000) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) || !okHost(u.hostname)) throw new Error("url");
  const r = await fetch(u, { redirect: "follow", headers: { "user-agent": UA, accept: "text/html,image/*,*/*;q=0.8" }, signal: AbortSignal.timeout(ms) });
  if (!okHost(new URL(r.url).hostname)) throw new Error("redir");
  return r;
}

const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")); return m ? (m[2] ?? m[3] ?? m[4] ?? "") : ""; };

function candidates(html, base) {
  const out = [];
  const headerEnd = Math.max(html.search(/<\/header>/i), 0) || 20000;
  // SVG en ligne marque "logo"
  const svgRe = /<svg\b[\s\S]*?<\/svg>/gi; let m;
  while ((m = svgRe.exec(html)) && out.length < 40) {
    const ctx = html.slice(Math.max(0, m.index - 400), m.index + 300);
    if (/logo|brand/i.test(ctx) && m[0].length > 300 && m[0].length < 250000) {
      let svg = m[0];
      if (!/xmlns=/.test(svg)) svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
      out.push({ score: 9 + (m.index < headerEnd ? 3 : 0), inline: svg, src: "site-svg" });
      break;
    }
  }
  // Images marquees "logo"
  for (const t of html.match(/<img\b[^>]*>/gi) || []) {
    const src = attr(t, "src") || attr(t, "data-src") || (attr(t, "srcset").split(/\s+/)[0] || "");
    if (!src || src.startsWith("data:") && src.length < 200) continue;
    const meta = `${src} ${attr(t, "alt")} ${attr(t, "class")} ${attr(t, "id")}`;
    if (!/logo|brand/i.test(meta)) continue;
    let sc = 6;
    if (/\.svg(\?|$)/i.test(src)) sc += 2;
    if (html.indexOf(t) < headerEnd) sc += 2;
    if (/footer|partner|client|award|badge|app-?store|google-?play/i.test(meta)) sc -= 4;
    try { out.push({ score: sc, url: new URL(src, base).href, src: "site-logo" }); } catch {}
  }
  // Icones declarees
  for (const t of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = attr(t, "rel").toLowerCase(); const href = attr(t, "href");
    if (!href || !/icon/.test(rel)) continue;
    const size = parseInt((attr(t, "sizes").match(/\d+/) || ["0"])[0], 10);
    let sc = rel.includes("apple-touch") ? 4 : 2; if (size >= 128) sc += 1; if (/\.svg/i.test(href)) sc += 1;
    try { out.push({ score: sc, url: new URL(href, base).href, src: "icon" }); } catch {}
  }
  return out.sort((a, b) => b.score - a.score);
}

const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
function imageResponse(buf, type, src) {
  return new Response(buf, {
    headers: {
      "content-type": type, "cache-control": "public, max-age=86400", "x-logo-source": src,
      "access-control-allow-origin": "*", "access-control-expose-headers": "x-logo-source",
      "x-content-type-options": "nosniff", "content-security-policy": SVG_CSP,
    },
  });
}

export default async (req) => {
  const u = new URL(req.url);
  let d = (u.searchParams.get("domain") || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];
  if (!okHost(d)) return json({ error: "Nom de domaine invalide. Exemple : entreprise.fr" }, 400);

  const s = store();
  const key = `logo/${d}`;
  const cached = await s.getWithMetadata(key, { type: "arrayBuffer" }).catch(() => null);
  if (cached && Date.now() - (cached.metadata?.t || 0) < 7 * 864e5) return imageResponse(cached.data, cached.metadata.type, cached.metadata.src);

  const save = async (buf, type, src) => { try { await s.set(key, buf, { metadata: { type, src, t: Date.now() } }); } catch {} return imageResponse(buf, type, src); };

  let html = "", base = "";
  for (const home of [`https://${d}/`, `https://www.${d}/`]) {
    try {
      const r = await get(home);
      if (r.ok && /html/i.test(r.headers.get("content-type") || "")) { html = (await r.text()).slice(0, 2_000_000); base = r.url; break; }
    } catch {}
  }
  if (html) {
    for (const c of candidates(html, base).slice(0, 8)) {
      if (c.inline) return save(new TextEncoder().encode(c.inline).buffer, "image/svg+xml", c.src);
      try {
        const r = await get(c.url, 5000);
        const type = (r.headers.get("content-type") || "").split(";")[0].trim();
        if (!r.ok || !/^image\//.test(type)) continue;
        const buf = await r.arrayBuffer();
        if (buf.byteLength < 150 || buf.byteLength > 4_000_000) continue;
        return save(buf, type, c.src);
      } catch {}
    }
  }
  try {
    const r = await get(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=256`, 5000);
    if (r.ok) { const buf = await r.arrayBuffer(); if (buf.byteLength > 600) return save(buf, r.headers.get("content-type") || "image/png", "favicon"); }
  } catch {}
  return json({ error: "Aucun logo trouvé pour ce domaine." }, 404);
};
export const config = { path: "/api/logo" };
