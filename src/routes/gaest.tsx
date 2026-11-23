import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { KeyRound, Utensils, Sparkles, Map, Share2, Wifi, Minus, Plus, Leaf, Check, X, ShowerHead, ClipboardList, CalendarDays, DoorOpen, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageCard, SettingsGroup, SettingsRow, SubPage } from '@/components/hotel/settings-ui';
import { StatusPill } from '@/components/hotel/status-pill';
import { HotelMap } from '@/components/hotel/hotel-map';
import { supabase } from '@/integrations/supabase/client';
import { clearSession, guestCheckIn, guestJoin, guestSession, listStored, loadStored, saveSession, setActiveStored, MEAL_FIELD, type Meal, errorText, HOUSEKEEPING_LABELS, ORDER_LABELS, type GuestSession, type OrderStatus } from '@/lib/hotel';
import { stayState, cancellable, cleaningProgress, noticeText, towelNextAt, hm } from '@/lib/stay';
import { shareLink } from '@/lib/share';
import { CheckInScreen, StayEndTimer, StayNotice, WaitingScreen } from '@/components/hotel/stay';
import { MealsForm } from '@/components/hotel/meals';
import { RoomSwitcher } from '@/components/hotel/room-switcher';
import { StayEndedScreen } from '@/components/hotel/stay-ended';
import { RoomService } from '@/components/hotel/room-service';
import { CleaningForm, CleaningStatusNote } from '@/components/hotel/guest-requests';
import { rpc, type CleaningRequest } from '@/lib/cleaning';
import { fmtDKK } from '@/lib/money';
import { categoryLabel, type BillItem } from '@/lib/billing';
import type { GuestMenu, toOrderLines } from '@/lib/menu';

