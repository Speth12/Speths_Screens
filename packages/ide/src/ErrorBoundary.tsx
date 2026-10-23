import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="h-full flex items-center justify-center bg-zinc-950 text-zinc-100">
          <div className="max-w-lg p-6 bg-zinc-900 border border-red-800 rounded-lg space-y-3">
            <div className="text-red-400 font-semibold">Something went wrong</div>
            <pre className="text-xs font-mono text-zinc-400 whitespace-pre-wrap break-all">
              {error.message}
              {error.stack ? "\n\n" + error.stack : ""}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
