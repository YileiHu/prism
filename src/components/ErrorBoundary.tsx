import { Component, type ReactNode } from "react";
import Button from "./Button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-screen flex items-center justify-center bg-base text-primary select-none">
          <div className="text-center max-w-md">
            <p className="text-section font-semibold text-primary mb-2">Something went wrong</p>
            <p className="text-body text-muted mb-4 break-all">{this.state.error.message}</p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            >
              Reload
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
