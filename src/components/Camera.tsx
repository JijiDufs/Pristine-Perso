"use client";
import { useEffect, useRef, useState } from "react";
import { X, AlertTriangle, ImagePlus } from "lucide-react";

export type Shot = { big: string; thumb: string; quality: Quality; framed: boolean };
export type Quality = { sharp: number | null; mean: number | null; warnings: string[] };

/* Netteté (variance du laplacien) et exposition : on écarte une mauvaise photo
   avant de dépenser un crédit dessus. */
export function qualityCheck(source: HTMLCanvasElement | HTMLImageElement): Quality {
  try {
    const w0 = "naturalWidth" in source ? source.naturalWidth : source.width;
    const h0 = "naturalHeight" in source ? source.naturalHeight : source.height;
    const k = Math.min(1, 420 / Math.max(w0, h0));
    const c = document.createElement("canvas");
    c.width = Math.max(2, Math.round(w0 * k));
    c.height = Math.max(2, Math.round(h0 * k));
    const ctx = c.getContext("2d")!;
    ctx.drawImage(source, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const g = new Float32Array(c.width * c.height);
    let sum = 0;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      sum += g[j];
    }
    const mean = sum / g.length;
    let s = 0, s2 = 0, n = 0;
    for (let y = 1; y < c.height - 1; y++) {
      for (let x = 1; x < c.width - 1; x++) {
        const i = y * c.width + x;
        const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - c.width] - g[i + c.width];
        s += l; s2 += l * l; n++;
      }
    }
    const sharp = n ? s2 / n - (s / n) ** 2 : 0;
    const warnings: string[] = [];
    if (sharp < 45) warnings.push("Photo floue — le numéro de collection risque d'être illisible.");
    if (mean < 52) warnings.push("Trop sombre — rapproche-toi d'une lumière.");
    if (mean > 208) warnings.push("Surexposée — évite le flash direct et les reflets sur le foil.");
    return { sharp, mean, warnings };
  } catch {
    return { sharp: null, mean: null, warnings: [] };
  }
}

export async function fileToShot(file: File): Promise<Shot> {
  const dataUrl: string = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error("Lecture impossible"));
    fr.readAsDataURL(file);
  });
  const im = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Image illisible"));
    i.src = dataUrl;
  });
  const draw = (maxSide: number, q: number) => {
    const scale = Math.min(1, maxSide / Math.max(im.width, im.height));
    const c = document.createElement("canvas");
    c.width = Math.round(im.width * scale);
    c.height = Math.round(im.height * scale);
    c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", q).split(",")[1];
  };
  return { big: draw(1100, 0.82), thumb: draw(380, 0.68), quality: qualityCheck(im), framed: false };
}

export default function Camera({ label, tip, onCapture, onFallback, onClose }: {
  label: string; tip: string;
  onCapture: (s: Shot) => void; onFallback: () => void; onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"starting" | "live" | "denied">("starting");

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const st = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (dead) { st.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = st;
        if (videoRef.current) {
          videoRef.current.srcObject = st;
          videoRef.current.play().catch(() => {});
        }
        setState("live");
      } catch {
        if (!dead) setState("denied");
      }
    })();
    return () => { dead = true; streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const shoot = () => {
    const v = videoRef.current, box = boxRef.current, fr = frameRef.current;
    if (!v || !box || !fr || !v.videoWidth) return;
    const bb = box.getBoundingClientRect(), fb = fr.getBoundingClientRect();
    const scale = Math.max(bb.width / v.videoWidth, bb.height / v.videoHeight);
    const ox = (bb.width - v.videoWidth * scale) / 2;
    const oy = (bb.height - v.videoHeight * scale) / 2;
    const sx = (fb.left - bb.left - ox) / scale;
    const sy = (fb.top - bb.top - oy) / scale;
    const sw = fb.width / scale, sh = fb.height / scale;

    const big = document.createElement("canvas");
    big.height = Math.min(1250, Math.round(sh));
    big.width = Math.round(big.height * (63 / 88));
    big.getContext("2d")!.drawImage(v, sx, sy, sw, sh, 0, 0, big.width, big.height);

    const thumb = document.createElement("canvas");
    thumb.height = 380; thumb.width = Math.round(380 * (63 / 88));
    thumb.getContext("2d")!.drawImage(big, 0, 0, thumb.width, thumb.height);

    onCapture({
      big: big.toDataURL("image/jpeg", 0.86).split(",")[1],
      thumb: thumb.toDataURL("image/jpeg", 0.7).split(",")[1],
      quality: qualityCheck(big),
      framed: true,
    });
  };

  return (
    <div className="cam">
      <div className="cam-h">
        <strong>{label}</strong>
        <button className="cam-x" onClick={onClose} aria-label="Fermer le viseur"><X size={17} /></button>
      </div>
      {state === "denied" ? (
        <div className="cam-fail">
          <AlertTriangle size={26} color="var(--gold)" />
          <h3>Caméra indisponible</h3>
          <p>Autorise l&apos;accès à la caméra dans ton navigateur, ou utilise l&apos;appareil photo du téléphone.
            Dans ce cas : carte à plat, téléphone perpendiculaire, cadre bien rempli.</p>
          <button className="btn btn-gold" onClick={onFallback}><ImagePlus size={15} /> Ouvrir l&apos;appareil photo</button>
        </div>
      ) : (
        <>
          <div className="cam-box" ref={boxRef}>
            <video ref={videoRef} playsInline muted autoPlay />
            <div className="cam-mask">
              <div className="cam-frame" ref={frameRef}>
                <span className="cam-corner tl" /><span className="cam-corner tr" />
                <span className="cam-corner bl" /><span className="cam-corner br" />
                <span className="cam-cross" style={{ left: "50%", top: 0, bottom: 0, width: 1 }} />
                <span className="cam-cross" style={{ top: "50%", left: 0, right: 0, height: 1 }} />
              </div>
              <div className="cam-tip">{tip}</div>
            </div>
          </div>
          <div className="cam-f">
            <button className="cam-side" onClick={onFallback}><ImagePlus size={19} />Galerie</button>
            <button className="cam-shot" onClick={shoot} disabled={state !== "live"} aria-label="Prendre la photo" />
            <span className="cam-side" style={{ visibility: "hidden" }} />
          </div>
        </>
      )}
    </div>
  );
}
