/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as auth_helpers from "../auth_helpers.js";
import type * as auth_role_utils from "../auth_role_utils.js";
import type * as blueprint_revisions_mutations from "../blueprint_revisions/mutations.js";
import type * as blueprint_revisions_queries from "../blueprint_revisions/queries.js";
import type * as blueprints_mutations from "../blueprints/mutations.js";
import type * as blueprints_queries from "../blueprints/queries.js";
import type * as compartments_mutations from "../compartments/mutations.js";
import type * as compartments_queries from "../compartments/queries.js";
import type * as crons from "../crons.js";
import type * as dividers_mutations from "../dividers/mutations.js";
import type * as dividers_queries from "../dividers/queries.js";
import type * as drawer_background_images_mutations from "../drawer_background_images/mutations.js";
import type * as drawers_mutations from "../drawers/mutations.js";
import type * as drawers_queries from "../drawers/queries.js";
import type * as http from "../http.js";
import type * as inventory_mutations from "../inventory/mutations.js";
import type * as inventory_queries from "../inventory/queries.js";
import type * as organization_helpers from "../organization_helpers.js";
import type * as organizations_mutations from "../organizations/mutations.js";
import type * as organizations_queries from "../organizations/queries.js";
import type * as parts_mutations from "../parts/mutations.js";
import type * as parts_queries from "../parts/queries.js";
import type * as permissions from "../permissions.js";
import type * as role_sync_queue_mutations from "../role_sync_queue/mutations.js";
import type * as role_sync_queue_queries from "../role_sync_queue/queries.js";
import type * as seed from "../seed.js";
import type * as storage from "../storage.js";
import type * as transactions_queries from "../transactions/queries.js";
import type * as types_auth from "../types/auth.js";
import type * as users_queries from "../users/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  auth_helpers: typeof auth_helpers;
  auth_role_utils: typeof auth_role_utils;
  "blueprint_revisions/mutations": typeof blueprint_revisions_mutations;
  "blueprint_revisions/queries": typeof blueprint_revisions_queries;
  "blueprints/mutations": typeof blueprints_mutations;
  "blueprints/queries": typeof blueprints_queries;
  "compartments/mutations": typeof compartments_mutations;
  "compartments/queries": typeof compartments_queries;
  crons: typeof crons;
  "dividers/mutations": typeof dividers_mutations;
  "dividers/queries": typeof dividers_queries;
  "drawer_background_images/mutations": typeof drawer_background_images_mutations;
  "drawers/mutations": typeof drawers_mutations;
  "drawers/queries": typeof drawers_queries;
  http: typeof http;
  "inventory/mutations": typeof inventory_mutations;
  "inventory/queries": typeof inventory_queries;
  organization_helpers: typeof organization_helpers;
  "organizations/mutations": typeof organizations_mutations;
  "organizations/queries": typeof organizations_queries;
  "parts/mutations": typeof parts_mutations;
  "parts/queries": typeof parts_queries;
  permissions: typeof permissions;
  "role_sync_queue/mutations": typeof role_sync_queue_mutations;
  "role_sync_queue/queries": typeof role_sync_queue_queries;
  seed: typeof seed;
  storage: typeof storage;
  "transactions/queries": typeof transactions_queries;
  "types/auth": typeof types_auth;
  "users/queries": typeof users_queries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