export const Route = createFileRoute('/gaest')({
 validateSearch:(s:Record<string,unknown>)=>({t:typeof s['t']==='string'?s['t']:undefined}),
 head:()=>({meta:[{title:'Mit ophold — HotelPilot'},{name:'description',content:'Dit værelse, bestillinger, rengøring og aktiviteter på HotelPilot.'},{property:'og:title',content:'Mit ophold — HotelPilot'},{property:'og:description',content:'Din digitale concierge under opholdet.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),component:GuestDashboard,
});
type Order={id:string;type:string;details:string;status:OrderStatus;created_at:string;total_cents?:number;reject_reason?:string};
type GuestBill={items:Pick<BillItem,'id'|'category'|'description'|'quantity'|'unit_price_cents'|'paid'|'created_at'>[];total_cents:number;due_cents:number};
type Event={id:string;title:string;starts_at:string;location:string;description:string};
type Sheet='towels'|'clean'|'food'|'share'|'map'|'wifi'|'meals'|'rooms'|'events'|'orders'|'bill'|null;
function GuestDashboard(){
 const {t}=Route.useSearch();const navigate=useNavigate();
 const [s,setS]=useState<GuestSession|null>(null);const [error,setError]=useState('');const [expired,setExpired]=useState(false);
 const [orders,setOrders]=useState<Order[]>([]);const [events,setEvents]=useState<Event[]>([]);
 const [sheet,setSheet]=useState<Sheet>(null);const [quantity,setQuantity]=useState(2);const [extras,setExtras]=useState<{cleaning:CleaningRequest|null}>({cleaning:null});const [seenNotice,setSeenNotice]=useState<string|null>(null);const lastNotice=useRef<string|null|undefined>(undefined);
 const [menu,setMenu]=useState<GuestMenu|null>(null);const [bill,setBill]=useState<GuestBill|null>(null);
 const [busy,setBusy]=useState(false);
 const [clock,setClock]=useState(0);const [offset,setOffset]=useState(0);const [origin,setOrigin]=useState('');const [wifiConnected,setWifiConnected]=useState(false);
 const state=s?stayState(s.starts_at,s.ends_at,clock):'waiting';
 function fail(e:{message?:string}){const msg=errorText(e);if(e.message?.includes('STAY_EXPIRED')){setExpired(true);setSheet(null);}toast.error(msg);}
 function apply(session:GuestSession){if(lastNotice.current!==undefined&&session.notice_at&&session.notice_at!==lastNotice.current&&session.notice_kind)toast(noticeText(session.notice_kind,session.starts_at,session.ends_at));lastNotice.current=session.notice_at;setS(session);const delta=Date.parse(session.server_now)-Date.now();setOffset(delta);setClock(Date.now()+delta);}
 useEffect(()=>{try{setSeenNotice(localStorage.getItem('hp-notice-seen'));}catch{/* ingen lagring */}setOrigin(window.location.origin);let alive=true;(async()=>{try{const stored=loadStored();let session:GuestSession;if(t&&stored?.t!==t){session=await guestJoin(t);saveSession(session);void navigate({to:'/gaest',search:{t:undefined},replace:true});}else if(stored){session=await guestSession(stored.t,stored.d);}else{void navigate({to:'/'});return;}if(alive)apply(session);}catch(e){if(alive){const msg=(e as Error).message;if(msg.includes('ophold er desværre stoppet'))setExpired(true);else clearSession();setError(msg);}}})();return()=>{alive=false;};},[t,navigate]);
 useEffect(()=>{const tick=()=>setClock(Date.now()+offset);const timer=setInterval(tick,250);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);};},[offset]);
 useEffect(()=>{if(!s)return;const remaining=Date.parse(s.ends_at)-Date.now()-offset;if(remaining<=0){setExpired(true);setSheet(null);return;}const timer=setTimeout(()=>{setExpired(true);setSheet(null);},Math.min(remaining,2147483647));return()=>clearTimeout(timer);},[s,offset]);
 useEffect(()=>{if(!s||expired)return;let alive=true;const refresh=async()=>{try{const session=await guestSession(s.access_token,s.device_id);if(alive)apply(session);}catch(e){if(alive){setExpired(true);setSheet(null);setError((e as Error).message);}}};const timer=setInterval(refresh,5000);const ch=supabase.channel(`guest-room-${Math.random().toString(36).slice(2)}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'rooms',filter:`number=eq.${s.room_number}`},refresh).subscribe();return()=>{alive=false;clearInterval(timer);void supabase.removeChannel(ch);};},[s?.access_token,s?.device_id,expired]);
 useEffect(()=>{if(!s||expired)return;void loadExtras();const t=setInterval(()=>{void loadExtras();},6000);return()=>clearInterval(t);},[s?.access_token,s?.device_id,expired]);
 const loadOrders=async()=>{if(!s)return;const {data,error}=await supabase.rpc('guest_orders',{_token:s.access_token,_device:s.device_id});if(error){fail(error);return;}setOrders((data as unknown as Order[])??[]);};
 useEffect(()=>{if(!s||state!=='active'||expired)return;void loadOrders();void guestSession(s.access_token,s.device_id).then(apply).catch(()=>{});supabase.from('events').select('*').order('starts_at').then(({data})=>setEvents((data as Event[])??[]));const timer=setInterval(loadOrders,5000);const ch=supabase.channel(`guest-orders-${Math.random().toString(36).slice(2)}`).on('postgres_changes',{event:'*',schema:'public',table:'orders',filter:`room_number=eq.${s.room_number}`},loadOrders).subscribe();return()=>{clearInterval(timer);void supabase.removeChannel(ch);};},[s?.access_token,s?.device_id,state,expired]);
 async function sendMenuOrder(lines:ReturnType<typeof toOrderLines>,note:string):Promise<boolean>{if(!s||busy)return false;setBusy(true);const {error}=await rpc('guest_order_menu',{_token:s.access_token,_device:s.device_id,_lines:lines,_note:note});setBusy(false);if(error){fail(error);void loadMenu();return false;}setSheet(null);toast.success('Din bestilling er modtaget og lægges på din regning');await loadOrders();void loadBill();return true;}
 async function loadMenu(){const {data}=await rpc<GuestMenu>('guest_menu',{});if(data)setMenu(data);}
 async function loadBill(){if(!s)return;const {data}=await rpc<GuestBill>('guest_bill',{_token:s.access_token,_device:s.device_id});if(data)setBill(data);}
 useEffect(()=>{if(!s||state!=='active'||expired)return;void loadMenu();void loadBill();const timer=setInterval(()=>{void loadMenu();void loadBill();},15000);const ch=supabase.channel(`guest-menu-${Math.random().toString(36).slice(2)}`).on('postgres_changes',{event:'*',schema:'public',table:'menu_items'},()=>{void loadMenu();}).on('postgres_changes',{event:'*',schema:'public',table:'menu_categories'},()=>{void loadMenu();}).on('postgres_changes',{event:'*',schema:'public',table:'roomservice_settings'},()=>{void loadMenu();}).subscribe();return()=>{clearInterval(timer);void supabase.removeChannel(ch);};},[s?.access_token,s?.device_id,state,expired]);
 async function sendTowels(){if(!s||busy)return;if(towelNextAt(orders,clock)){toast.error('Du kan bestille håndklæder 1 gang hver 12. time.');return;}setBusy(true);const {error}=await supabase.rpc('guest_order_towels',{_token:s.access_token,_device:s.device_id,_qty:quantity});setBusy(false);if(error){fail(error);return;}setSheet(null);toast.success('Din bestilling er modtaget');await loadOrders();try{apply(await guestSession(s.access_token,s.device_id));}catch{/* næste opdatering henter status */}}
 async function loadExtras(){if(!s)return;const {data}=await rpc<typeof extras>('guest_extras',{_token:s.access_token,_device:s.device_id});if(data)setExtras(data);}
 async function requestCleaning(towels:number,from:Date|null,until:Date|null){if(!s||busy)return;setBusy(true);const {error}=await rpc('guest_request_cleaning_towels',{_token:s.access_token,_device:s.device_id,_towel_count:towels,_from:from?from.toISOString():null,_until:until?until.toISOString():null});setBusy(false);if(error){fail(error);return;}setS({...s,housekeeping_status:'needs_cleaning'});setSheet(null);toast.success('Personalet er underrettet. Rengøringen prøver at blive nået, men det er ikke sikkert.');await loadExtras();}
 async function checkIn(){if(!s||busy)return;setBusy(true);try{apply(await guestCheckIn(s.access_token,s.device_id));toast.success('Du er tjekket ind. Velkommen!');}catch(e){fail(e as {message?:string});}finally{setBusy(false);}}
 function dismissNotice(){if(!s?.notice_at)return;setSeenNotice(s.notice_at);try{localStorage.setItem('hp-notice-seen',s.notice_at);}catch{/* ingen lagring */}}
 async function cancel(id:string){if(!s||busy)return;setBusy(true);const {error}=await supabase.rpc('guest_cancel_order',{_token:s.access_token,_device:s.device_id,_order:id});setBusy(false);if(error){fail(error);return;}await loadOrders();toast.success('Bestillingen er annulleret');}
 async function meal(m:Meal,choice:'hotel'|'out'){if(!s||busy)return;const f=MEAL_FIELD[m];const clear=s[f]===choice;setBusy(true);const {error}=await rpc('guest_meal',{_token:s.access_token,_device:s.device_id,_meal:m,_choice:clear?'none':choice});setBusy(false);if(error){if(clear)toast.error('Valget kunne ikke fjernes lige nu. Prøv igen senere.');else fail(error);return;}setS({...s,[f]:clear?null:choice});toast.success(clear?'Dit valg er fjernet':'Tak for dit svar');}
 async function unlock(){if(!s||busy)return;setBusy(true);const {data,error}=await supabase.rpc('guest_unlock',{_token:s.access_token,_device:s.device_id});setBusy(false);if(error){fail(error);return;}toast.success(String(data));}
 function logout(){clearSession();if(listStored().rooms.length>0)window.location.assign('/gaest');else void navigate({to:'/'});}
 function openRoom(token:string){setActiveStored(token);window.location.assign('/gaest');}
 if(expired||state==='expired')return <StayEndedScreen onDone={logout}/>;
 if(error)return <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"><h1 className="text-3xl">Ingen adgang</h1><p>{error}</p><Button onClick={logout}>Til login</Button></div>;
 if(!s)return <div className="flex min-h-screen items-center justify-center">Åbner dit værelse…</div>;
 const notice=s.notice_kind&&s.notice_at&&s.notice_at!==seenNotice?<StayNotice kind={s.notice_kind} startsAt={s.starts_at} endsAt={s.ends_at} onDismiss={dismissNotice}/>:null;
 if(state==='waiting')return <WaitingScreen name={s.guest_name.split(' ')[0]??s.guest_name} startsAt={s.starts_at} clock={clock} notice={notice} onLogout={logout}/>;
 if(!s.checked_in_at)return <CheckInScreen name={s.guest_name.split(' ')[0]??s.guest_name} room={s.room_number} busy={busy} notice={notice} onCheckIn={checkIn} onLogout={logout}/>;
 const shareUrl=`${origin}/gaest?t=${s.access_token}`;const progress=cleaningProgress(s.housekeeping_status);const towelNext=towelNextAt(orders,clock);
 const activeOrders=orders.filter(o=>cancellable(o.status)).length;const mealsChosen=[s.breakfast_choice,s.lunch_choice,s.dinner_choice].filter(Boolean).length;
 const cleaningOpen=extras.cleaning&&['requested','in_progress'].includes(extras.cleaning.status);
 const TITLES:Record<Exclude<Sheet,null>,string>={towels:'Håndklæder',clean:'Rengøring',food:'Room service',share:'Del adgang',map:'Hotelkort',wifi:'Wi-Fi',meals:'Vælg måltider',rooms:'Mine værelser',events:'I dag på hotellet',orders:'Dine bestillinger',bill:'Din regning'};
 return <div className="mx-auto min-h-screen max-w-md pb-[calc(env(safe-area-inset-bottom)+2rem)]">
 <header className="rounded-b-3xl bg-gradient-forest px-6 pb-7 pt-[calc(env(safe-area-inset-top)+1.75rem)] text-forest-foreground"><div className="flex items-center justify-between"><span className="font-display text-2xl">HotelPilot</span><Button variant="ghost" size="sm" onClick={logout}>Log ud</Button></div><p className="eyebrow mt-6 text-brass">Værelse {s.room_number}</p><h1 className="mt-2 text-4xl">Velkommen, {s.guest_name.split(' ')[0]}</h1><p className="mt-2 text-xs text-forest-foreground/70">Check ud {new Date(s.ends_at).toLocaleString('da-DK',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</p></header>
 <main className="space-y-5 px-4 pt-4">
 {notice}
 <section id="noegle" className="rounded-2xl border bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><p className="eyebrow text-muted-foreground">Digital nøgle · Værelse {s.room_number}</p><span className="flex items-center gap-1 text-xs text-status-clean"><Check className="h-4 w-4"/>Aktiv</span></div><Button className="mt-3 h-16 w-full rounded-full bg-gradient-brass text-lg font-semibold text-accent-foreground shadow-soft" disabled={busy} onClick={unlock}><KeyRound className="!h-6 !w-6"/>Lås dør op</Button></section>
 <SettingsGroup title="Bestil">
 <SettingsRow Icon={ShowerHead} tone="primary" title="Håndklæder" value={towelNext?`Igen kl. ${hm(new Date(towelNext).toISOString())}`:`op til ${s.towel_limit}`} onClick={()=>{setQuantity(Math.max(1,Math.min(quantity,s.towel_limit)));setSheet('towels');}}/>
 <SettingsRow Icon={Utensils} tone="brass" title="Room service" value={menu?.settings&&!menu.settings.open_now?`Åbner ${menu.settings.opens_at}`:"Mad og drikke"} onClick={()=>setSheet('food')}/>
 <SettingsRow Icon={Sparkles} tone="clean" title="Rengøring" value={HOUSEKEEPING_LABELS[s.housekeeping_status]} onClick={()=>setSheet('clean')}/>
 <SettingsRow Icon={ReceiptText} tone="forest" title="Din regning" value={bill?fmtDKK(bill.total_cents):undefined} onClick={()=>setSheet('bill')}/>
 {orders.length>0&&<SettingsRow Icon={ClipboardList} tone="forest" title="Dine bestillinger" badge={activeOrders} value={activeOrders?undefined:String(orders.length)} onClick={()=>setSheet('orders')}/>}
 </SettingsGroup>
 <SettingsGroup title="Opholdet">
 <SettingsRow Icon={Leaf} tone="clean" title="Vælg måltider" value={mealsChosen?`${mealsChosen} valgt`:undefined} onClick={()=>setSheet('meals')}/>
 <SettingsRow Icon={Wifi} tone="primary" title="Wi-Fi" value={s.wifi_ssid} onClick={()=>setSheet('wifi')}/>
 <SettingsRow Icon={Map} tone="forest" title="Hotelkort" onClick={()=>setSheet('map')}/>
 <SettingsRow Icon={CalendarDays} tone="dirty" title="I dag på hotellet" value={events.length?String(events.length):undefined} onClick={()=>setSheet('events')}/>
 </SettingsGroup>
 <SettingsGroup>
 <SettingsRow Icon={Share2} tone="brass" title="Del adgang" value={`${s.devices}/${s.max_devices}`} onClick={()=>setSheet('share')}/>
 <SettingsRow Icon={DoorOpen} tone="forest" title="Mine værelser" onClick={()=>setSheet('rooms')}/>
 </SettingsGroup>
 <StayEndTimer endsAt={s.ends_at} clock={clock}/>
 </main>
 {sheet&&<SubPage title={TITLES[sheet]} onBack={()=>{if(!busy)setSheet(null);}}>
 {sheet==='towels'&&(()=>{const max=Math.max(1,s.towel_limit);const qty=Math.min(quantity,max);return <PageCard><p className="text-center text-sm text-muted-foreground">Hvor mange håndklæder skal byttes?</p><div className="flex items-center justify-center gap-4"><Button variant="outline" size="icon" className="h-9 w-9 rounded-full" aria-label="Færre håndklæder" disabled={qty<=1} onClick={()=>setQuantity(Math.max(1,qty-1))}><Minus/></Button><span aria-label="Antal håndklæder" className="w-10 text-center text-3xl font-semibold leading-none tabular-nums">{qty}</span><Button variant="outline" size="icon" className="h-9 w-9 rounded-full" aria-label="Flere håndklæder" disabled={qty>=max} onClick={()=>setQuantity(qty+1)}><Plus/></Button></div><p className="text-center text-sm text-muted-foreground">Du kan bytte op til {max} ad gangen, lige så mange som personer på værelset. Håndklæder kan bestilles 1 gang hver 12. time.</p>{towelNext&&<p role="status" className="rounded-md bg-secondary p-3 text-sm">Du har allerede bestilt håndklæder. Du kan bestille igen kl. {hm(new Date(towelNext).toISOString())}.</p>}<Button className="w-full" disabled={busy||!!towelNext} onClick={sendTowels}>Bestil {qty} {qty===1?'håndklæde':'håndklæder'}</Button></PageCard>;})()}
 {sheet==='food'&&<PageCard><RoomService room={s.room_number} menu={menu} busy={busy} onSubmit={sendMenuOrder}/></PageCard>}
 {sheet==='bill'&&<PageCard>{!bill||bill.items.length===0?<p className="text-sm text-muted-foreground">Der er endnu intet på din regning. Roomservice og andre køb dukker op her, så snart de er leveret.</p>:<><ul className="divide-y">{bill.items.map(i=><li key={i.id} className="flex items-start justify-between gap-3 py-2.5"><span className="min-w-0"><span className="block break-words text-sm">{i.quantity>1?`${i.quantity}× `:''}{i.description}</span><span className="text-xs text-muted-foreground">{categoryLabel(i.category)}</span></span><span className="shrink-0 text-sm tabular-nums">{fmtDKK(i.quantity*i.unit_price_cents)}</span></li>)}</ul><div className="flex justify-between border-t pt-3 font-semibold"><span>I alt</span><span>{fmtDKK(bill.total_cents)}</span></div></>}<p className="rounded-md bg-secondary p-3 text-xs text-muted-foreground">Regningen betales ved check ud i receptionen. Nye køb kommer på, når de er leveret.</p></PageCard>}
 {sheet==='clean'&&<><PageCard><p className="text-sm text-muted-foreground">{HOUSEKEEPING_LABELS[s.housekeeping_status]}</p><CleaningStatusNote req={extras.cleaning}/><progress aria-label="Rengøringsstatus" value={progress} max={100} className="hotel-progress h-2 w-full"/><div className="flex justify-between text-xs text-muted-foreground"><span>Modtaget</span><span>I gang</span><span>Gennemført</span></div></PageCard>{!cleaningOpen&&<PageCard><CleaningForm room={s.room_number} guests={s.guests} busy={busy} onSubmit={requestCleaning}/></PageCard>}</>}
 {sheet==='orders'&&<PageCard><ul className="divide-y">{orders.map(o=><li key={o.id} className="py-3 first:pt-0 last:pb-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm">{o.details||'Håndklæder'}</p>{!!o.total_cents&&<p className="text-xs text-muted-foreground">{fmtDKK(o.total_cents)}</p>}{o.status==='rejected'&&<p className="text-xs text-destructive">Afvist{o.reject_reason?`: ${o.reject_reason}`:''}</p>}</div><StatusPill status={o.status}/></div>{cancellable(o.status)&&<Button size="sm" variant="ghost" className="mt-2 text-destructive" disabled={busy} onClick={()=>cancel(o.id)}><X/>Annuller bestilling</Button>}</li>)}</ul></PageCard>}
 {sheet==='meals'&&<PageCard><MealsForm choices={s} busy={busy} onChoose={meal}/></PageCard>}
 {sheet==='wifi'&&<><div className="rounded-2xl bg-gradient-forest p-5 text-forest-foreground"><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs opacity-60">Netværk</p><p className="break-all">{s.wifi_ssid}</p></div><div><p className="text-xs opacity-60">Adgangskode</p><p className="break-all font-mono">{s.wifi_password}</p></div></div></div><PageCard><p className="eyebrow text-brass">HotelPilot · Netværkslogin</p><p className="text-sm text-muted-foreground">Simuleret Wi-Fi-login</p>{wifiConnected?<div className="flex items-center gap-3 py-2"><Check className="text-status-clean"/><p>Du er koblet på {s.wifi_ssid}</p></div>:<Button className="w-full" disabled={busy} onClick={()=>{setWifiConnected(true);toast.success('Wi-Fi-forbindelse simuleret');}}>Kobl på hotellets netværk</Button>}</PageCard></>}
 {sheet==='map'&&<PageCard><HotelMap room={s.room_number}/></PageCard>}
 {sheet==='events'&&<PageCard>{events.length===0?<p className="text-sm text-muted-foreground">Intet planlagt i dag.</p>:<ul className="space-y-4">{events.map(e=><li key={e.id} className="flex gap-4"><span className="w-12 shrink-0 font-display text-xl text-brass">{e.starts_at.slice(0,5)}</span><div><p className="font-semibold">{e.title}</p><p className="text-sm text-muted-foreground">{e.location} · {e.description}</p></div></li>)}</ul>}</PageCard>}
 {sheet==='share'&&<PageCard><p className="text-sm">Scan koden eller del linket. Der er plads til {s.max_devices} enheder ({s.guests} {s.guests===1?'person':'personer'} + 2 ekstra) · {s.devices} tilknyttet.</p><div className="flex justify-center rounded-lg bg-secondary p-5"><QRCodeSVG value={shareUrl} size={180} bgColor="transparent" fgColor="currentColor"/></div><div className="grid grid-cols-2 gap-2"><Button onClick={async()=>{try{await navigator.clipboard.writeText(shareUrl);toast.success('Link kopieret');}catch{toast.error('Linket kunne ikke kopieres');}}}>Kopiér link</Button><Button variant="outline" onClick={async()=>{const r=await shareLink({title:'HotelPilot',text:`Her er adgang til værelse ${s.room_number} på HotelPilot:`,url:shareUrl});if(r==='copied')toast.success('Link kopieret');else if(r==='failed')toast.error('Linket kunne ikke deles');}}><Share2/>Del link</Button></div></PageCard>}
 {sheet==='rooms'&&(()=>{const st=listStored();return <PageCard><RoomSwitcher rooms={st.rooms} active={st.active} onOpen={openRoom} onAdd={()=>{void navigate({to:'/'});}}/></PageCard>;})()}
 </SubPage>}
 </div>;
}
