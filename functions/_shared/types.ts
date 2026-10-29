export interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  results?: T[];
  meta?: { changes?: number };
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
  batch<T = unknown>(statements: D1Statement[]): Promise<D1Result<T>[]>;
}

export interface KVNamespace {
  get(key: string, options: { type: 'arrayBuffer' }): Promise<ArrayBuffer | null>;
  put(key: string, value: ArrayBuffer | ArrayBufferView): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface PagesEnv {
  DB?: D1Database;
  PRODUCT_IMAGES?: KVNamespace;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_OWNER_ID?: string;
  GITHUB_OAUTH_CALLBACK_URL?: string;
  AMAZON_ASSOCIATE_TAG?: string;
  PICKORA_LOCAL_AUTH?: string;
  CF_PAGES_BRANCH?: string;
}

export interface PagesContext {
  request: Request;
  env: PagesEnv;
  params: Record<string, string | string[]>;
  next(): Promise<Response>;
  waitUntil(promise: Promise<unknown>): void;
}

export type PagesHandler = (context: PagesContext) => Response | Promise<Response>;

export function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(data), { status, headers });
}

export function dbOrNull(env: PagesEnv): D1Database | null {
  return env.DB ?? null;
}
