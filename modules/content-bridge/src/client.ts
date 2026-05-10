/**
 * Thin HTTP client for the WordPress REST API.
 *
 * - Uses Next 14's `fetch` cache (`revalidate: 3600`) when running under Next.
 * - Falls back to plain fetch when the cache options are ignored (Vitest, scripts).
 * - Never throws on transport failures — returns null and lets services degrade.
 *
 * The client is configured at composition time via `setWpClient`. Tests inject
 * a fake fetcher; apps inject the real WordPress base URL from env.
 */

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type WpClientOptions = {
  /** e.g. https://bdas.de */
  readonly baseUrl: string;
  readonly fetcher?: Fetcher;
  /** Default `revalidate` window in seconds. */
  readonly revalidateSeconds?: number;
};

const DEFAULT_REVALIDATE = 3600;

export class WpClient {
  private readonly baseUrl: string;
  private readonly fetcher: Fetcher;
  private readonly revalidate: number;

  constructor(opts: WpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.fetcher = opts.fetcher ?? fetch;
    this.revalidate = opts.revalidateSeconds ?? DEFAULT_REVALIDATE;
  }

  /**
   * Fetch JSON from a relative path under `${baseUrl}/wp-json`.
   * Returns null on any non-2xx response, network error, or JSON parse error.
   * Callers must treat null as "WP unavailable, degrade gracefully".
   */
  async json<T>(path: string): Promise<T | null> {
    const url = `${this.baseUrl}/wp-json${path}`;
    let res: Response;
    try {
      res = await this.fetcher(url, {
        // The Next runtime understands this; plain Node fetch ignores it.
        next: { revalidate: this.revalidate },
        headers: { Accept: "application/json" },
      } as RequestInit & { next: { revalidate: number } });
    } catch {
      return null;
    }
    if (!res.ok) return null;
    try {
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }
}

let _client: WpClient | null = null;

/**
 * Lazily resolved at first call. In production `WORDPRESS_REST_BASE_URL`
 * provides the base; in tests `setWpClient` overrides explicitly.
 */
export function getWpClient(): WpClient {
  if (_client) return _client;
  const base = process.env["WORDPRESS_REST_BASE_URL"] ?? "https://bdas.de";
  _client = new WpClient({ baseUrl: base });
  return _client;
}

/** Composition / test override. */
export function setWpClient(client: WpClient): void {
  _client = client;
}

/** Reset for tests. */
export function resetWpClient(): void {
  _client = null;
}
