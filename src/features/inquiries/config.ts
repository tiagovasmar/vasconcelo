import "server-only";
import { store } from "@/content/store";
import { parseWhatsappNumber } from "./whatsapp-number";

export { parseWhatsappNumber };

/** Número configurado por entorno (WHATSAPP_NUMBER, tiene prioridad) o por src/content/store.ts. null → modo demo. */
export function getWhatsappNumber(): string | null {
  return parseWhatsappNumber(process.env.WHATSAPP_NUMBER || store.whatsappNumber);
}
