import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export const SESSION_COOKIE_NAME = 'scalpengine_session';
export const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes after 5 failed tries

interface LoginAttemptRecord {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
}

const loginAttempts = new Map<string, LoginAttemptRecord>();

export function getConfiguredPassword(): string {
  return (
    process.env.APP_PASSWORD ||
    process.env.AUTH_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    ''
  ).trim();
}

export function isAuthEnabled(): boolean {
  return getConfiguredPassword().length > 0;
}

function getSigningKey(): Buffer {
  const secretSource = (
    process.env.AUTH_SECRET ||
    getConfiguredPassword() ||
    'scalpengine-default-ephemeral-secret'
  ).trim();
  return crypto.createHash('sha256').update(`scalpengine-auth-v1:${secretSource}`).digest();
}

function timingSafeComparePassword(input: string, expected: string): boolean {
  const inputHash = crypto.createHash('sha256').update(input, 'utf8').digest();
  const expectedHash = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(inputHash, expectedHash);
}

interface SessionPayload {
  sub: 'operator';
  iat: number;
  exp: number;
  nonce: string;
}

export function createSessionToken(now = Date.now()): { token: string; expiresAt: number } {
  const expiresAt = now + SESSION_TTL_MS;
  const payload: SessionPayload = {
    sub: 'operator',
    iat: now,
    exp: expiresAt,
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningKey())
    .update(payloadB64)
    .digest('base64url');
  return { token: `${payloadB64}.${sig}`, expiresAt };
}

export function verifySessionToken(
  token: string | undefined,
  now = Date.now()
): { valid: boolean; expiresAt: number | null } {
  if (!token || !isAuthEnabled()) {
    return { valid: false, expiresAt: null };
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, expiresAt: null };
  }
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) {
    return { valid: false, expiresAt: null };
  }

  const expectedSig = crypto
    .createHmac('sha256', getSigningKey())
    .update(payloadB64)
    .digest('base64url');

  const sigBuf = Buffer.from(sigB64, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, expiresAt: null };
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as SessionPayload;
    if (
      parsed.sub !== 'operator' ||
      typeof parsed.exp !== 'number' ||
      !Number.isFinite(parsed.exp) ||
      parsed.exp <= now
    ) {
      return { valid: false, expiresAt: null };
    }
    return { valid: true, expiresAt: parsed.exp };
  } catch {
    return { valid: false, expiresAt: null };
  }
}

export function parseCookieHeader(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  return undefined;
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function isRequestHttps(req: Request): boolean {
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string') {
    return proto.split(',')[0].trim().toLowerCase() === 'https';
  }
  return false;
}

function formatSessionCookie(req: Request, value: string, maxAgeSec: number): string {
  const https = isRequestHttps(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
    https ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (https) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function getAuthStatusFromRequest(req: Request): {
  authEnabled: boolean;
  authenticated: boolean;
  expiresAt: number | null;
  ttlHours: number;
} {
  const enabled = isAuthEnabled();
  if (!enabled) {
    return {
      authEnabled: false,
      authenticated: true,
      expiresAt: null,
      ttlHours: 4,
    };
  }
  const token = parseCookieHeader(req.headers.cookie, SESSION_COOKIE_NAME);
  const verified = verifySessionToken(token);
  return {
    authEnabled: true,
    authenticated: verified.valid,
    expiresAt: verified.expiresAt,
    ttlHours: 4,
  };
}

export function requireAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!isAuthEnabled()) {
    next();
    return;
  }
  const token = parseCookieHeader(req.headers.cookie, SESSION_COOKIE_NAME);
  const verified = verifySessionToken(token);
  if (!verified.valid) {
    res.setHeader('Set-Cookie', formatSessionCookie(req, '', 0));
    res.status(401).json({
      ok: false,
      authRequired: true,
      error: 'Sesja wygasła lub wymaga ponownego zalogowania (ważność sesji: 4h).',
    });
    return;
  }
  next();
}

export function handleLoginRequest(req: Request, res: Response) {
  if (!isAuthEnabled()) {
    res.json({
      ok: true,
      authEnabled: false,
      authenticated: true,
      expiresAt: null,
      ttlHours: 4,
    });
    return;
  }

  const ip = getClientIp(req);
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (record && record.lockedUntil > now) {
    const waitMin = Math.ceil((record.lockedUntil - now) / 60000);
    res.status(429).json({
      ok: false,
      error: `Zbyt wiele błędnych prób logowania. Odczekaj ${waitMin} min.`,
    });
    return;
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const expected = getConfiguredPassword();

  if (!password || !timingSafeComparePassword(password, expected)) {
    const prev = record && now - record.firstFailureAt < LOCKOUT_MS ? record : null;
    const failures = (prev?.failures ?? 0) + 1;
    const lockedUntil = failures >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_MS : 0;
    loginAttempts.set(ip, {
      failures,
      firstFailureAt: prev?.firstFailureAt ?? now,
      lockedUntil,
    });

    res.status(401).json({
      ok: false,
      error:
        lockedUntil > 0
          ? 'Przekroczono limit 5 nieudanych prób. Logowanie zablokowane na 10 min.'
          : `Nieprawidłowe hasło (próba ${failures}/${MAX_FAILED_ATTEMPTS}).`,
    });
    return;
  }

  loginAttempts.delete(ip);
  const { token, expiresAt } = createSessionToken(now);
  res.setHeader('Set-Cookie', formatSessionCookie(req, token, Math.floor(SESSION_TTL_MS / 1000)));
  res.json({
    ok: true,
    authEnabled: true,
    authenticated: true,
    expiresAt,
    ttlHours: 4,
  });
}

export function handleLogoutRequest(req: Request, res: Response) {
  res.setHeader('Set-Cookie', formatSessionCookie(req, '', 0));
  res.json({
    ok: true,
    authEnabled: isAuthEnabled(),
    authenticated: !isAuthEnabled(),
    expiresAt: null,
  });
}
