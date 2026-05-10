<?php
/**
 * Minimal HS256 JWT verifier.
 *
 * Deliberately scope-limited:
 *   - Only HS256 is accepted. Algorithm-confusion (alg=none) is rejected.
 *   - No remote key fetch, no kid lookup, no JWKS.
 *   - Constant-time signature comparison via hash_equals.
 *
 * Returns the decoded claims array on success, or null on any failure.
 * The caller MUST treat null as "anonymous" — never grant access on
 * verification failure.
 */

if (!defined('ABSPATH')) {
    exit;
}

function bdas_sso_b64url_decode(string $input): ?string {
    $remainder = strlen($input) % 4;
    if ($remainder) {
        $input .= str_repeat('=', 4 - $remainder);
    }
    $decoded = base64_decode(strtr($input, '-_', '+/'), true);
    return $decoded === false ? null : $decoded;
}

/**
 * @return array<string, mixed>|null
 */
function bdas_sso_jwt_verify(string $jwt, string $secret): ?array {
    if ($secret === '' || strlen($secret) < 32) {
        return null;
    }
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) {
        return null;
    }
    [$h64, $p64, $s64] = $parts;

    $headerJson = bdas_sso_b64url_decode($h64);
    $payloadJson = bdas_sso_b64url_decode($p64);
    $sig = bdas_sso_b64url_decode($s64);
    if ($headerJson === null || $payloadJson === null || $sig === null) {
        return null;
    }

    $header = json_decode($headerJson, true);
    $payload = json_decode($payloadJson, true);
    if (!is_array($header) || !is_array($payload)) {
        return null;
    }

    if (($header['alg'] ?? '') !== 'HS256') {
        return null;
    }
    if (($header['typ'] ?? 'JWT') !== 'JWT') {
        return null;
    }

    $expected = hash_hmac('sha256', $h64 . '.' . $p64, $secret, true);
    if (!hash_equals($expected, $sig)) {
        return null;
    }

    if (($payload['iss'] ?? null) !== 'bdas') {
        return null;
    }
    if (($payload['ver'] ?? null) !== BDAS_SSO_TOKEN_VERSION) {
        return null;
    }
    $exp = $payload['exp'] ?? null;
    if (!is_int($exp) || $exp < time()) {
        return null;
    }
    $iat = $payload['iat'] ?? null;
    if (!is_int($iat) || $iat > time() + 60) {
        return null;
    }
    if (!is_string($payload['sub'] ?? null) || !is_string($payload['email'] ?? null)) {
        return null;
    }
    if (!isset($payload['roles']) || !is_array($payload['roles'])) {
        return null;
    }

    return $payload;
}
