import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Home, PackageX, Search } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";

export const Route = createFileRoute("/404")({
	component: NotFoundPage,
});

function NotFoundPage() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-surface px-6 py-12">
			<Card className="max-w-lg w-full">
				<CardContent className="p-8 text-center">
					{/* Icon */}
					<div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-border bg-surface-subtle">
						<PackageX className="h-10 w-10 text-muted-foreground" />
					</div>

					{/* Title */}
					<h1 className="mb-2 text-4xl font-bold text-foreground">404</h1>
					<h2 className="mb-4 text-xl font-semibold text-foreground/80">
						Page Not Found
					</h2>

					{/* Description */}
					<p className="mb-8 text-muted-foreground">
						The page you're looking for doesn't exist or has been moved. Check
						the URL or try navigating back to a known page.
					</p>

					{/* Action buttons */}
					<div className="flex flex-col sm:flex-row gap-3 justify-center">
						<Link
							to="/home"
							className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
						>
							<Home className="w-4 h-4" />
							Go to Dashboard
						</Link>
						<button
							type="button"
							onClick={() => window.history.back()}
							className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-elevated px-4 py-2 transition-colors hover:bg-accent"
						>
							<ArrowLeft className="w-4 h-4" />
							Go Back
						</button>
					</div>

					{/* Helpful links */}
					<div className="mt-8 border-t border-border pt-6">
						<p className="mb-4 text-sm text-muted-foreground">Popular destinations:</p>
						<div className="flex flex-wrap justify-center gap-2">
							<QuickLink
								to="/parts"
								icon={<Search className="w-3 h-3" />}
								label="Inventory"
							/>
							<QuickLink
								to="/blueprints"
								icon={<Search className="w-3 h-3" />}
								label="Blueprints"
							/>
							<QuickLink
								to="/transactions"
								icon={<Search className="w-3 h-3" />}
								label="Transactions"
							/>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function QuickLink({
	to,
	icon,
	label,
}: {
	to: string;
	icon: React.ReactNode;
	label: string;
}) {
	return (
		<Link
			to={to}
			className="inline-flex items-center gap-1 rounded-full bg-surface-brand px-3 py-1.5 text-sm text-primary transition-colors hover:bg-accent"
		>
			{icon}
			{label}
		</Link>
	);
}
