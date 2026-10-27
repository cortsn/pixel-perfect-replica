import { useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';

const places = [{name:'Reception',floor:0,x:65,y:185},{name:'Restaurant Lys',floor:0,x:230,y:70},{name:'Vinkælder',floor:-1,x:70,y:70},{name:'Taghave',floor:4,x:230,y:185},{name:'Bar Nord',floor:4,x:70,y:70},{name:'Spa',floor:4,x:230,y:70}];
export function HotelMap({room}:{room:string}) {
  const roomFloor = Number(room[0]);
  const [floor,setFloor] = useState(roomFloor);
  const [destination,setDestination] = useState<string>('');
  const [atReception,setAtReception] = useState(false);
  const currentFloor = atReception ? 0 : roomFloor;
  const target = places.find(p=>p.name===destination);
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Illustrativ hotelplan · Simuleret position</p>
    <div className="flex flex-wrap gap-1" aria-label="Etager">{[-1,0,1,2,3,4].map(f=><Button key={f} size="sm" variant={floor===f?'default':'outline'} onClick={()=>setFloor(f)}>{f===-1?'K':f===0?'Stue':`${f}. sal`}</Button>)}</div>
    <svg viewBox="0 0 300 260" role="img" aria-label={`Hotelplan ${floor}. sal`} className="w-full rounded-lg border bg-secondary text-foreground">
      <rect x="12" y="12" width="276" height="236" fill="var(--card)" stroke="var(--foreground)" strokeWidth="3" />
      <path d="M12 120 H288 M120 12 V120 M180 120 V248" fill="none" stroke="var(--border)" strokeWidth="3" />
      <rect x="120" y="100" width="60" height="70" fill="var(--secondary)" stroke="var(--foreground)" />
      <text x="150" y="132" textAnchor="middle" fontSize="12">Elevator</text><text x="150" y="151" textAnchor="middle" fontSize="10">& trappe</text>
      {floor>=1&&floor<=3 ? <>{[1,2,3,4].map((n)=><text key={n} x={n%2?65:230} y={n<=2?65:190} textAnchor="middle" fontSize="14">Værelse {floor}0{n}</text>)}</> : places.filter(p=>p.floor===floor).map(p=><text key={p.name} x={p.x} y={p.y} textAnchor="middle" fontSize="12">{p.name}</text>)}
      {target&&floor===target.floor&&<><path d={`M150 170 L150 215 L${target.x} 215 L${target.x} ${target.y+12}`} fill="none" stroke="var(--brass)" strokeWidth="4" strokeDasharray="6 4"/><circle cx={target.x} cy={target.y+12} r="6" fill="var(--brass)"/></>}
      {floor===currentFloor&&<><circle cx="90" cy="100" r="10" fill="var(--primary)" stroke="var(--primary-foreground)" strokeWidth="3"/><text x="65" y="115" fontSize="10">Du er her</text></>}
    </svg>
    <Button variant="outline" className="w-full" onClick={()=>{setAtReception(!atReception);setFloor(atReception?roomFloor:0);}}><MapPin/>Min position: {atReception?'Reception':`Værelse ${room}`}</Button>
    <label className="block text-sm">Hvor vil du hen?<select className="mt-2 w-full rounded-md border bg-card p-3" value={destination} onChange={e=>{setDestination(e.target.value);const p=places.find(x=>x.name===e.target.value);if(p)setFloor(p.floor);}}><option value="">Vælg destination</option>{places.map(p=><option key={p.name}>{p.name}</option>)}</select></label>
    {target&&<p className="flex gap-2 text-sm"><Navigation className="h-5 w-5 shrink-0"/>Fra {atReception?'receptionen':`værelse ${room}`}: {currentFloor!==target.floor?`Tag elevatoren til ${target.floor===-1?'kælderen':target.floor===0?'stueetagen':`${target.floor}. sal`}. `:'Følg gangen til elevatoren. '}Følg den markerede vej til {target.name}.</p>}
  </div>;
}
