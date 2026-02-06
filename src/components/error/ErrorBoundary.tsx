import { Link } from "@tanstack/react-router";
import { AlertTriangle, Bug, Home, RefreshCw } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "../ui/card";

interface ErrorBoundaryProps {
	children: React.ReactNode;
	fallback?: React.ReactNode;
	onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
	errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null, errorInfo: null };
	}

	static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		this.setState({ errorInfo });
		this.props.onError?.(error, errorInfo);

		// Log to console in development
		if (process.env.NODE_ENV === "development") {
			console.error("ErrorBoundary caught an error:", error, errorInfo);
		}
	}

	handleReset = () => {
		this.setState({ hasError: false, error: null, errorInfo: null });
	};

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<ErrorFallback
					error={this.state.error}
					errorInfo={this.state.errorInfo}
					onReset={this.handleReset}
				/>
			);
		}

		return this.props.children;
	}
}

// Error fallback UI
interface ErrorFallbackProps {
	error: Error | null;
	errorInfo: React.ErrorInfo | null;
	onReset?: () => void;
	className?: string;
}

export function ErrorFallback({
	error,
	errorInfo,
	onReset,
	className,
}: ErrorFallbackProps) {
	const [showDetails, setShowDetails] = React.useState(false);

	return (
		<div
			className={cn(
				"min-h-[400px] flex items-center justify-center p-6",
				className,
			)}
		>
			<Card className="max-w-2xl w-full">
				<CardContent className="p-8">
					{/* Header */}
					<div className="flex items-start gap-4 mb-6">
						<div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
							<AlertTriangle className="w-6 h-6 text-red-600" />
						</div>
						<div>
							<h2 className="text-xl font-semibold text-gray-900">
								Something went wrong
							</h2>
							<p className="text-gray-600 mt-1">
								An unexpected error occurred. We've been notified and are
								working to fix it.
							</p>
						</div>
					</div>

					{/* Error message */}
					{error && (
						<div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
							<p className="text-sm font-medium text-red-800">
								{error.message}
							</p>
							{error.stack && (
								<button
									type="button"
									onClick={() => setShowDetails(!showDetails)}
									className="text-xs text-red-600 hover:text-red-700 mt-2 flex items-center gap-1"
								>
									<Bug className="w-3 h-3" />
									{showDetails ? "Hide details" : "Show technical details"}
								</button>
							)}
						</div>
					)}

					{/* Stack trace (collapsible) */}
					{showDetails && errorInfo && (
						<div className="mb-6">
							<pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-auto max-h-64">
								{errorInfo.componentStack}
							</pre>
						</div>
					)}

					{/* Action buttons */}
					<div className="flex flex-wrap gap-3">
						{onReset && (
							<button
								type="button"
								onClick={onReset}
								className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
							>
								<RefreshCw className="w-4 h-4" />
								Try Again
							</button>
						)}
						<Link
							to="/home"
							className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
						>
							<Home className="w-4 h-4" />
							Go to Home
						</Link>
						<button
							type="button"
							onClick={() => window.location.reload()}
							className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
						>
							<RefreshCw className="w-4 h-4" />
							Reload Page
						</button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

// Route-level error boundary wrapper
interface RouteErrorBoundaryProps {
	children: React.ReactNode;
}

export function RouteErrorBoundary({ children }: RouteErrorBoundaryProps) {
	return (
		<ErrorBoundary
			fallback={
				<div className="p-6">
					<ErrorFallback error={new Error("Route error")} errorInfo={null} />
				</div>
			}
		>
			{children}
		</ErrorBoundary>
	);
}

// Component-level error fallback for small sections
interface SectionErrorProps {
	title?: string;
	message?: string;
	onRetry?: () => void;
	className?: string;
}

export function SectionError({
	title = "Failed to load",
	message = "Something went wrong while loading this section.",
	onRetry,
	className,
}: SectionErrorProps) {
	return (
		<div
			className={cn(
				"p-6 bg-red-50 border border-red-200 rounded-lg text-center",
				className,
			)}
		>
			<AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
			<h3 className="font-medium text-red-900 mb-1">{title}</h3>
			<p className="text-sm text-red-700 mb-3">{message}</p>
			{onRetry && (
				<button
					type="button"
					onClick={onRetry}
					className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
				>
					<RefreshCw className="w-3 h-3" />
					Retry
				</button>
			)}
		</div>
	);
}

// Async error handler hook
export function useErrorHandler() {
	const [error, setError] = React.useState<Error | null>(null);

	const handleError = React.useCallback((err: unknown) => {
		if (err instanceof Error) {
			setError(err);
		} else {
			setError(new Error(String(err)));
		}
	}, []);

	const clearError = React.useCallback(() => {
		setError(null);
	}, []);

	return { error, handleError, clearError };
}
