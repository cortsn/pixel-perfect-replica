import { ORDER_LABELS, type OrderStatus } from '@/lib/hotel';

/** Ordrens status som lille mærke. */
export function StatusPill({status}:{status:OrderStatus}){return <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${status==='done'?'bg-status-clean/15 text-status-clean':status==='cancelled'?'bg-muted text-muted-foreground':status==='rejected'?'bg-destructive/15 text-destructive':status==='accepted'?'bg-primary/15 text-primary':status==='ready'?'bg-status-occupied/20 text-foreground':status==='in_progress'?'bg-status-cleaning/25 text-foreground':'bg-status-dirty/15 text-status-dirty'}`}>{ORDER_LABELS[status]}</span>;}
