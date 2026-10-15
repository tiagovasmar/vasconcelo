// Arte de los banners por colección: recortes de la ILUSTRACIÓN de cartas oficiales de cada expansión, tomados de los originales de
// 868×1212 que ya están en la caché local del rastreo (.local/cache/colecciones/img; no se descarga nada nuevo).
// Se recorta solo la zona de ilustración (sin nombre, PS ni texto de la carta); no se escala ni se retoca.
// Salida: public/images/inicio/*.webp + src/content/colecciones/imagenes-inicio.json (origen, huella del original y del derivado, recorte).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const CACHE = path.resolve(".local/cache/colecciones/img");
const cartas = JSON.parse(fs.readFileSync("src/content/colecciones/imagenes-cartas.json", "utf8"));

// Una ilustración por colección (cartas de ilustración completa de la propia expansión). Recorte solo de la zona de arte.
// Dos recortes tipo: cartas ex normales (sin etiqueta «Mega») y cartas Mega (con etiqueta de colores a la derecha y símbolo a la izquierda).
const NORMAL = { left: 70, top: 135, width: 722, height: 446 };
const MEGA = { left: 112, top: 170, width: 722, height: 446 };
const ARTES = [
  { id: "hero-storm-emeralda", collectionId: "storm-emeralda", cardId: "50536", crop: { left: 60, top: 165, width: 770, height: 475 }, alt: "Ilustración de Mega Rayquaza ex de la carta 095/076 de Storm Emeralda" },
  { id: "hero-black-bolt", collectionId: "black-bolt", cardId: "47993", crop: NORMAL, alt: "Ilustración de Zekrom ex de la colección Black Bolt" },
  { id: "hero-white-flare", collectionId: "white-flare", cardId: "48080", crop: NORMAL, alt: "Ilustración de Reshiram ex de la colección White Flare" },
  { id: "hero-heat-wave-arena", collectionId: "heat-wave-arena", cardId: "47387", crop: NORMAL, alt: "Ilustración de Ho-Oh ex de Heat Wave Arena" },
  { id: "hero-inferno-x", collectionId: "inferno-x", cardId: "48516", crop: MEGA, alt: "Ilustración de Mega Charizard X ex de Inferno X" },
  { id: "hero-mega-dream-ex", collectionId: "mega-dream-ex", cardId: "50000", crop: MEGA, alt: "Ilustración de Mega Gengar ex de MEGA Dream ex" },
  { id: "hero-30th-celebration", collectionId: "30th-celebration", cardId: "50737", crop: { left: 70, top: 112, width: 722, height: 446 }, alt: "Ilustración de Zacian V de 30th CELEBRATION" },
  { id: "hero-abyss-eye", collectionId: "abyss-eye", cardId: "50334", crop: MEGA, alt: "Ilustración de Mega Darkrai ex de Abyss Eye" },
];

fs.mkdirSync("public/images/inicio", { recursive: true });
const salida = [];
for (const a of ARTES) {
  const src = path.join(CACHE, `${a.cardId}.jpg`);
  if (!fs.existsSync(src)) throw new Error(`Falta el original en caché (${src}). Ejecutá npm run colecciones:imagenes.`);
  const buf = fs.readFileSync(src);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const reg = cartas[`${a.collectionId}/${a.cardId}`];
  if (!reg || reg.sourceSha256 !== sha) throw new Error(`El original ${a.cardId} no coincide con el registro de imágenes de cartas (huella).`);
  const lista = JSON.parse(fs.readFileSync(`src/content/colecciones/cartas/${a.collectionId}.json`, "utf8"));
  const carta = lista.cards.find((c) => c.cardId === a.cardId);
  const out = await sharp(buf).extract(a.crop).webp({ quality: 90, effort: 5 }).toBuffer({ resolveWithObject: true });
  const dst = `/images/inicio/${a.id}.webp`;
  fs.writeFileSync(path.join("public", dst), out.data);
  salida.push({
    id: a.id,
    src: dst,
    width: out.info.width,
    height: out.info.height,
    alt: a.alt,
    bytes: out.data.length,
    sha256: crypto.createHash("sha256").update(out.data).digest("hex"),
    status: "reference",
    origin: `Buscador oficial de cartas (pokemon-card.com), ficha de la carta ${a.cardId} (${carta.name.normalize("NFC").replace(/<[^>]*>/g, "")}, ${carta.number}/${carta.total} ${carta.setMark})`,
    sourceUrl: reg.sourceUrl,
    derivedFrom: { collectionId: a.collectionId, cardId: a.cardId, sourceSha256: sha, sourceSize: reg.sourceSize, crop: a.crop, operacion: "recorte de la zona de ilustración; sin escalado ni retoque" },
    permissionStatus: reg.permissionStatus,
    license: "Sin permiso de uso concedido por el enlace de origen (referencia). Arte oficial de la carta: no acredita el estado del inventario de la tienda.",
    createdAt: new Date().toISOString().slice(0, 10),
  });
}
fs.writeFileSync("src/content/colecciones/imagenes-inicio.json", JSON.stringify(salida, null, 1) + "\n");
console.table(salida.map((s) => ({ src: s.src, px: `${s.width}×${s.height}`, KB: Math.round(s.bytes / 1024) })));
