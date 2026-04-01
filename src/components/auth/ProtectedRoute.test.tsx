// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { AuthContextValue } from "@/lib/auth";
import { ProtectedRoute } from "./ProtectedRoute";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockUseAuth = vi.fn<() => AuthContextValue>();
const mockUseRole = vi.fn<
	() => {
		hasRole: (role: "Administrator" | "Executive Officer" | "General Officer" | "Member") => boolean;
		isAuthenticated: boolean;
	}
>();

vi.mock("@/hooks/useAuth", () => ({
	useAuth: () => mockUseAuth(),
}));

vi.mock("@/hooks/useRole", () => ({
	useRole: () => mockUseRole(),
}));

vi.mock("@tanstack/react-router", () => ({
	Navigate: ({ to }: { to: string }) => <div>{`redirect:${to}`}</div>,
}));

function createAuthValue(
	overrides: Partial<AuthContextValue> = {},
): AuthContextValue {
	return {
		user: null,
		logtoUser: null,
		authContext: null,
		isAuthenticated: false,
		isLoading: false,
		error: null,
		hasRole: () => false,
		hasPermission: () => false,
		getFreshAuthContext: async () => null,
		forceRefreshAuthContext: async () => {},
		...overrides,
	};
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("ProtectedRoute", () => {
	it("renders a loading state while auth is resolving", () => {
		mockUseAuth.mockReturnValue(createAuthValue({ isLoading: true }));
		mockUseRole.mockReturnValue({
			hasRole: () => false,
			isAuthenticated: false,
		});

		render(
			<ProtectedRoute>
				<div>Secret content</div>
			</ProtectedRoute>,
		);

		expect(screen.getByText("Loading...")).toBeTruthy();
	});

	it("redirects unauthenticated users to login", () => {
		mockUseAuth.mockReturnValue(createAuthValue());
		mockUseRole.mockReturnValue({
			hasRole: () => false,
			isAuthenticated: false,
		});

		render(
			<ProtectedRoute>
				<div>Secret content</div>
			</ProtectedRoute>,
		);

		expect(screen.getByText("redirect:/login")).toBeTruthy();
	});

	it("shows an access denied message when the user lacks the required role", () => {
		mockUseAuth.mockReturnValue(
			createAuthValue({
				isAuthenticated: true,
				user: {
					_id: "user-1",
					logtoUserId: "logto-user-1",
					name: "Member User",
					email: "member@example.com",
					orgId: "org-a",
					role: "Member",
					createdAt: Date.now(),
					scopes: [],
				},
			}),
		);
		mockUseRole.mockReturnValue({
			hasRole: () => false,
			isAuthenticated: true,
		});

		render(
			<ProtectedRoute requiredRole="General Officer">
				<div>Secret content</div>
			</ProtectedRoute>,
		);

		expect(screen.getByText("Access Denied")).toBeTruthy();
		expect(
			screen.getAllByText((_, node) =>
				node?.textContent?.includes("General Officer privileges.") ?? false,
			).length,
		).toBeGreaterThan(0);
	});

	it("renders protected children when the user is authorized", () => {
		mockUseAuth.mockReturnValue(
			createAuthValue({
				isAuthenticated: true,
				authContext: {
					userId: "user-1",
					logtoUserId: "logto-user-1",
					orgId: "org-a",
					role: "Administrator",
					timestamp: Date.now(),
				},
				user: {
					_id: "user-1",
					logtoUserId: "logto-user-1",
					name: "Alice Admin",
					email: "alice@example.com",
					orgId: "org-a",
					role: "Administrator",
					createdAt: Date.now(),
					scopes: ["inventory:view"],
				},
			}),
		);
		mockUseRole.mockReturnValue({
			hasRole: () => true,
			isAuthenticated: true,
		});

		render(
			<ProtectedRoute requiredRole="General Officer">
				<div>Secret content</div>
			</ProtectedRoute>,
		);

		expect(screen.getByText("Secret content")).toBeTruthy();
	});
});
