import { useEffect, useState } from 'react';
import { rpc } from '@/lib/cleaning';

/** Billeder, der er uploadet fra en computer, ligger i databasen og hentes først, når de skal vises (menuen selv er let). */
const cache = new Map<string, Promise<string | null>>();
export function loadMenuImage(id: string, ver: number): Promise<string | null> {
  const key = `${id}:${ver}`;
  let p = cache.get(key);
  if (!p) { p = rpc<string>('menu_item_image', { _id: id }).then(r => r.data ?? null).catch(() => null); cache.set(key, p); }
  return p;
}

/** Adressen på varens billede: uploadet billede først, ellers webadressen. */
export function useMenuImage(item: { id: string; image_ver?: number | null; image_url?: string | null }): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    if (item.image_ver) void loadMenuImage(item.id, item.image_ver).then(d => { if (alive) setSrc(d); });
    return () => { alive = false; };
  }, [item.id, item.image_ver]);
  return item.image_ver ? (src ?? item.image_url ?? null) : (item.image_url ?? null);
}

export const MAX_IMAGE_CHARS = 330000;
/** Forkleinder et billede fra computeren (højst 640 px) og gør det til en lille JPEG, så den kan gemmes i databasen. */
export async function resizeImage(file: File, max = 640): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Vælg en billedfil (JPG, PNG eller WebP).');
  if (file.size > 15 * 1024 * 1024) throw new Error('Billedet er for stort (højst 15 MB).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('Billedet kunne ikke læses. Prøv JPG, PNG eller WebP.')); i.src = url; });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Billedet kunne ikke behandles.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // gennemsigtige billeder får hvid baggrund
    ctx.drawImage(img, 0, 0, w, h);
    for (const q of [0.85, 0.72, 0.6, 0.45]) {
      const data = canvas.toDataURL('image/jpeg', q);
      if (data.length <= MAX_IMAGE_CHARS) return data;
    }
    throw new Error('Billedet er stadig for stort. Vælg et mindre billede.');
  } finally { URL.revokeObjectURL(url); }
}
