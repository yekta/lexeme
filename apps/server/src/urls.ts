import { env } from "./env.ts";

/** This API's public origin: the OAuth issuer and the host of `/mcp`. */
export const ISSUER = env.BETTER_AUTH_URL.replace(/\/+$/, "");
export const MCP_RESOURCE = `${ISSUER}/mcp`;
export const RESOURCE_METADATA_URL = `${ISSUER}/.well-known/oauth-protected-resource/mcp`;
export const CONSENT_PAGE_URL = `${env.WEB_ORIGIN.replace(/\/+$/, "")}/oauth/consent`;
