import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that are accessible without authentication
const PUBLIC_ROUTES = ['/login', '/register'];

// Routes that should skip middleware entirely (Next.js internals, static assets)
const SKIP_PREFIXES = ['/_next', '/api', '/favicon', '/manifest', '/icons', '/sw.js', '/workbox'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip Next.js internal routes and static assets
  if (SKIP_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Read the persisted Zustand auth store from the cookie
  // Zustand persist stores to localStorage which isn't readable server-side,
  // but we also write the token to a cookie in the login flow for middleware use.
  const token =
    request.cookies.get('wa_token')?.value ||
    request.cookies.get('wa_auth')?.value;   // fallback: check zustand persist cookie

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  // Redirect unauthenticated users away from protected routes
  if (!isPublicRoute && !token && pathname !== '/') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from login page
  if (isPublicRoute && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (browser icon)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
