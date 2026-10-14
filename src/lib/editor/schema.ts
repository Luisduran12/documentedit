import { z } from "zod";

// Validación del JSON de ediciones que llega al servidor (borradores).
const num = z.number().finite();
const box = { id: z.string().max(64), pageId: z.string().max(64), x: num, y: num, w: num, h: num, rotation: num.min(-360).max(720).optional() };
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const rotation = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);

const style = z.object({
  font: z.object({ family: z.string().max(80), bold: z.boolean(), italic: z.boolean() }),
  size: num.positive().max(1000),
  color,
  opacity: num.min(0).max(1),
  lineHeight: num.min(0.5).max(5),
  tracking: num.min(-50).max(200),
  align: z.enum(["left", "center", "right"]),
});

const object = z.discriminatedUnion("type", [
  z.object({ ...box, type: z.literal("text"), text: z.string().max(20000), style, cover: z.object({ x: num, y: num, w: num, h: num, color }).optional(), sourceFont: z.string().max(200).optional() }),
  z.object({
    ...box,
    type: z.literal("textEdit"),
    parts: z.array(z.object({ rec: z.string().max(400), from: z.number().int().min(0), to: z.number().int().min(0) })).min(1).max(500),
    originalText: z.string().max(20000),
    text: z.string().max(20000),
    align: z.enum(["left", "center", "right"]),
    scaleX: num.min(0.1).max(10),
    sizeScale: num.min(0.1).max(10),
    color: color.optional(),
    fontOverride: z.string().max(80).optional(),
    cover: z.object({ color, rects: z.array(z.object({ x: num, y: num, w: num, h: num })).max(2000), forced: z.boolean().optional() }).optional(),
    room: z.object({ x0: num, x1: z.number() }).optional(),
    fontNames: z.array(z.string().max(200)).max(50).optional(),
    dx: num.optional(),
    dy: num.optional(),
  }),
  z.object({ ...box, type: z.literal("zoneErase"), includeText: z.boolean(), label: z.string().max(40).optional() }),
  z.object({ ...box, type: z.literal("imageEdit"), ref: z.string().max(400), orig: z.object({ x: num, y: num, w: num, h: num }), removed: z.boolean() }),
  z.object({
    ...box,
    type: z.literal("image"),
    assetKey: z.string().regex(/^assets\/[0-9a-f-]{36}\.(png|jpg)$/),
    mime: z.enum(["image/png", "image/jpeg"]),
    opacity: num.min(0).max(1),
    fit: z.enum(["stretch", "contain", "cover"]).optional(),
    pixelated: z.boolean().optional(),
    px: z.object({ w: num, h: num }).optional(),
  }),
  z.object({ ...box, type: z.literal("qr"), url: z.string().url().max(500), shareId: z.string().max(32) }),
  z.object({ ...box, type: z.literal("highlight"), color, opacity: num.min(0).max(1) }),
  z.object({ ...box, type: z.literal("cover"), color }),
  z.object({ ...box, type: z.literal("ink"), color, width: num.positive().max(50), strokes: z.array(z.array(z.tuple([num, num])).max(20000)).max(500) }),
]);

export const EditDocSchema = z.object({
  pages: z
    .array(
      z.object({
        id: z.string().max(64),
        src: z.number().int().min(0).nullable(),
        baseRotation: rotation,
        rotation,
        view: z.tuple([num, num, num, num]),
      }),
    )
    .min(1)
    .max(5000),
  objects: z.array(object).max(10000),
});
