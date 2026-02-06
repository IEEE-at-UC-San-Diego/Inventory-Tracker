import * as React from "react";
import { toast as sonnerToast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export function ToastProvider({ children }: { children: React.ReactNode }) {
	// Backward-compatible provider so existing routes don't need to change.
	return <>{children}</>;
}

export function useToast() {
	const toast = {
		success: (title: string, message?: string, duration?: number) => {
			sonnerToast.success(title, { description: message, duration });
		},
		error: (title: string, message?: string, duration?: number) => {
			sonnerToast.error(title, { description: message, duration });
		},
		warning: (title: string, message?: string, duration?: number) => {
			sonnerToast.warning(title, { description: message, duration });
		},
		info: (title: string, message?: string, duration?: number) => {
			sonnerToast.info(title, { description: message, duration });
		},
	};

	return {
		toasts: [],
		addToast: (_toast: {
			type: "success" | "error" | "warning" | "info";
			title: string;
			message?: string;
			duration?: number;
		}) => {},
		removeToast: (_id: string) => {},
		removeAll: () => sonnerToast.dismiss(),
		toast,
	};
}

export function useSimpleToast() {
	return { toast: useToast().toast };
}

export { Toaster };
