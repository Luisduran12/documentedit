import { FileText, ImageIcon, PenSquare, Settings, Trash2, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; short: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { href: "/documentos", label: "Documentos", short: "Docs", icon: FileText },
  { href: "/editor", label: "Editor", short: "Editor", icon: PenSquare },
  { href: "/imagenes", label: "Imágenes y QR", short: "QR", icon: ImageIcon },
  { href: "/papelera", label: "Papelera", short: "Papelera", icon: Trash2 },
  { href: "/configuracion", label: "Configuración", short: "Ajustes", icon: Settings },
];
