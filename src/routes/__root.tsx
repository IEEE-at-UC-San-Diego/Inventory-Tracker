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
import { useEffect, useState } from "react";
import Header from "../components/Header";
import { ToastProvider } from "../components/ui/toast";
import { Toaster } from "../components/ui/sonner";
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

	if (message.toLowerCase().includes("auth context expired")) {
		return <Navigate to="/login" replace />;
	}

	return (
		<div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
			<div className="max-w-lg w-full text-center p-8 bg-white rounded-lg shadow">
				<h1 className="text-2xl font-bold text-gray-900 mb-2">
					Something went wrong
				</h1>
				<p className="text-gray-600 mb-6">{message}</p>
				<Link
					to="/home"
					className="inline-block px-6 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
				>
					Go to Dashboard
				</Link>
			</div>
		</div>
	);
}

function NotFound() {
	return (
		<div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
			<div className="max-w-lg w-full text-center p-8 bg-white rounded-lg shadow">
				<h1 className="text-4xl font-bold text-gray-900 mb-2">404</h1>
				<h2 className="text-xl font-semibold text-gray-700 mb-4">
					Page Not Found
				</h2>
				<p className="text-gray-600 mb-6">
					The page you're looking for doesn't exist or has been moved.
				</p>
				<Link
					to="/home"
					className="inline-block px-6 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
				>
					Go to Dashboard
				</Link>
			</div>
		</div>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				<LogtoAuthProvider>
					<ConvexProvider>
						<AuthProvider>
							<ToastProvider>
								<Header />
								{children}
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
