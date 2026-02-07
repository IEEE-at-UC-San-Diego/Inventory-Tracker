import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/")({
	component: SettingsPage,
});

function SettingsPage() {
	return <Navigate to="/home" />;
}
