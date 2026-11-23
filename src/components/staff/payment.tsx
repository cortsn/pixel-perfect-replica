import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PAYMENT_METHODS } from '@/lib/billing';

const KEY = 'hp-pay-method';
/** Betalingsmåden, der sidst blev brugt, huskes, så den er forvalgt næste gang (hurtigt i travle perioder). */
export function useLastMethod() {
  const [method, setMethod] = useState<string>(() => { try { const v = localStorage.getItem(KEY); return v && (PAYMENT_METHODS as readonly string[]).includes(v) ? v : PAYMENT_METHODS[0]; } catch { return PAYMENT_METHODS[0]; } });
  const set = (m: string) => { setMethod(m); try { localStorage.setItem(KEY, m); } catch { /* ingen lagring */ } };
  return [method, set] as const;
}

/** Vælg hvordan regningen er betalt i hotellets eget betalingssystem. */
export function PaymentMethods({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Betalt via">
      {PAYMENT_METHODS.map(m => <Button key={m} type="button" size="sm" role="radio" aria-checked={value === m} variant={value === m ? 'default' : 'outline'} onClick={() => onChange(m)}>{value === m && <Check />}{m}</Button>)}
    </div>
  );
}
