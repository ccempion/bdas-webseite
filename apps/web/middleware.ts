import { NextResponse, type NextRequest } from "next/server";

/** Plumbing only: expose the pathname to Server Components so the board sidebar
 *  can mark the active scope/item. Authorization lives in the (board) layouts,
 *  not here (Phase 3 design: local grants are in the DB, not the JWT).
 *
 *  IMPORTANT: the value must be set on the *request* headers (via
 *  NextResponse.next({ request: { headers } })) — `headers()` in a Server
 *  Component reads request headers, NOT the response headers. Setting
 *  res.headers would be invisible to the layout. */
export function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
