const PUBLIC_ROUTES = new Set(["/login", "/auth/callback"]);

/** Returns the route an authentication check should redirect to, if any. */
export function getAuthRedirect(
  pathname: string,
  isAuthenticated: boolean,
): string | null {
  const isPublicRoute = PUBLIC_ROUTES.has(pathname);

  if (!isAuthenticated && !isPublicRoute) {
    return "/login";
  }

  if (isAuthenticated && pathname === "/login") {
    return "/";
  }

  return null;
}
