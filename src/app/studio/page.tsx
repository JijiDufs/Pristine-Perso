"use client";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Download, Plus, X, Loader2 } from "lucide-react";
import { Field, Chips, useToast } from "@/components/ui";
import { getSettings, saveSettings } from "@/lib/db";
import { uid } from "@/lib/format";

const RATIOS = [["auto", "Bords détectés"], ["card", "Carte 63:88"], ["portrait", "Portrait 3:4"], ["square", "Carré 1:1"], ["none", "Aucun"]] as [string, string][];
const MARKS = [["br", "Bas droite"], ["bl", "Bas gauche"], ["tile", "En diagonale"], ["none", "Sans"]] as [string, string][];

type Opts = { ratio: string; mark: string; text: string; size: number; opacity: number };
type Item = { id: string; name: string; img: HTMLImageElement; canvas?: HTMLCanvasElement };

function detectBounds(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const d = ctx.getImageData(0, 0, w, h).data;
  const at = (x: number, y: number) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const S = Math.max(4, Math.floor(Math.min(w, h) * 0.02));
  let r = 0, g = 0, b = 0, n = 0;
  ([[0, 0], [w - S, 0], [0, h - S], [w - S, h - S]] as const).forEach(([ox, oy]) => {
    for (let y = oy; y < oy + S; y++) for (let x = ox; x < ox + S; x++) { const c = at(x, y); r += c[0]; g += c[1]; b += c[2]; n++; }
  });
  r /= n; g /= n; b /= n;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 200));
  const off = (x: number, y: number) => { const c = at(x, y); return Math.abs(c[0] - r) + Math.abs(c[1] - g) + Math.abs(c[2] - b) > 46; };
  const cols: [number, number][] = [], rows: [number, number][] = [];
  for (let x = 0; x < w; x += step) { let c = 0; for (let y = 0; y < h; y += step) if (off(x, y)) c++; cols.push([x, c]); }
  for (let y = 0; y < h; y += step) { let c = 0; for (let x = 0; x < w; x += step) if (off(x, y)) c++; rows.push([y, c]); }
  const mc = Math.max(...cols.map((v) => v[1])), mr = Math.max(...rows.map((v) => v[1]));
  if (!mc || !mr) return null;
  const okC = cols.filter((v) => v[1] > mc * 0.3).map((v) => v[0]);
  const okR = rows.filter((v) => v[1] > mr * 0.3).map((v) => v[0]);
  if (!okC.length || !okR.length) return null;
  const x0 = Math.min(...okC), x1 = Math.max(...okC), y0 = Math.min(...okR), y1 = Math.max(...okR);
  if (x1 - x0 < w * 0.25 || y1 - y0 < h * 0.25) return null;
  const pad = Math.round(Math.min(w, h) * 0.012);
  return { x: Math.max(0, x0 - pad), y: Math.max(0, y0 - pad), w: Math.min(w, x1 - x0 + pad * 2), h: Math.min(h, y1 - y0 + pad * 2) };
}

function render(img: HTMLImageElement, opts: Opts) {
  const src = document.createElement("canvas");
  src.width = img.width; src.height = img.height;
  src.getContext("2d")!.drawImage(img, 0, 0);

  let box = { x: 0, y: 0, w: img.width, h: img.height };
  if (opts.ratio === "auto") {
    const k = Math.min(1, 700 / Math.max(img.width, img.height));
    const probe = document.createElement("canvas");
    probe.width = Math.round(img.width * k); probe.height = Math.round(img.height * k);
    probe.getContext("2d")!.drawImage(img, 0, 0, probe.width, probe.height);
    const f = detectBounds(probe.getContext("2d")!, probe.width, probe.height);
    if (f) box = { x: f.x / k, y: f.y / k, w: f.w / k, h: f.h / k };
  }
  const target = ({ card: 63 / 88, portrait: 3 / 4, square: 1 } as Record<string, number>)[opts.ratio];
  if (target) {
    const cur = box.w / box.h;
    if (cur > target) { const nw = box.h * target; box = { ...box, x: box.x + (box.w - nw) / 2, w: nw }; }
    else { const nh = box.w / target; box = { ...box, y: box.y + (box.h - nh) / 2, h: nh }; }
  }

  const scale = Math.min(1, 1400 / Math.max(box.w, box.h));
  const out = document.createElement("canvas");
  out.width = Math.round(box.w * scale); out.height = Math.round(box.h * scale);
  const ctx = out.getContext("2d")!;
  ctx.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);

  const text = (opts.text ?? "").trim();
  if (text && opts.mark !== "none") {
    const size = Math.round(out.width * (opts.size / 100));
    ctx.font = `600 ${size}px Inter, sans-serif`;
    ctx.fillStyle = `rgba(255,255,255,${opts.opacity / 100})`;
    ctx.strokeStyle = `rgba(0,0,0,${(opts.opacity / 100) * 0.45})`;
    ctx.lineWidth = Math.max(1, size / 14);
    if (opts.mark === "tile") {
      ctx.save(); ctx.translate(out.width / 2, out.height / 2); ctx.rotate(-Math.PI / 6); ctx.textAlign = "center";
      const gapY = size * 3.4, gapX = ctx.measureText(text).width + size * 2.2;
      for (let y = -out.height; y < out.height; y += gapY)
        for (let x = -out.width; x < out.width; x += gapX) { ctx.strokeText(text, x, y); ctx.fillText(text, x, y); }
      ctx.restore();
    } else {
      const m = Math.round(out.width * 0.035);
      ctx.textBaseline = "bottom";
      ctx.textAlign = opts.mark === "br" ? "right" : "left";
      const x = opts.mark === "br" ? out.width - m : m;
      ctx.strokeText(text, x, out.height - m); ctx.fillText(text, x, out.height - m);
    }
  }
  return out;
}

