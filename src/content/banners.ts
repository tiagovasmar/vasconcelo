import inicio from "./colecciones/imagenes-inicio.json";
import recortes from "./colecciones/imagenes-recortes.json";

/**
 * Un banner por colección: arte (recorte de una ilustración de carta oficial, ver imagenes-inicio.json), colores y composición propios.
 * Textos en español, sin fechas ni campañas del sitio japonés. `expansionId` coincide con el catálogo.
 * Orden del carrusel del inicio: arranca con Storm Emeralda y sigue por lanzamiento, de más nuevo a más viejo.
 */
type Photo = { src: string; width: number; height: number; alt: string; /** true = el archivo conserva su fondo blanco (sin transparencia) */ opaque?: boolean };

export type Banner = {
  expansionId: string;
  slug: string;
  title: string;
  code: string;
  /** Pokémon protagonista (nombre en español/latino). */
  hero: string;
  tagline: string;
  /** Texto fantasma del fondo. */
  ghost: string;
  /** Paleta propia de la colección (colores CSS). */
  palette: { b1: string; b2: string; b3: string; glow: string; glow2: string; slab: string; bolt: string; bolt2: string };
  art: { src: string; width: number; height: number; alt: string };
  /** Foto del sobre y de la caja cerrada (recortes registrados) para la composición. */
  booster?: Photo;
  box?: Photo;
  /** Composición: lado del panel de arte y sentido de la inclinación (para que no sean todos iguales). */
  layout: { flip: boolean; tilt: number };
};

const art = (id: string, alt: string) => {
  const a = inicio.find((i) => i.id === `hero-${id}`);
  if (!a) throw new Error(`Falta el arte del banner de ${id}: ejecutá node scripts/colecciones/crear-arte-inicio.mjs`);
  return { src: a.src, width: a.width, height: a.height, alt };
};
const foto = (id: string, role: "sobre" | "caja-referencia-2", alt: string) => {
  const r = recortes.find((x) => x.collectionId === id && x.role === role);
  return r ? { src: r.src, width: r.width, height: r.height, alt, opaque: !r.hasAlpha } : undefined;
};

const def = (b: Omit<Banner, "art" | "booster" | "box"> & { artAlt: string }): Banner => {
  const { artAlt, ...rest } = b;
  return { ...rest, art: art(b.expansionId, artAlt), booster: foto(b.expansionId, "sobre", `Sobre individual de ${b.title}`), box: foto(b.expansionId, "caja-referencia-2", `Caja cerrada de ${b.title}`) };
};

