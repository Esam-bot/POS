import { Component } from 'react';
import Button from './ui/Button';

/**
 * Catches render/runtime errors so the UI shows a recovery panel
 * instead of an uncaught React white screen.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const message =
      typeof error?.message === 'string' && error.message
        ? error.message
        : 'Something went wrong while rendering this screen.';

    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-[var(--color-ink)]">
        <h1 className="text-xl font-semibold">Screen error</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          The page hit a runtime error and was stopped to avoid a blank screen.
        </p>
        <pre className="overflow-x-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-3 text-xs text-[var(--color-danger)]">
          {message}
        </pre>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset?.();
            }}
          >
            Try again
          </Button>
          <Button variant="secondary" onClick={() => window.location.assign('/pos')}>
            Back to POS
          </Button>
        </div>
      </div>
    );
  }
}