export default function Studio() {
  const { toast, node } = useToast();
  const [files, setFiles] = useState<Item[]>([]);
  const [opts, setOpts] = useState<Opts>({ ratio: "auto", mark: "br", text: "", size: 4.5, opacity: 62 });
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shelfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSettings().then((s) => { if (s.watermark) setOpts((o) => ({ ...o, text: s.watermark })); });
  }, []);

  const load = (list: FileList | null) => {
    if (!list) return;
    Array.from(list).filter((f) => f.type.startsWith("image/")).forEach((f) => {
      const fr = new FileReader();
      fr.onload = (e) => {
        const im = new Image();
        im.onload = () => setFiles((s) => [...s, { id: uid(), name: f.name, img: im }]);
        im.src = String(e.target?.result);
      };
      fr.readAsDataURL(f);
    });
  };

  useEffect(() => {
    if (!files.length || !shelfRef.current) return;
    setBusy(true);
    const t = setTimeout(() => {
      files.forEach((f) => {
        const host = shelfRef.current!.querySelector(`[data-slot="${f.id}"]`);
        if (!host) return;
        const out = render(f.img, opts);
        host.innerHTML = "";
        out.style.width = "100%"; out.style.height = "auto"; out.style.display = "block";
        host.appendChild(out);
        f.canvas = out;
      });
      setBusy(false);
    }, 40);
    return () => clearTimeout(t);
  }, [files, opts]);

  const download = (f: Item) => {
    if (!f.canvas) return;
    const a = document.createElement("a");
    a.href = f.canvas.toDataURL("image/jpeg", 0.9);
    a.download = `pristine-${f.name.replace(/\.[^.]+$/, "")}.jpg`;
    a.click();
  };

  return (
    <div className="page">
      {node}
      <div className="page-head">
        <div className="eyebrow">Photos d&apos;annonce</div>
        <h1>Studio</h1>
        <p>Recadre au bord de la carte et appose ton pseudo. Le vol de photos d&apos;annonce est courant sur Vinted : une image marquée ne se réutilise pas.</p>
      </div>

      <div className="studio">
        <div className="panel">
          <div className="panel-h"><h3>Réglages</h3></div>
          <div className="panel-b">
            <Field label="Recadrage"><Chips options={RATIOS} value={opts.ratio} onChange={(v) => setOpts({ ...opts, ratio: v })} /></Field>
            <Field label="Filigrane"><Chips options={MARKS} value={opts.mark} onChange={(v) => setOpts({ ...opts, mark: v })} /></Field>
            <Field label="Texte">
              <input className="inp" value={opts.text} placeholder="@ton_pseudo"
                onChange={(e) => setOpts({ ...opts, text: e.target.value })}
                onBlur={async () => { const s = await getSettings(); await saveSettings({ ...s, watermark: opts.text }); }} />
            </Field>
            <div className="rowset"><span className="dim" style={{ width: 56 }}>Taille</span>
              <input type="range" min="2" max="9" step="0.5" value={opts.size} onChange={(e) => setOpts({ ...opts, size: Number(e.target.value) })} />
              <span className="mono" style={{ width: 34, textAlign: "right" }}>{opts.size}</span>
            </div>
            <div className="rowset"><span className="dim" style={{ width: 56 }}>Opacité</span>
              <input type="range" min="15" max="100" step="5" value={opts.opacity} onChange={(e) => setOpts({ ...opts, opacity: Number(e.target.value) })} />
              <span className="mono" style={{ width: 34, textAlign: "right" }}>{opts.opacity}</span>
            </div>
            <hr className="hr" />
            <button className="btn btn-block" onClick={() => inputRef.current?.click()}><ImagePlus size={14} /> Ajouter des photos</button>
            <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
              onChange={(e) => { load(e.target.files); e.target.value = ""; }} />
            {files.length > 0 && (
              <>
                <button className="btn btn-gold btn-block" style={{ marginTop: 9 }} onClick={() => {
                  const ready = files.filter((f) => f.canvas);
                  if (!ready.length) { toast("Rendu en cours, réessaie dans un instant", "err"); return; }
                  ready.forEach((f, i) => setTimeout(() => download(f), i * 250));
                  toast(`${ready.length} image(s) exportée(s)`);
                }}><Download size={14} /> Tout télécharger</button>
                <button className="btn btn-ghost btn-block" style={{ marginTop: 9 }} onClick={() => setFiles([])}>Vider</button>
              </>
            )}
            <div className="tiny dim" style={{ marginTop: 12, lineHeight: 1.55 }}>
              La détection de bords fonctionne sur fond uni. Si le recadrage rate, bascule sur un format fixe.
            </div>
          </div>
        </div>

        <div>
          {files.length === 0 ? (
            <div className="drop">
              <ImagePlus size={30} color="var(--gold)" style={{ marginBottom: 12 }} />
              <h3>Dépose tes photos</h3>
              <p>Elles restent sur ton appareil : tout le traitement se fait dans le navigateur.</p>
              <button className="btn btn-gold" onClick={() => inputRef.current?.click()}><Plus size={15} /> Choisir des photos</button>
            </div>
          ) : (
            <>
              {busy && <div className="tiny dim" style={{ marginBottom: 10, display: "flex", gap: 7, alignItems: "center" }}><Loader2 size={13} className="spin" /> Rendu…</div>}
              <div className="shelf" ref={shelfRef}>
                {files.map((f) => (
                  <figure key={f.id}>
                    <div data-slot={f.id} />
                    <figcaption>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      <span style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => download(f)} aria-label="Télécharger"><Download size={12} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setFiles((s) => s.filter((x) => x.id !== f.id))} aria-label="Retirer"><X size={12} /></button>
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
