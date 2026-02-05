import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import type { Toast } from "@/types";

// Toast notification system

interface ToastItemProps {
	toast: Toast;
	onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
	const icons = {
		success: <CheckCircle className="h-5 w-5 text-green-500" />,
		error: <AlertCircle className="h-5 w-5 text-red-500" />,
		warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
		info: <Info className="h-5 w-5 text-blue-500" />,
	};

	const borderColors = {
		success: "border-l-green-500",
		error: "border-l-red-500",
		warning: "border-l-yellow-500",
		info: "border-l-blue-500",
	};

	React.useEffect(() => {
		if (toast.duration === 0) return;

		const duration = toast.duration || 5000;
		const timer = setTimeout(() => {
			onDismiss(toast.id);
		}, duration);

		return () => clearTimeout(timer);
	}, [toast, onDismiss]);

	return (
		<div
			className={cn(
				"pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-l-4 bg-white p-4 shadow-lg",
				borderColors[toast.type],
			)}
		>
			<div className="flex-shrink-0">{icons[toast.type]}</div>
			<div className="flex-1 min-w-0">
				<h4 className="text-sm font-semibold text-gray-900">{toast.title}</h4>
				{toast.message && (
					<p className="mt-1 text-sm text-gray-500">{toast.message}</p>
				)}
			</div>
			<button
				onClick={() => onDismiss(toast.id)}
				className="flex-shrink-0 rounded-md p-1 hover:bg-gray-100"
			>
				<X className="h-4 w-4 text-gray-400" />
			</button>
		</div>
	);
}

// Toast container
interface ToastContainerProps {
	toasts: Toast[];
	onDismiss: (id: string) => void;
	position?:
		| "top-right"
		| "top-left"
		| "bottom-right"
		| "bottom-left"
		| "top-center"
		| "bottom-center";
}

function ToastContainer({
	toasts,
	onDismiss,
	position = "top-right",
}: ToastContainerProps) {
	const positionClasses = {
		"top-right": "top-4 right-4",
		"top-left": "top-4 left-4",
		"bottom-right": "bottom-4 right-4",
		"bottom-left": "bottom-4 left-4",
		"top-center": "top-4 left-1/2 -translate-x-1/2",
		"bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
	};

	if (toasts.length === 0) return null;

	return (
		<div
			className={cn(
				"fixed z-50 flex flex-col gap-2",
				positionClasses[position],
			)}
		>
			{toasts.map((toast) => (
				<ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
			))}
		</div>
	);
}

// Toast context and hook
interface ToastContextType {
	toasts: Toast[];
	addToast: (toast: Omit<Toast, "id">) => void;
	removeToast: (id: string) => void;
	removeAll: () => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(
	undefined,
);

export function ToastProvider({ children }: { children: React.ReactNode }) {
	const [toasts, setToasts] = React.useState<Toast[]>([]);

	const addToast = React.useCallback((toast: Omit<Toast, "id">) => {
		const id = Math.random().toString(36).substring(2, 9);
		setToasts((prev) => [...prev, { ...toast, id }]);
	}, []);

	const removeToast = React.useCallback((id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	const removeAll = React.useCallback(() => {
		setToasts([]);
	}, []);

	return (
		<ToastContext.Provider value={{ toasts, addToast, removeToast, removeAll }}>
			{children}
			<ToastContainer toasts={toasts} onDismiss={removeToast} />
		</ToastContext.Provider>
	);
}

export function useToast() {
	const context = React.useContext(ToastContext);
	if (context === undefined) {
		throw new Error("useToast must be used within a ToastProvider");
	}

	const { addToast } = context;

	// Helper methods for common toast types
	const toast = {
		success: (title: string, message?: string, duration?: number) => {
			addToast({ type: "success", title, message, duration });
		},
		error: (title: string, message?: string, duration?: number) => {
			addToast({ type: "error", title, message, duration });
		},
		warning: (title: string, message?: string, duration?: number) => {
			addToast({ type: "warning", title, message, duration });
		},
		info: (title: string, message?: string, duration?: number) => {
			addToast({ type: "info", title, message, duration });
		},
	};

	return {
		...context,
		toast,
	};
}

// Simple toast hook for non-context usage (shows console in dev)
export function useSimpleToast() {
	const toast = {
		success: (title: string, message?: string) => {
			console.log(`✅ ${title}`, message);
		},
		error: (title: string, message?: string) => {
			console.error(`❌ ${title}`, message);
		},
		warning: (title: string, message?: string) => {
			console.warn(`⚠️ ${title}`, message);
		},
		info: (title: string, message?: string) => {
			console.info(`ℹ️ ${title}`, message);
		},
	};

	return { toast };
}

export { ToastContainer, ToastItem };
