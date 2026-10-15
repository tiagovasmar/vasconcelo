// Quita el fondo blanco conectado con el borde de una foto de producto (relleno por inundación desde el borde): los blancos propios del
// envase no se tocan. Lo comparten recortar-imagenes.mjs y importar-chinos.mjs.
import sharp from "sharp";

const BLANCO = 238; // canal mínimo para considerar «fondo blanco»
export async function quitarFondoBlanco(buf, w, h) {
  const rgb = await sharp(buf).removeAlpha().raw().toBuffer();
  const esFondo = new Uint8Array(w * h);
  const stack = [];
  const blanco = (i) => rgb[i * 3] >= BLANCO && rgb[i * 3 + 1] >= BLANCO && rgb[i * 3 + 2] >= BLANCO;
  const push = (x, y) => { const i = y * w + x; if (!esFondo[i] && blanco(i)) { esFondo[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  // alfa: 0 en el fondo y 1 px de borde del producto (quita el halo blanco del JPG); después se suaviza
  const alfa = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const vecino = (x > 0 && esFondo[i - 1]) || (x < w - 1 && esFondo[i + 1]) || (y > 0 && esFondo[i - w]) || (y < h - 1 && esFondo[i + w]);
    alfa[i] = esFondo[i] || vecino ? 0 : 255;
  }
  // se descartan motas sueltas fuera del envase (p. ej. la nota «imagen ilustrativa» del fabricante)
  const comp = new Int32Array(w * h), tamanos = [0];
  for (let s0 = 0; s0 < w * h; s0++) {
    if (alfa[s0] !== 255 || comp[s0]) continue;
    const id = tamanos.length; let n = 0; const st = [s0]; comp[s0] = id;
    while (st.length) { const i = st.pop(); n++; const x = i % w; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1]) if (j >= 0 && alfa[j] === 255 && !comp[j]) { comp[j] = id; st.push(j); } }
    tamanos.push(n);
  }
  const mayor = Math.max(...tamanos);
  for (let i = 0; i < w * h; i++) if (alfa[i] === 255 && tamanos[comp[i]] < mayor * 0.01) alfa[i] = 0;
  const sv = await sharp(alfa, { raw: { width: w, height: h, channels: 1 } }).blur(0.8).raw().toBuffer({ resolveWithObject: true });
  const suave = sv.data, canales = sv.info.channels;
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = alfa[i] === 0 ? 0 : suave[i * canales]; }
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}
