/**
 * Polymarket CLOB API — L1 authentication (API key credentials).
 *
 * Signing spec:
 *   message   = timestamp + method.toUpperCase() + requestPath + body
 *   raw_sig   = HMAC-SHA256(base64decode(secret), message)
 *   signature = base64encode(raw_sig)
 *
 * Headers injected on every authenticated request:
 *   POLY_ADDRESS    = api_key (credential ID)
 *   POLY_SIGNATURE  = computed signature
 *   POLY_TIMESTAMP  = unix seconds (string)
 *   POLY_NONCE      = "0"
 *   POLY_PASSPHRASE = passphrase
 */

const API_KEY    = process.env.POLY_API_KEY!;
const SECRET     = process.env.POLY_SECRET!;      // base64-encoded
const PASSPHRASE = process.env.POLY_PASSPHRASE!;

if (!API_KEY || !SECRET || !PASSPHRASE) {
  console.error(
    "[auth] Missing POLY_API_KEY / POLY_SECRET / POLY_PASSPHRASE env vars"
  );
}

/**
 * Derive HMAC-SHA256 signing key from the base64-encoded secret.
 * Cached after first call — key material doesn't change at runtime.
 */
let _signingKey: CryptoKey | null = null;

async function getSigningKey(): Promise<CryptoKey> {
  if (_signingKey) return _signingKey;

  const rawSecret = Uint8Array.from(atob(SECRET), (c) => c.charCodeAt(0));
  _signingKey = await crypto.subtle.importKey(
    "raw",
    rawSecret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return _signingKey;
}

/**
 * Sign a message string and return base64-encoded signature.
 */
async function sign(message: string): Promise<string> {
  const key = await getSigningKey();
  const enc = new TextEncoder();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/**
 * Build L1 auth headers for a CLOB API request.
 *
 * @param method      HTTP method (GET, POST, DELETE …)
 * @param requestPath Path + query string, e.g. "/book?token_id=0x…"
 * @param body        JSON body string for POST requests (empty string for GET)
 */
export async function l1Headers(
  method: string,
  requestPath: string,
  body: string = ""
): Promise<Record<string, string>> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const message   = timestamp + method.toUpperCase() + requestPath + body;
  const signature = await sign(message);

  return {
    "POLY_ADDRESS":    API_KEY,
    "POLY_SIGNATURE":  signature,
    "POLY_TIMESTAMP":  timestamp,
    "POLY_NONCE":      "0",
    "POLY_PASSPHRASE": PASSPHRASE,
    "Content-Type":    "application/json",
  };
}

/**
 * Authenticated fetch wrapper — automatically injects L1 headers.
 *
 * @param url     Full URL
 * @param init    Standard RequestInit (method, body, signal …)
 */
export async function authFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const parsed      = new URL(url);
  const requestPath = parsed.pathname + parsed.search;
  const method      = (init.method ?? "GET").toUpperCase();
  const body        = typeof init.body === "string" ? init.body : "";

  const headers = await l1Headers(method, requestPath, body);

  return fetch(url, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
  });
}
