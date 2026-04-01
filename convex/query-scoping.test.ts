import { afterEach, describe, expect, it, vi } from "vitest";
import { getOrgStats } from "./organization_helpers";
import * as inventoryQueries from "./inventory/queries";
import * as partsQueries from "./parts/queries";
import * as transactionQueries from "./transactions/queries";

type OrgId = string;
type RecordDoc = Record<string, unknown> & { _id: string; _creationTime: number };

interface UserDoc extends RecordDoc {
	logtoUserId: string;
	name: string;
	email: string;
	orgId: OrgId;
	role:
		| "Administrator"
		| "Executive Officer"
		| "General Officer"
		| "Member";
	createdAt: number;
}

interface PartDoc extends RecordDoc {
	name: string;
	sku: string;
	category: string;
	description?: string;
	imageId?: string;
	archived: boolean;
	orgId: OrgId;
	unit: string;
	createdAt: number;
	updatedAt: number;
}

interface BlueprintDoc extends RecordDoc {
	name: string;
	orgId: OrgId;
	createdAt: number;
	updatedAt: number;
	lockedBy?: string;
	lockTimestamp?: number;
	backgroundImageId?: string;
}

interface DrawerDoc extends RecordDoc {
	blueprintId: string;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	zIndex: number;
	label?: string;
	createdAt: number;
	updatedAt: number;
}

interface CompartmentDoc extends RecordDoc {
	drawerId: string;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	zIndex: number;
	label?: string;
	createdAt: number;
	updatedAt: number;
}

interface InventoryDoc extends RecordDoc {
	partId: string;
	compartmentId: string;
	quantity: number;
	orgId: OrgId;
	createdAt: number;
	updatedAt: number;
}

interface TransactionDoc extends RecordDoc {
	actionType: "Add" | "Remove" | "Move" | "Adjust";
	quantityDelta: number;
	sourceCompartmentId?: string;
	destCompartmentId?: string;
	partId: string;
	userId: string;
	timestamp: number;
	notes?: string;
	orgId: OrgId;
}

interface OrganizationDoc extends RecordDoc {
	name: string;
	slug: string;
	createdAt: number;
}

interface Tables {
	users: UserDoc[];
	parts: PartDoc[];
	blueprints: BlueprintDoc[];
	drawers: DrawerDoc[];
	compartments: CompartmentDoc[];
	inventory: InventoryDoc[];
	transactions: TransactionDoc[];
	organizations: OrganizationDoc[];
}

type TableName = keyof Tables;
type QueryHandler<TArgs, TResult> = {
	_handler: (ctx: ReturnType<typeof createMockCtx>, args: TArgs) => Promise<TResult>;
};
type Constraint =
	| { op: "eq"; field: string; value: unknown }
	| { op: "lt"; field: string; value: number }
	| { op: "lte"; field: string; value: number }
	| { op: "gte"; field: string; value: number };

class RangeBuilder {
	constructor(private readonly constraints: Constraint[] = []) {}

	eq(field: string, value: unknown) {
		return new RangeBuilder([...this.constraints, { op: "eq", field, value }]);
	}

	lt(field: string, value: number) {
		return new RangeBuilder([...this.constraints, { op: "lt", field, value }]);
	}

	lte(field: string, value: number) {
		return new RangeBuilder([...this.constraints, { op: "lte", field, value }]);
	}

	gte(field: string, value: number) {
		return new RangeBuilder([...this.constraints, { op: "gte", field, value }]);
	}

	toConstraints() {
		return this.constraints;
	}
}

function applyConstraints<T extends Record<string, unknown>>(
	items: T[],
	constraints: Constraint[],
) {
	return items.filter((item) =>
		constraints.every((constraint) => {
			const value = item[constraint.field];
			if (constraint.op === "eq") return value === constraint.value;
			if (typeof value !== "number") return false;
			if (constraint.op === "lt") return value < constraint.value;
			if (constraint.op === "lte") return value <= constraint.value;
			return value >= constraint.value;
		}),
	);
}

function createQueryChain<T extends Record<string, unknown>>(items: T[]) {
	return {
		withIndex(
			_indexName: string,
			callback: (builder: RangeBuilder) => RangeBuilder,
		) {
			const constraints = callback(new RangeBuilder()).toConstraints();
			return createQueryChain(applyConstraints(items, constraints));
		},
		order(direction: "asc" | "desc") {
			const sorted = [...items].sort((left, right) => {
				const leftValue = Number(
					typeof left.timestamp === "number" ? left.timestamp : left._creationTime,
				);
				const rightValue = Number(
					typeof right.timestamp === "number" ? right.timestamp : right._creationTime,
				);
				return direction === "desc"
					? rightValue - leftValue
					: leftValue - rightValue;
			});
			return createQueryChain(sorted);
		},
		async collect() {
			return items;
		},
		async take(limit: number) {
			return items.slice(0, limit);
		},
		async first() {
			return items[0] ?? null;
		},
		async unique() {
			return items[0] ?? null;
		},
	};
}

