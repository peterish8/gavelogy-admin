/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as adminMutations from "../adminMutations.js";
import type * as adminQueries from "../adminQueries.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as authHelpers from "../authHelpers.js";
import type * as caseNotes from "../caseNotes.js";
import type * as content from "../content.js";
import type * as game from "../game.js";
import type * as http from "../http.js";
import type * as mcpAdmin from "../mcpAdmin.js";
import type * as mistakes from "../mistakes.js";
import type * as payments from "../payments.js";
import type * as pyq from "../pyq.js";
import type * as quiz from "../quiz.js";
import type * as quizzes from "../quizzes.js";
import type * as sessions from "../sessions.js";
import type * as spacedRepetition from "../spacedRepetition.js";
import type * as storage from "../storage.js";
import type * as streaks from "../streaks.js";
import type * as temp from "../temp.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  adminMutations: typeof adminMutations;
  adminQueries: typeof adminQueries;
  analytics: typeof analytics;
  auth: typeof auth;
  authHelpers: typeof authHelpers;
  caseNotes: typeof caseNotes;
  content: typeof content;
  game: typeof game;
  http: typeof http;
  mcpAdmin: typeof mcpAdmin;
  mistakes: typeof mistakes;
  payments: typeof payments;
  pyq: typeof pyq;
  quiz: typeof quiz;
  quizzes: typeof quizzes;
  sessions: typeof sessions;
  spacedRepetition: typeof spacedRepetition;
  storage: typeof storage;
  streaks: typeof streaks;
  temp: typeof temp;
  users: typeof users;
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
