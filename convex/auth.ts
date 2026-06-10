import { betterAuth } from "better-auth/minimal";
import {
  createClient,
  type AuthFunctions,
  type GenericCtx,
} from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import authConfig from "./auth.config";
import { components, internal } from "./_generated/api";
import { query } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import { newProfileDefaults } from "./lib/defaults";

const siteUrl = process.env.SITE_URL!;

// Annotating with AuthFunctions breaks the type cycle between authComponent and
// the trigger functions it references.
const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      // Seed a "Default" learning profile for every new user — mirrors the old
      // Better Auth `databaseHooks.user.create.after` in src/server/auth.ts.
      onCreate: async (ctx, user) => {
        await ctx.db.insert("learningProfiles", {
          user_id: user._id,
          name: "Default",
          is_default: true,
          ...newProfileDefaults(),
        });
      },
    },
  },
});

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_AUTH_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_AUTH_CLIENT_SECRET!,
      },
    },
    plugins: [convex({ authConfig })],
  });

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => authComponent.safeGetAuthUser(ctx),
});
