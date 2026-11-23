import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** Fanger fejl på én side, så resten af personalesiden (menu og topbar) bliver stående. Viser hvad der gik galt. */
export class PageBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  override componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  override componentDidCatch(error: Error) { console.error('Fejl på personalesiden:', error); }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-lg rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center">
        <h2 className="text-2xl">Siden kunne ikke vises</h2>
        <p className="mt-2 text-sm text-muted-foreground">Der skete en fejl. Menuen virker stadig, så du kan prøve en anden side.</p>
        <p className="mt-3 break-words rounded-md bg-secondary p-2 text-left font-mono text-xs">{this.state.error.message}</p>
        <Button className="mt-4" onClick={() => this.setState({ error: null })}>Prøv igen</Button>
      </div>
    );
  }
}
