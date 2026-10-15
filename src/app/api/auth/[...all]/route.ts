import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";
import { guardMail } from "@/server/mail-guard";

export const runtime = "nodejs";

// Registro, inicio y cierre de sesión, verificación de correo y recuperación: los gestiona Better Auth
// (hash de contraseñas con scrypt, sesiones en cookie httpOnly, tokens de un solo uso, protección de origen y límites de uso).
export const GET = (req: Request) => toNextJsHandler(getAuth()).GET(req);
export const POST = async (req: Request) => guardMail(req) ?? toNextJsHandler(getAuth()).POST(req);
