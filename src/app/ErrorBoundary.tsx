import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { de } from '@/i18n/de';

interface State {
  error: Error | null;
}

/** Catches render errors anywhere below and offers a reload instead of a white screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="flex h-dvh flex-col items-center justify-center gap-5 px-6 text-center"
      >
        <div className="flex size-20 items-center justify-center rounded-full bg-danger-soft text-3xl text-danger">
          !
        </div>
        <div className="flex max-w-md flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{de.errors.title}</h1>
          <p className="text-base text-fg-secondary">{de.errors.text}</p>
        </div>
        <Button icon={RefreshCw} onClick={() => window.location.reload()}>
          {de.errors.reload}
        </Button>
      </div>
    );
  }
}
