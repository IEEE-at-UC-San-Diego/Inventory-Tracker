import { ConvexProvider } from "convex/react";
import { useMemo } from "react";
import { ConvexQueryClient } from "@/integrations/convex/react-query";

const CONVEX_URL = (import.meta as any).env.VITE_CONVEX_URL;
if (!CONVEX_URL) {
	console.error("missing envar CONVEX_URL");
}

const convexQueryClient = new ConvexQueryClient(CONVEX_URL);

/**
 * ConvexProvider without token-based auth
 * Auth is now handled via auth context passed to queries/mutations as arguments
 */
export default function AppConvexProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	// Create Convex client without auth (using auth context instead)
	const convexClient = useMemo(() => {
		const client = convexQueryClient.convexClient;

		// No auth set - auth context is passed as arguments to queries/mutations
		client.setAuth(async () => null);

		return client;
	}, []);

	return <ConvexProvider client={convexClient}>{children}</ConvexProvider>;
}