export const banners: Banner[] = [
  def({ expansionId: "storm-emeralda", slug: "storm-emeralda", title: "Storm Emeralda", code: "M6", hero: "Mega Rayquaza ex", ghost: "STORM EMERALDA", artAlt: "Mega Rayquaza ex, ilustración de una carta oficial de Storm Emeralda",
    tagline: "Cajas y sobres japoneses sellados de la expansión de la tormenta esmeralda.", layout: { flip: false, tilt: 0 },
    palette: { b1: "#03100b", b2: "#0b4032", b3: "#04130d", glow: "rgba(46,200,140,.36)", glow2: "rgba(212,184,114,.24)", slab: "rgba(15,90,69,.55)", bolt: "#d4b872", bolt2: "#2ee6a6" } }),
  def({ expansionId: "30th-celebration", slug: "30th-celebration", title: "30th CELEBRATION", code: "M6a", hero: "Zacian V y cartas clásicas", ghost: "30th CELEBRATION", artAlt: "Zacian V, ilustración de una carta de 30th CELEBRATION",
    tagline: "Reediciones de cartas clásicas con el sello del 30.º aniversario, en cajas y sobres japoneses sellados.", layout: { flip: true, tilt: 1 },
    palette: { b1: "#140f03", b2: "#4a3708", b3: "#120d02", glow: "rgba(255,210,74,.34)", glow2: "rgba(80,150,255,.22)", slab: "rgba(120,90,10,.55)", bolt: "#ffd24a", bolt2: "#5ab0ff" } }),
  def({ expansionId: "abyss-eye", slug: "abyss-eye", title: "Abyss Eye", code: "M5", hero: "Mega Darkrai ex", ghost: "ABYSS EYE", artAlt: "Mega Darkrai ex, ilustración de una carta oficial de Abyss Eye",
    tagline: "Oscuridad y energía MEGA: cajas y sobres japoneses sellados con Mega Darkrai ex como protagonista.", layout: { flip: false, tilt: -1 },
    palette: { b1: "#05060a", b2: "#1b1233", b3: "#07090d", glow: "rgba(122,77,255,.34)", glow2: "rgba(124,255,158,.20)", slab: "rgba(60,36,110,.55)", bolt: "#9d7bff", bolt2: "#7cff9e" } }),
  def({ expansionId: "mega-dream-ex", slug: "mega-dream-ex", title: "MEGA Dream ex", code: "M2a", hero: "Mega Gengar ex", ghost: "MEGA DREAM ex", artAlt: "Mega Gengar ex, ilustración de una carta oficial de MEGA Dream ex",
    tagline: "Una expansión grande de Pokémon MEGA ex: cajas y sobres japoneses sellados.", layout: { flip: true, tilt: 0 },
    palette: { b1: "#0e0618", b2: "#2a1245", b3: "#0b0512", glow: "rgba(255,79,168,.32)", glow2: "rgba(255,228,92,.22)", slab: "rgba(110,40,120,.5)", bolt: "#ffe45c", bolt2: "#ff4fa8" } }),
  def({ expansionId: "inferno-x", slug: "inferno-x", title: "Inferno X", code: "M2", hero: "Mega Charizard X ex", ghost: "INFERNO X", artAlt: "Mega Charizard X ex, ilustración de una carta oficial de Inferno X",
    tagline: "Llamas azules y energía MEGA: cajas y sobres japoneses sellados de Inferno X.", layout: { flip: false, tilt: 1 },
    palette: { b1: "#04070f", b2: "#10213f", b3: "#05080f", glow: "rgba(70,140,255,.34)", glow2: "rgba(255,122,26,.26)", slab: "rgba(20,60,120,.55)", bolt: "#ff9a3d", bolt2: "#6fb4ff" } }),
  def({ expansionId: "heat-wave-arena", slug: "heat-wave-arena", title: "Heat Wave Arena", code: "SV9a", hero: "Ho-Oh ex de Ethan", ghost: "HEAT WAVE ARENA", artAlt: "Ho-Oh ex, ilustración de una carta oficial de Heat Wave Arena",
    tagline: "Fuego, entrenadores y Pokémon legendarios en cajas y sobres japoneses sellados.", layout: { flip: true, tilt: -1 },
    palette: { b1: "#1c0703", b2: "#5a1608", b3: "#140502", glow: "rgba(255,90,42,.36)", glow2: "rgba(255,210,74,.26)", slab: "rgba(130,40,12,.55)", bolt: "#ffd24a", bolt2: "#ff6a3a" } }),
  def({ expansionId: "white-flare", slug: "white-flare", title: "White Flare", code: "SV11W", hero: "Reshiram ex", ghost: "WHITE FLARE", artAlt: "Reshiram ex, ilustración de una carta oficial de White Flare",
    tagline: "Reshiram ex y los Pokémon de Teselia en cajas y sobres japoneses sellados.", layout: { flip: false, tilt: 0 },
    palette: { b1: "#190d09", b2: "#3b2218", b3: "#120a07", glow: "rgba(255,150,80,.34)", glow2: "rgba(255,244,225,.22)", slab: "rgba(120,70,40,.5)", bolt: "#ffd9a8", bolt2: "#ff8a4a" } }),
  def({ expansionId: "black-bolt", slug: "black-bolt", title: "Black Bolt", code: "SV11B", hero: "Zekrom ex", ghost: "BLACK BOLT", artAlt: "Zekrom ex, ilustración de una carta oficial de Black Bolt",
    tagline: "Zekrom ex y los Pokémon de Teselia en cajas y sobres japoneses sellados.", layout: { flip: true, tilt: 0 },
    palette: { b1: "#03060d", b2: "#0d2447", b3: "#04070d", glow: "rgba(74,163,255,.36)", glow2: "rgba(212,184,114,.22)", slab: "rgba(16,50,100,.55)", bolt: "#7cc4ff", bolt2: "#d4b872" } }),
];

export const getBanner = (expansionId: string): Banner | undefined => banners.find((b) => b.expansionId === expansionId);
