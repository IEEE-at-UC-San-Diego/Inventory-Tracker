/**
 * Gated logger for auth-related debug output.
 *
 * - In production: zero console output.
 * - In development: opt-in via VITE_DEBUG_AUTH=true in .env.local
 *
 * Usage:
 *   import { authLog } from "@/lib/authLogger";
 *   authLog.debug("hydration complete", { userId });
 *   authLog.warn("token near expiry");
 *   authLog.error("verification failed", err);
 */

const isEnabled =
	typeof import.meta !== "undefined" &&
	import.meta.env?.DEV === true &&
	import.meta.env?.VITE_DEBUG_AUTH === "true";

function noop(..._args: unknown[]): void {
	// intentionally empty
}

export const authLog = {
	debug: isEnabled
		? (...args: unknown[]) => console.log("[auth]", ...args)
		: noop,
	info: isEnabled
		? (...args: unknown[]) => console.info("[auth]", ...args)
		: noop,
	warn: isEnabled
		? (...args: unknown[]) => console.warn("[auth]", ...args)
		: noop,
	error: (...args: unknown[]) => console.error("[auth]", ...args),
};
