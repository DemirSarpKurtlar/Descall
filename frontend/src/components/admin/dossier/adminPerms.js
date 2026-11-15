/**
 * What the signed-in admin may open (AdminPanel provides it from
 * GET /admin/me/permissions) and how the user file jumps to another admin page.
 * Outside AdminPanel every section reads as allowed; the server checks anyway.
 */
import { createContext, useContext } from "react";

const ALLOW_ALL = Object.freeze({ can: () => true, owner: false, navigate: null });

export const AdminPermsContext = createContext(ALLOW_ALL);

export function useAdminPerms() {
  return useContext(AdminPermsContext) || ALLOW_ALL;
}
