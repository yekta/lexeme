"use client";

import { Component, ErrorInfo, ReactNode } from "react";

type TProps = {
  children?: ReactNode;
};

type TState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<TProps, TState> {
  public state: TState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): TState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage =
        this.state.error?.message || "An unexpected error occurred.";
      try {
        const parsed = JSON.parse(errorMessage);
        if (parsed.error) {
          errorMessage = parsed.error;
        }
      } catch (e) {
        // Not a JSON string
        console.log(
          "Error message is not JSON:",
          e,
          "Original message:",
          errorMessage,
        );
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">
            Something went wrong
          </h1>
          <p className="text-muted-foreground mb-4 max-w-md">{errorMessage}</p>
          <button
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
