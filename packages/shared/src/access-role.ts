/** What an API key or a connected app may do, weakest first. */
export const ACCESS_ROLES = ["viewer", "editor", "admin"] as const;

export type TAccessRole = (typeof ACCESS_ROLES)[number];

export const DEFAULT_ACCESS_ROLE: TAccessRole = "admin";

export function roleAllows(role: TAccessRole, required: TAccessRole): boolean {
  return ACCESS_ROLES.indexOf(role) >= ACCESS_ROLES.indexOf(required);
}
