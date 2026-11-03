import { CAPTURE_SIZE, zonePx, type RGB, type Zone } from "./styleDna";

/**
 * Paints one soft, radially-faded ellipse of `color` into `zone`, blended
 * onto whatever is already on the canvas. Used to composite lipstick,
 * blush and eyeshadow live over a captured photo.
 */
export function drawSoftEllipse(
  ctx: CanvasRenderingContext2D,
  zone: Zone,
  color: RGB,
  alpha: number,
  blend: GlobalCompositeOperation,
  size: number = CAPTURE_SIZE,
  rotation = 0
): void {
  const zp = zonePx(zone, size);
  const cx = zp.x + zp.w / 2;
  const cy = zp.y + zp.h / 2;
  const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, Math.max(zp.w, zp.h) * 0.62);
  grad.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${alpha})`);
  grad.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
  ctx.save();
  ctx.globalCompositeOperation = blend;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, zp.w * 0.62, zp.h * 0.85, rotation, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}