function createMockCtx(tables: Tables) {
	const byId = new Map<string, RecordDoc>();

	for (const tableName of Object.keys(tables) as TableName[]) {
		for (const item of tables[tableName]) {
			byId.set(item._id, item);
		}
	}

	return {
		db: {
			get(id: string) {
				return Promise.resolve(byId.get(id) ?? null);
			},
			query(tableName: TableName) {
				return createQueryChain(
					tables[tableName] as Array<Record<string, unknown>>,
				);
			},
		},
	};
}

function getHandler<TArgs, TResult>(query: unknown) {
	return (query as QueryHandler<TArgs, TResult>)._handler;
}

const authContext = {
	userId: "user-a-admin",
	logtoUserId: "logto-user-a-admin",
	orgId: "org-a",
	role: "Administrator" as const,
	timestamp: Date.now(),
};

function createTables(): Tables {
	return {
		organizations: [
			{
				_id: "org-a",
				_creationTime: 1,
				name: "Org A",
				slug: "org-a",
				createdAt: 1,
			},
			{
				_id: "org-b",
				_creationTime: 2,
				name: "Org B",
				slug: "org-b",
				createdAt: 2,
			},
		],
		users: [
			{
				_id: "user-a-admin",
				_creationTime: 1,
				logtoUserId: "logto-user-a-admin",
				name: "Alice Admin",
				email: "alice@example.com",
				orgId: "org-a",
				role: "Administrator",
				createdAt: 1,
			},
			{
				_id: "user-b-admin",
				_creationTime: 2,
				logtoUserId: "logto-user-b-admin",
				name: "Bob Admin",
				email: "bob@example.com",
				orgId: "org-b",
				role: "Administrator",
				createdAt: 2,
			},
		],
		parts: [
			{
				_id: "part-a-active",
				_creationTime: 10,
				name: "Resistor 10k",
				sku: "A-10K",
				category: "Electronics",
				archived: false,
				orgId: "org-a",
				unit: "pcs",
				createdAt: 10,
				updatedAt: 10,
			},
			{
				_id: "part-a-archived",
				_creationTime: 11,
				name: "Legacy Capacitor",
				sku: "A-CAP",
				category: "Electronics",
				archived: true,
				orgId: "org-a",
				unit: "pcs",
				createdAt: 11,
				updatedAt: 11,
			},
			{
				_id: "part-b-active",
				_creationTime: 12,
				name: "Motor Driver",
				sku: "B-MDRV",
				category: "Electronics",
				archived: false,
				orgId: "org-b",
				unit: "pcs",
				createdAt: 12,
				updatedAt: 12,
			},
		],
		blueprints: [
			{
				_id: "blueprint-a",
				_creationTime: 20,
				name: "Cabinet A",
				orgId: "org-a",
				createdAt: 20,
				updatedAt: 20,
			},
			{
				_id: "blueprint-b",
				_creationTime: 21,
				name: "Cabinet B",
				orgId: "org-b",
				createdAt: 21,
				updatedAt: 21,
			},
		],
		drawers: [
			{
				_id: "drawer-a",
				_creationTime: 30,
				blueprintId: "blueprint-a",
				x: 0,
				y: 0,
				width: 10,
				height: 10,
				rotation: 0,
				zIndex: 1,
				label: "Drawer A",
				createdAt: 30,
				updatedAt: 30,
			},
			{
				_id: "drawer-b",
				_creationTime: 31,
				blueprintId: "blueprint-b",
				x: 0,
				y: 0,
				width: 10,
				height: 10,
				rotation: 0,
				zIndex: 1,
				label: "Drawer B",
				createdAt: 31,
				updatedAt: 31,
			},
		],
		compartments: [
			{
				_id: "compartment-a",
				_creationTime: 40,
				drawerId: "drawer-a",
				x: 0,
				y: 0,
				width: 10,
				height: 10,
				rotation: 0,
				zIndex: 1,
				label: "A1",
				createdAt: 40,
				updatedAt: 40,
			},
			{
				_id: "compartment-b",
				_creationTime: 41,
				drawerId: "drawer-b",
				x: 0,
				y: 0,
				width: 10,
				height: 10,
				rotation: 0,
				zIndex: 1,
				label: "B1",
				createdAt: 41,
				updatedAt: 41,
			},
		],
		inventory: [
			{
				_id: "inventory-a-1",
				_creationTime: 50,
				partId: "part-a-active",
				compartmentId: "compartment-a",
				quantity: 8,
				orgId: "org-a",
				createdAt: 50,
				updatedAt: 50,
			},
			{
				_id: "inventory-a-2",
				_creationTime: 51,
				partId: "part-a-archived",
				compartmentId: "compartment-a",
				quantity: 2,
				orgId: "org-a",
				createdAt: 51,
				updatedAt: 51,
			},
			{
				_id: "inventory-b-1",
				_creationTime: 52,
				partId: "part-b-active",
				compartmentId: "compartment-b",
				quantity: 99,
				orgId: "org-b",
				createdAt: 52,
				updatedAt: 52,
			},
		],
		transactions: [
			{
				_id: "transaction-a-today",
				_creationTime: 60,
				actionType: "Add",
				quantityDelta: 5,
				partId: "part-a-active",
				userId: "user-a-admin",
				timestamp: Date.now() - 1_000,
				orgId: "org-a",
			},
			{
				_id: "transaction-a-week",
				_creationTime: 61,
				actionType: "Move",
				quantityDelta: 1,
				partId: "part-a-active",
				userId: "user-a-admin",
				timestamp: Date.now() - 86_400_000 * 3,
				orgId: "org-a",
			},
			{
				_id: "transaction-b-today",
				_creationTime: 62,
				actionType: "Remove",
				quantityDelta: -3,
				partId: "part-b-active",
				userId: "user-b-admin",
				timestamp: Date.now() - 2_000,
				orgId: "org-b",
			},
		],
	};
}

