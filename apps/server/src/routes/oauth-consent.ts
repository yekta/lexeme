import {
  oauthApproveRequest,
  oauthAuthorizeParams,
  oauthDenyRequest,
} from "@lexeme/contracts";
import { Hono } from "hono";

import { ApiError } from "../errors.ts";
import { parseBody, requireUserId } from "../http.ts";
import {
  checkAuthorizeRequest,
  errorRedirect,
  issueAuthorizationCode,
} from "../oauth/authorize.ts";
import type { TOAuthAuthorizeParams } from "@lexeme/contracts";

async function mustBeValid(params: TOAuthAuthorizeParams) {
  const check = await checkAuthorizeRequest(params);
  if (!check.ok) throw new ApiError("BAD_REQUEST", check.description);
  return check;
}

/** What the web app's consent page calls, with the user's session. */
export const oauthConsentRoutes = new Hono()
  .get("/", async (c) => {
    await requireUserId(c);
    const params = oauthAuthorizeParams.safeParse(c.req.query());
    if (!params.success) throw new ApiError("BAD_REQUEST", "This sign-in link is incomplete.");
    const check = await mustBeValid(params.data);
    return c.json({
      client_name: check.client.name,
      redirect_host: new URL(check.redirectUri).host || check.redirectUri,
    });
  })
  .post("/approve", async (c) => {
    const userId = await requireUserId(c);
    const input = await parseBody(c, oauthApproveRequest);
    const check = await mustBeValid(input.params);
    const redirectUrl = await issueAuthorizationCode({ check, userId, role: input.role });
    return c.json({ redirect_url: redirectUrl });
  })
  .post("/deny", async (c) => {
    await requireUserId(c);
    const input = await parseBody(c, oauthDenyRequest);
    const check = await mustBeValid(input.params);
    return c.json({
      redirect_url: errorRedirect(
        check.redirectUri,
        "access_denied",
        "The user denied access.",
        input.params.state,
      ),
    });
  });
