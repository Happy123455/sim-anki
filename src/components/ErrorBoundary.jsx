import { Component } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

/**
 * Catches render crashes so one broken screen shows a recovery panel instead
 * of blanking the whole app. Data lives in storage, so nothing is lost.
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
    console.error('[SimAnki] Screen crashed:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { onReset } = this.props;
    return (
      <div className="crash-panel glass-panel animate-fade-in" role="alert">
        <AlertTriangle size={40} className="crash-icon" aria-hidden="true" />
        <h2>Something went wrong on this screen</h2>
        <p>Your decks and review progress are saved on this device, so nothing has been lost.</p>
        <div className="crash-actions">
          {onReset && (
            <button
              className="btn btn-primary"
              onClick={() => {
                this.setState({ error: null });
                onReset();
              }}
            >
              <Home size={18} /> Back to dashboard
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => window.location.reload()}>
            <RotateCcw size={18} /> Reload app
          </button>
        </div>
        <details className="crash-details">
          <summary>Technical details</summary>
          <code>{String(error?.message || error)}</code>
        </details>
      </div>
    );
  }
}