describe("org scoped Convex query handlers", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("scopes organization stats to the authenticated org", async () => {
		const ctx = createMockCtx(createTables());

		const result = await getHandler<
			{ authContext: typeof authContext },
			{
				totalParts: number;
				totalBlueprints: number;
				totalInventory: number;
				totalTransactions: number;
			}
		>(getOrgStats)(ctx, { authContext });

		expect(result).toEqual({
			totalParts: 2,
			totalBlueprints: 1,
			totalInventory: 10,
			totalTransactions: 2,
		});
	});

	it("scopes parts list and search results to the authenticated org", async () => {
		const ctx = createMockCtx(createTables());

		const listed = await getHandler<
			{ authContext: typeof authContext; includeArchived: boolean },
			Array<{ _id: string }>
		>(partsQueries.list)(ctx, {
			authContext,
			includeArchived: false,
		});
		const searched = await getHandler<
			{ authContext: typeof authContext; query: string; limit: number },
			{ items: Array<{ _id: string }>; nextCursor: string | null; hasMore: boolean }
		>(partsQueries.search)(ctx, {
			authContext,
			query: "motor",
			limit: 20,
		});

		expect(listed.map((part: { _id: string }) => part._id)).toEqual(["part-a-active"]);
		expect(searched.items).toHaveLength(0);
	});

	it("scopes inventory list and per-part inventory to the authenticated org", async () => {
		const ctx = createMockCtx(createTables());

		const listed = await getHandler<
			{ authContext: typeof authContext; includeDetails: boolean },
			Array<{ _id: string }>
		>(inventoryQueries.list)(ctx, {
			authContext,
			includeDetails: false,
		});
		const byPart = await getHandler<
			{ authContext: typeof authContext; partId: string },
			Array<{ _id: string }>
		>(inventoryQueries.getByPart)(ctx, {
			authContext,
			partId: "part-a-active",
		});

		expect(listed.map((item: { _id: string }) => item._id)).toEqual([
			"inventory-a-1",
			"inventory-a-2",
		]);
		expect(byPart.map((item: { _id: string }) => item._id)).toEqual([
			"inventory-a-1",
		]);
	});

	it("scopes transactions list and reports per-type counts for today only", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-01T16:00:00.000Z"));

		const ctx = createMockCtx(createTables());

		const listed = await getHandler<
			{ authContext: typeof authContext; limit: number },
			{ items: Array<{ _id: string }>; nextCursor: string | null; hasMore: boolean }
		>(transactionQueries.list)(ctx, {
			authContext,
			limit: 10,
		});
		const stats = await getHandler<
			{ authContext: typeof authContext },
			{
				transactionsToday: number;
				transactionsThisWeek: number;
				transactionsByType: Record<string, number>;
			}
		>(transactionQueries.getStats)(ctx, {
			authContext,
		});

		expect(
			listed.items.map((transaction: { _id: string }) => transaction._id),
		).toEqual([
			"transaction-a-today",
			"transaction-a-week",
		]);
		expect(stats.transactionsToday).toBe(1);
		expect(stats.transactionsByType).toEqual({
			Add: 1,
			Remove: 0,
			Move: 0,
			Adjust: 0,
		});
	});
});
