import { LogtoProvider } from "@logto/react";
import { useContext, useEffect } from "react";
import {
	type AuthContextValue,
	AuthReactContext,
	logtoAuthConfig,
} from "../lib/auth";

export function LogtoAuthProvider({ children }: { children: React.ReactNode }) {
	const callbackUrl = `${import.meta.env.VITE_SITE_URL || "http://localhost:3000"}/callback`;
	const apiResource =
		import.meta.env.VITE_LOGTO_API_RESOURCE || "urn:inventory-tracker:api";

	useEffect(() => {
		console.log("[LogtoAuth] Redirect URI:", callbackUrl);
		console.log("[LogtoAuth] VITE_SITE_URL:", import.meta.env.VITE_SITE_URL);
		console.log("[LogtoAuth] API Resource:", apiResource);
	}, []);

	const config = {
		...logtoAuthConfig,
		redirectUri: callbackUrl,
		scopes: import.meta.env.VITE_LOGTO_SCOPES?.split(",") || [
			"openid",
			"profile",
			"email",
			"offline_access",
		],
		resources: [apiResource],
	};

	return <LogtoProvider config={config}>{children}</LogtoProvider>;
}

export function useAuth(): AuthContextValue {
	const context = useContext(AuthReactContext);

	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}

	return context;
}
