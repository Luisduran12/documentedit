/** La caducidad de prueba (5 min) solo se ofrece en desarrollo local. */
export const ALLOW_DEV_TTL = process.env.NODE_ENV !== "production";
