/** PDF con las mismas láminas PNG y marcas de agua, cargado solo cuando se solicita. */
export async function catalogPdf(blobs: Blob[], generatedAt: number): Promise<Blob> {
  if (!blobs.length) throw new Error("No hay láminas para exportar.");
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle("Vasconcelo TCG - Catálogo mayorista");
  pdf.setAuthor("Vasconcelo TCG");
  pdf.setCreationDate(new Date(generatedAt));
  for (const blob of blobs) {
    const image = await pdf.embedPng(await blob.arrayBuffer());
    const width = 540, height = width * image.height / image.width;
    const page = pdf.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }
  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
