/**
 * Server-only half of the business filter — split from lib/business-filter.ts
 * because that module is also imported by the client-side switcher component,
 * and `next/headers` can't be pulled into a client bundle.
 */
import { cookies } from 'next/headers';
import { BUSINESS_FILTER_COOKIE } from '@/lib/business-filter';

/**
 * The cookie's raw value for the current request, or null when there isn't
 * one — including when called outside a real request scope (e.g. a test
 * harness invoking a page component directly). Server components should
 * call this instead of `cookies()` directly.
 */
export async function readBusinessFilterCookie(): Promise<string | null> {
  try {
    return (await cookies()).get(BUSINESS_FILTER_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}
