import {
	Maximize2,
	Move,
	PenLine,
	Plus,
	Redo2,
	Trash2,
	Undo2,
} from "lucide-react";
import { memo, useCallback, useEffect, useRef } from "react";
import type { Drawer, DrawerWithCompartments } from "@/types";

export interface ContextMenuState {
	x: number;
	y: number;
	worldX: number;
	worldY: number;
	drawer: DrawerWithCompartments | null;
}

interface EditorContextMenuProps {
	state: ContextMenuState | null;
	isLockedByMe: boolean;
	onClose: () => void;
	onMoveDrawer?: (drawer: Drawer) => void;
	onRenameDrawer?: (drawer: Drawer) => void;
	onResizeDrawer?: (drawer: Drawer) => void;
	onDeleteDrawer?: (drawer: Drawer) => void;
	onAddDrawerHere?: (worldX: number, worldY: number) => void;
	onUndo?: () => void;
	onRedo?: () => void;
	canUndo?: boolean;
	canRedo?: boolean;
}

export const EditorContextMenu = memo(function EditorContextMenu({
	state,
	isLockedByMe,
	onClose,
	onMoveDrawer,
	onRenameDrawer,
	onResizeDrawer,
	onDeleteDrawer,
	onAddDrawerHere,
	onUndo,
	onRedo,
	canUndo = false,
	canRedo = false,
}: EditorContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);

	// Close on click outside or Escape
	useEffect(() => {
		if (!state) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};

		// Delay to avoid the same right-click closing the menu
		const timer = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
			document.addEventListener("keydown", handleKeyDown);
		}, 0);

		return () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [state, onClose]);

	// Adjust position to keep menu in viewport
	useEffect(() => {
		if (!state || !menuRef.current) return;
		const rect = menuRef.current.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		let x = state.x;
		let y = state.y;

		if (x + rect.width > vw) x = vw - rect.width - 8;
		if (y + rect.height > vh) y = vh - rect.height - 8;
		if (x < 0) x = 8;
		if (y < 0) y = 8;

		if (x !== state.x || y !== state.y) {
			menuRef.current.style.left = `${x}px`;
			menuRef.current.style.top = `${y}px`;
		}
	}, [state]);

	const handleAction = useCallback(
		(action: () => void) => {
			action();
			onClose();
		},
		[onClose],
	);

	if (!state) return null;

	const drawer = state.drawer;

	return (
		<div
			ref={menuRef}
			className="fixed z-100 min-w-45 rounded-lg border border-gray-200 bg-white shadow-xl py-1 animate-in fade-in-0 zoom-in-95"
			style={{ left: state.x, top: state.y }}
		>
			{drawer && isLockedByMe && (
				<>
					<div className="px-3 py-1.5 text-xs font-medium text-gray-500 border-b border-gray-100 mb-1">
						{drawer.label || `Drawer #${drawer._id.slice(-4)}`}
					</div>
					<ContextMenuItem
						icon={<Move className="w-3.5 h-3.5" />}
						label="Move"
						onClick={() =>
							handleAction(() => onMoveDrawer?.(drawer))
						}
					/>
					<ContextMenuItem
						icon={<PenLine className="w-3.5 h-3.5" />}
						label="Rename"
						onClick={() =>
							handleAction(() => onRenameDrawer?.(drawer))
						}
					/>
					<ContextMenuItem
						icon={<Maximize2 className="w-3.5 h-3.5" />}
						label="Resize"
						onClick={() =>
							handleAction(() => onResizeDrawer?.(drawer))
						}
					/>
					<div className="h-px bg-gray-100 my-1" />
					<ContextMenuItem
						icon={<Trash2 className="w-3.5 h-3.5" />}
						label="Delete Drawer"
						onClick={() =>
							handleAction(() => onDeleteDrawer?.(drawer))
						}
						variant="destructive"
					/>
					<div className="h-px bg-gray-100 my-1" />
				</>
			)}

			{!drawer && isLockedByMe && (
				<>
					<ContextMenuItem
						icon={<Plus className="w-3.5 h-3.5" />}
						label="Add Drawer Here"
						onClick={() =>
							handleAction(() =>
								onAddDrawerHere?.(state.worldX, state.worldY),
							)
						}
					/>
					<div className="h-px bg-gray-100 my-1" />
				</>
			)}

			<ContextMenuItem
				icon={<Undo2 className="w-3.5 h-3.5" />}
				label="Undo"
				shortcut="⌘Z"
				onClick={() => handleAction(() => onUndo?.())}
				disabled={!canUndo || !isLockedByMe}
			/>
			<ContextMenuItem
				icon={<Redo2 className="w-3.5 h-3.5" />}
				label="Redo"
				shortcut="⌘⇧Z"
				onClick={() => handleAction(() => onRedo?.())}
				disabled={!canRedo || !isLockedByMe}
			/>
		</div>
	);
});

interface ContextMenuItemProps {
	icon: React.ReactNode;
	label: string;
	shortcut?: string;
	onClick: () => void;
	disabled?: boolean;
	variant?: "default" | "destructive";
}

function ContextMenuItem({
	icon,
	label,
	shortcut,
	onClick,
	disabled = false,
	variant = "default",
}: ContextMenuItemProps) {
	return (
		<button
			type="button"
			className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
				disabled
					? "text-gray-300 cursor-not-allowed"
					: variant === "destructive"
						? "text-red-600 hover:bg-red-50"
						: "text-gray-700 hover:bg-gray-100"
			}`}
			onClick={disabled ? undefined : onClick}
			disabled={disabled}
		>
			{icon}
			<span className="flex-1 text-left">{label}</span>
			{shortcut && (
				<span className="text-xs text-gray-400 ml-4">{shortcut}</span>
			)}
		</button>
	);
}
