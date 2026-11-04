import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
export function HotelModal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}) {
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent aria-describedby={undefined} className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg"><DialogTitle className="text-center font-display text-3xl">{title}</DialogTitle>{children}</DialogContent></Dialog>;
}
