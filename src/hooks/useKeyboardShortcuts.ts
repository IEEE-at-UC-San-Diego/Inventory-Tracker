import { useCallback, useEffect } from "react";

interface ShortcutConfig {
	key: string;
	modifier?: "ctrl" | "meta" | "alt" | "shift";
	handler: () => void;
	preventDefault?: boolean;
}

export function useKeyboardShortcut(config: ShortcutConfig) {
	const { key, modifier, handler, preventDefault = true } = config;

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			const keyMatches = e.key.toLowerCase() === key.toLowerCase();

			let modifierMatches = true;
			if (modifier) {
				switch (modifier) {
					case "ctrl":
						modifierMatches = e.ctrlKey;
						break;
					case "meta":
						modifierMatches = e.metaKey;
						break;
					case "alt":
						modifierMatches = e.altKey;
						break;
					case "shift":
						modifierMatches = e.shiftKey;
						break;
				}
			}

			if (keyMatches && modifierMatches) {
				if (preventDefault) {
					e.preventDefault();
				}
				handler();
			}
		},
		[key, modifier, handler, preventDefault],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);
}

// Common shortcuts hook for the app
export function useAppShortcuts() {
	// Global shortcuts
	useKeyboardShortcut({
		key: "k",
		modifier: "meta",
		handler: () => {
			// Search shortcut - handled by SearchBar component
		},
	});

	useKeyboardShortcut({
		key: "Escape",
		handler: () => {
			// Close modals, clear selections
			document.dispatchEvent(new CustomEvent("app:escape"));
		},
	});
}

// Navigation shortcuts
export function useNavigationShortcuts(navigationHandlers: {
	onParts?: () => void;
	onBlueprints?: () => void;
	onInventory?: () => void;
	onDashboard?: () => void;
}) {
	useKeyboardShortcut({
		key: "1",
		modifier: "alt",
		handler: () => navigationHandlers.onDashboard?.(),
	});

	useKeyboardShortcut({
		key: "2",
		modifier: "alt",
		handler: () => navigationHandlers.onParts?.(),
	});

	useKeyboardShortcut({
		key: "3",
		modifier: "alt",
		handler: () => navigationHandlers.onInventory?.(),
	});

	useKeyboardShortcut({
		key: "4",
		modifier: "alt",
		handler: () => navigationHandlers.onBlueprints?.(),
	});
}

// Form shortcuts
export function useFormShortcuts(handlers: {
	onSubmit?: () => void;
	onCancel?: () => void;
	onSave?: () => void;
}) {
	useKeyboardShortcut({
		key: "Enter",
		modifier: "meta",
		handler: () => handlers.onSubmit?.(),
	});

	useKeyboardShortcut({
		key: "s",
		modifier: "meta",
		handler: () => handlers.onSave?.(),
	});

	useKeyboardShortcut({
		key: "Escape",
		handler: () => handlers.onCancel?.(),
	});
}

// Inventory operation shortcuts
export function useInventoryShortcuts(handlers: {
	onCheckIn?: () => void;
	onCheckOut?: () => void;
	onMove?: () => void;
}) {
	useKeyboardShortcut({
		key: "i",
		handler: () => handlers.onCheckIn?.(),
	});

	useKeyboardShortcut({
		key: "o",
		handler: () => handlers.onCheckOut?.(),
	});

	useKeyboardShortcut({
		key: "m",
		handler: () => handlers.onMove?.(),
	});
}
