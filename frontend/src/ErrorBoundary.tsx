import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  forceReloadForStaleChunks,
  isStaleChunkLoadError,
  maybeReloadForStaleChunks,
} from './utils/staleChunk';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (maybeReloadForStaleChunks(error)) return;
    console.error('Uncaught error:', error, errorInfo);
    console.error('Error stack:', error.stack);
    console.error('Component stack:', errorInfo.componentStack);
  }

  public render() {
    if (this.state.hasError) {
      if (maybeReloadForStaleChunks(this.state.error)) {
        return null
      }
      const staleChunk = isStaleChunkLoadError(this.state.error)
      const friendlyMessage = staleChunk
        ? 'Mulligan was updated in the background. Reload once to load the latest version.'
        : this.state.error?.message || 'An unexpected error occurred'

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#dc2626' }}>
            Something went wrong
          </h1>
          <p style={{ marginBottom: '1rem', color: '#666' }}>
            {friendlyMessage}
          </p>
          <button
            onClick={() => {
              if (staleChunk) {
                forceReloadForStaleChunks();
                return;
              }
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Reload Page
          </button>
          {!staleChunk ? (
            <details style={{ marginTop: '2rem', textAlign: 'left', maxWidth: '800px' }} open>
              <summary style={{ cursor: 'pointer', marginBottom: '1rem', fontWeight: 'bold' }}>Error Details (Click to expand)</summary>
              <div style={{ marginBottom: '1rem' }}>
                <strong>Error Message:</strong>
                <pre style={{
                  background: '#f3f4f6',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  overflow: 'auto',
                  fontSize: '0.875rem',
                  marginTop: '0.5rem'
                }}>
                  {this.state.error?.message}
                </pre>
              </div>
              <div>
                <strong>Stack Trace:</strong>
                <pre style={{
                  background: '#f3f4f6',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  overflow: 'auto',
                  fontSize: '0.875rem',
                  marginTop: '0.5rem',
                  maxHeight: '400px'
                }}>
                  {this.state.error?.stack}
                </pre>
              </div>
            </details>
          ) : null}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

