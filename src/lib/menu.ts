/** Roomservice-menuen og gæstens kurv. Priserne her er kun til visning: serveren regner altid selv prisen ud ved bestilling. */
export type Variant = { name: string; price_delta_cents: number };
export type Addon = { name: string; price_cents: number };
export type MenuItem = {
  id: string; name: string; description: string; price_cents: number; image_url: string | null; image_ver?: number | null;
  variants: Variant[]; addons: Addon[]; available_now: boolean; available_from: string | null; available_to: string | null;
};
export type MenuCategory = { id: string; name: string; items: MenuItem[] };
export type GuestMenu = { settings: { enabled: boolean; opens_at: string; closes_at: string; open_now: boolean } | null; categories: MenuCategory[] };

export type CartLine = { key: string; item: MenuItem; variant: string | null; addons: string[]; qty: number };
export const MAX_QTY = 10;

export function unitPrice(item: MenuItem, variant: string | null, addons: string[]): number {
  const v = variant ? item.variants.find(x => x.name === variant)?.price_delta_cents ?? 0 : 0;
  const a = addons.reduce((sum, n) => sum + (item.addons.find(x => x.name === n)?.price_cents ?? 0), 0);
  return item.price_cents + v + a;
}
/** Samme vare med samme valg lægges sammen i kurven. */
export const lineKey = (itemId: string, variant: string | null, addons: string[]) => `${itemId}|${variant ?? ''}|${[...addons].sort().join('+')}`;

export function addToCart(cart: CartLine[], item: MenuItem, variant: string | null, addons: string[], qty: number): CartLine[] {
  const key = lineKey(item.id, variant, addons);
  const found = cart.find(l => l.key === key);
  if (found) return cart.map(l => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l));
  return [...cart, { key, item, variant, addons: [...addons].sort(), qty: Math.min(MAX_QTY, qty) }];
}
export const setLineQty = (cart: CartLine[], key: string, qty: number): CartLine[] =>
  qty <= 0 ? cart.filter(l => l.key !== key) : cart.map(l => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, qty) } : l));
export const cartTotal = (cart: CartLine[]) => cart.reduce((s, l) => s + l.qty * unitPrice(l.item, l.variant, l.addons), 0);
export const cartCount = (cart: CartLine[]) => cart.reduce((s, l) => s + l.qty, 0);
export const lineLabel = (l: Pick<CartLine, 'item' | 'variant' | 'addons'>) =>
  [l.item.name, l.variant ? `(${l.variant})` : '', l.addons.length ? `+ ${l.addons.join(' + ')}` : ''].filter(Boolean).join(' ');
/** Formatet guest_order_menu forventer. */
export const toOrderLines = (cart: CartLine[]) => cart.map(l => ({ item_id: l.item.id, qty: l.qty, variant: l.variant, addons: l.addons }));

/** Når er en vare/roomservice tilgængelig, som tekst ("kl. 07:00–22:00"). Tom = hele døgnet. */
export const hoursText = (from: string | null, to: string | null) => (from && to && from !== to ? `kl. ${from}–${to}` : '');
