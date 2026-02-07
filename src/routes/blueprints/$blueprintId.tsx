import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { BlueprintEditorContent } from "./blueprint-editor/-BlueprintEditorContent";

export const Route = createFileRoute("/blueprints/$blueprintId")({
	component: BlueprintEditorPage,
	validateSearch: (search: Record<string, unknown>) => ({
		partId: typeof search.partId === "string" ? search.partId : undefined,
		mode:
			search.mode === "edit" || search.mode === "view"
				? search.mode
				: undefined,
	}),
});

export type { HistoryState } from "@/lib/history";

function FullScreenPortal({ children }: { children: React.ReactNode }) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) return null;
	return createPortal(children, document.body);
}

function BlueprintEditorPage() {
	return (
		<ProtectedRoute>
			<FullScreenPortal>
				<BlueprintEditorContent />
			</FullScreenPortal>
		</ProtectedRoute>
	);
}
