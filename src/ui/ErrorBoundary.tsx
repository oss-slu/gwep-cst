import { Component, type ReactNode } from "react";

export interface FallbackProps {
  readonly error: unknown;
  /** Clears the error and renders the children again. */
  readonly retry: () => void;
  /** True once a retry has been made, so the fallback can offer something else. */
  readonly retried: boolean;
}

interface Props {
  readonly children: ReactNode;
  readonly fallback: (props: FallbackProps) => ReactNode;
  /** Runs before a retry, for example to forget failed downloads. */
  readonly onRetry?: () => void;
}

interface State {
  readonly failed: boolean;
  readonly error: unknown;
  readonly retried: boolean;
}

/**
 * Shows a fallback when anything inside fails to render or load.
 *
 * This is the app's one class component, an agreed exception to "function
 * components only" (AGENTS.md): React can catch rendering errors only with a
 * class component's getDerivedStateFromError.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false, error: undefined, retried: false };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { failed: true, error };
  }

  readonly #retry = () => {
    this.props.onRetry?.();
    this.setState({ failed: false, error: undefined, retried: true });
  };

  override render() {
    const { failed, error, retried } = this.state;
    return failed
      ? this.props.fallback({ error, retry: this.#retry, retried })
      : this.props.children;
  }
}
