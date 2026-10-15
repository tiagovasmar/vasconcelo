// Importa archivos originales descargados de las fichas oficiales mediante el navegador.
// Uso: node scripts/colecciones/importar-cajas-center.mjs <manifest-descargas.json>
// Cada entrada: { id, page, assets: [{ path, url }] }; fotos revisadas: exhibición abierta, luego caja cerrada.
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';

const input = process.argv[2];
if (!input) throw new Error('Falta el manifiesto de descargas verificadas');
const sets = JSON.parse(fs.readFileSync(input, 'utf8'));
const datos = JSON.parse(fs.readFileSync('src/content/colecciones/origen/japon-cajas.json', 'utf8'));
const output = 'src/content/colecciones/imagenes-cajas-center.json';
const registry = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : [];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
for (const set of sets) {
  const collection = datos.cajas.find(c => c.id === set.id);
  if (!collection || set.assets.length !== 2 || new URL(set.page).hostname !== 'www.pokemoncenter-online.com') throw new Error(`Manifiesto inválido: ${set.id}`);
  for (const [index, asset] of set.assets.entries()) {
    if (!asset.url.startsWith('https://www.pokemoncenter-online.com/a/img/item/')) throw new Error('Origen de imagen inesperado');
    const view = index === 0 ? 'display-open' : 'closed';
    const original = fs.readFileSync(asset.path);
    const meta = await sharp(original).metadata();
    const buffer = await sharp(original).webp({ quality: 90, effort: 6 }).toBuffer();
    const dest = `public/images/products/japon-cajas/${set.id}-${view}.webp`;
    fs.mkdirSync('public/images/products/japon-cajas', { recursive: true });
    fs.writeFileSync(dest, buffer);
    const row = { collectionId: set.id, view, src: dest.replace(/^public/, ''), width: meta.width, height: meta.height, hasAlpha: false, bytes: buffer.length, sha256: sha(buffer), originalSha256: sha(original), sourceUrl: asset.url, sourcePage: set.page, permissionStatus: 'not_granted_by_source_link', reviewedAt: '2026-10-14', operacion: 'Original oficial convertido a WebP sin escalado ni retoque de color; conserva fondo y arte del fabricante.' };
    const previous = registry.findIndex(r => r.collectionId === set.id && r.view === view);
    if (previous >= 0) registry[previous] = row;
    else registry.push(row);
    console.log(`${set.id} ${view}: ${meta.width}x${meta.height} ${buffer.length} bytes`);
  }
}
fs.writeFileSync(output, JSON.stringify(registry, null, 2) + '\n');
