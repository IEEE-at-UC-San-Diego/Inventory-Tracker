import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Navigate,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { useEffect, useId, useState } from "react";
import Header from "../components/Header";
import { Toaster } from "../components/ui/sonner";
import { ToastProvider } from "../components/ui/toast";
import { AuthProvider, LogtoAuthProvider } from "../hooks/useAuth";
import ConvexProvider from "../integrations/convex/provider";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "IEEE Inventory Tracker",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	notFoundComponent: NotFound,
	errorComponent: RootError,
	shellComponent: RootDocument,
});

function RootError({ error }: { error: unknown }) {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "Unexpected error";

	const normalizedMessage = message.toLowerCase();
	const authFailureFragments = [
		"auth context expired",
		"session expired",
		"token expired",
		"invalid auth context",
		"auth context mismatch",
	];

	if (
		authFailureFragments.some((fragment) =>
			normalizedMessage.includes(fragment),
		)
	) {
		return <Navigate to="/login" replace />;
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-surface px-6 py-12">
			<div className="w-full max-w-lg rounded-2xl border border-border bg-surface-elevated p-8 text-center shadow-[0_24px_80px_-48px_rgba(15,23,42,0.42)]">
				<h1 className="mb-2 text-2xl font-bold text-foreground">
					Something went wrong
				</h1>
				<p className="mb-6 text-muted-foreground">{message}</p>
				<Link
					to="/home"
					className="inline-flex rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				>
					Go to Dashboard
				</Link>
			</div>
		</div>
	);
}

function NotFound() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-surface px-6 py-12">
			<div className="w-full max-w-lg rounded-2xl border border-border bg-surface-elevated p-8 text-center shadow-[0_24px_80px_-48px_rgba(15,23,42,0.42)]">
				<h1 className="mb-2 text-4xl font-bold text-foreground">404</h1>
				<h2 className="mb-4 text-xl font-semibold text-foreground/80">
					Page Not Found
				</h2>
				<p className="mb-6 text-muted-foreground">
					The page you're looking for doesn't exist or has been moved.
				</p>
				<Link
					to="/home"
					className="inline-flex rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				>
					Go to Dashboard
				</Link>
			</div>
		</div>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	const [mounted, setMounted] = useState(false);
	const mainContentId = useId();

	useEffect(() => {
		setMounted(true);
	}, []);

	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				<a
					href={`#${mainContentId}`}
					className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow"
				>
					Skip to main content
				</a>
				<LogtoAuthProvider>
					<ConvexProvider>
						<AuthProvider>
							<ToastProvider>
								<Header />
								<main id={mainContentId}>{children}</main>
								<Toaster />
								{mounted && import.meta.env.DEV ? (
									<TanStackDevtools
										config={{
											position: "bottom-right",
										}}
										plugins={[
											{
												name: "Tanstack Router",
												render: <TanStackRouterDevtoolsPanel />,
											},
											{
												name: "TanStack Query",
												render: <ReactQueryDevtoolsPanel />,
											},
										]}
									/>
								) : null}
							</ToastProvider>
						</AuthProvider>
					</ConvexProvider>
				</LogtoAuthProvider>
				<Scripts />
			</body>
		</html>
	);
}
