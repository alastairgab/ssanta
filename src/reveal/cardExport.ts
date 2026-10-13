import type { RevealPayload } from '../types/reveal';
import type { ThemeModule } from '../themes/shared';
import { formatDate, formatMoney } from '../utils/format';

/**
 * Draw the revealed card onto a canvas for "Save as image".
 * Only the recipient's name and public event details are drawn — never the link, key,
 * giver name/codename or anything else from the payload.
 */
export function cardImageLines(payload: RevealPayload): { heading: string; lead: string; name: string; footer: string[] } {
  const footer: string[] = [];
  if (payload.bud !== undefined) footer.push(`Budget ${formatMoney(payload.bud, payload.cur ?? 'AUD')}`);
  if (payload.date) footer.push(formatDate(payload.date));
  return { heading: payload.en, lead: 'This Christmas, I’m buying a gift for', name: payload.r, footer };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderCardImage(payload: RevealPayload, theme: ThemeModule): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image export is not supported in this browser.');
  try {
    await document.fonts?.ready;
  } catch {
    /* fonts optional */
  }
  const s = theme.exportStyle;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, s.background[0]);
  bg.addColorStop(1, s.background[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Snow dots
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 70; i++) {
    const x = (i * 197) % W;
    const y = (i * 331) % H;
    ctx.beginPath();
    ctx.arc(x, y, 2 + (i % 4), 0, Math.PI * 2);
    ctx.fill();
  }

  // Card
  const m = 110;
  const cx = m;
  const cy = 170;
  const cw = W - m * 2;
  const ch = H - 340;
  if (s.frame === 'candycane') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 22, cy - 22, cw + 44, ch + 44);
    ctx.clip();
    const stripes = ['#c62828', '#fffdf6', '#1e6b45', '#fffdf6'];
    for (let i = -H; i < W + H; i += 24) {
      ctx.fillStyle = stripes[Math.abs(Math.floor(i / 24)) % 4]!;
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 24, 0);
      ctx.lineTo(i + 24 + H, H);
      ctx.lineTo(i + H, H);
      ctx.fill();
    }
    ctx.restore();
  } else {
    ctx.fillStyle = s.frame;
    ctx.fillRect(cx - 12, cy - 12, cw + 24, ch + 24);
  }
  ctx.fillStyle = s.paper;
  ctx.fillRect(cx, cy, cw, ch);
  ctx.strokeStyle = s.frame === 'candycane' ? 'rgba(160,120,60,0.4)' : s.frame;
  ctx.lineWidth = 2;
  ctx.strokeRect(cx + 24, cy + 24, cw - 48, ch - 48);

  const lines = cardImageLines(payload);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = s.accent;
  ctx.font = `700 60px ${s.headingFont}`;
  let y = cy + 140;
  for (const l of wrapText(ctx, lines.heading, cw - 140).slice(0, 2)) {
    ctx.fillText(l, W / 2, y);
    y += 70;
  }
  ctx.fillStyle = s.ink;
  ctx.font = `italic 40px ${s.nameFont === s.headingFont ? 'Georgia, serif' : '"Cormorant Garamond", Georgia, serif'}`;
  y += 60;
  ctx.fillText(lines.lead, W / 2, y);

  ctx.fillStyle = s.accent;
  let size = 150;
  ctx.font = `600 ${size}px ${s.nameFont}`;
  while (size > 50 && wrapText(ctx, lines.name, cw - 120).length > 2) {
    size -= 10;
    ctx.font = `600 ${size}px ${s.nameFont}`;
  }
  const nameLines = wrapText(ctx, lines.name, cw - 120).slice(0, 3);
  y += 80 + size / 2;
  for (const l of nameLines) {
    ctx.fillText(l, W / 2, y);
    y += size * 1.05;
  }
  ctx.fillStyle = s.ink;
  ctx.font = '500 34px "Inter Variable", system-ui, sans-serif';
  ctx.fillText(lines.footer.join('  ·  '), W / 2, cy + ch - 110);
  ctx.font = '600 28px "Inter Variable", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('🎁  Secret Santa  ·  shhh, it’s a secret!', W / 2, H - 80);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image.'))), 'image/png'));
}
