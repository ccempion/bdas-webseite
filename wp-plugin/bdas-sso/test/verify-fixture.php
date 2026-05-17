<?php
/**
 * Standalone contract test for the WordPress SSO verifier (ADR 0002 follow-up).
 *
 * No WordPress runtime: it defines the two constants src/jwt.php needs and
 * requires the real parser. It reads the same fixture.json the TS issuer test
 * reads, plus runtime-token.local (a token freshly minted by that TS test
 * earlier in the same CI job), and asserts the parser accepts it and decodes
 * to the fixture's expected claims. Also checks the negative paths the ADR
 * names explicitly (bad secret, alg:none, tampered signature).
 *
 * Exit 0 = contract holds. Exit 1 = issuer/verifier drift or a broken guard.
 *
 * Run:  php wp-plugin/bdas-sso/test/verify-fixture.php
 */

declare(strict_types=1);

// src/jwt.php guards on these; satisfy them without loading WordPress.
define('ABSPATH', __DIR__ . '/');
define('BDAS_SSO_TOKEN_VERSION', 1);

require __DIR__ . '/../src/jwt.php';

$failures = [];

function check(string $name, bool $cond, array &$failures): void {
    if ($cond) {
        fwrite(STDOUT, "  ok  - $name\n");
    } else {
        $failures[] = $name;
        fwrite(STDOUT, "  FAIL- $name\n");
    }
}

$fixturePath = __DIR__ . '/fixture.json';
$tokenPath   = __DIR__ . '/runtime-token.local';

if (!is_file($fixturePath)) {
    fwrite(STDERR, "fixture.json missing at $fixturePath\n");
    exit(1);
}
if (!is_file($tokenPath)) {
    fwrite(STDERR, "runtime-token.local missing — run `pnpm test` (the TS issuer test writes it) before this script.\n");
    exit(1);
}

$fixture = json_decode((string) file_get_contents($fixturePath), true);
$token   = trim((string) file_get_contents($tokenPath));
$secret  = (string) $fixture['secret'];
$expect  = $fixture['expectClaims'];

// --- Positive: the freshly minted token verifies and decodes correctly ---
$claims = bdas_sso_jwt_verify($token, $secret);
check('parser accepts the issuer-minted token', is_array($claims), $failures);

if (is_array($claims)) {
    check('iss matches',   ($claims['iss'] ?? null) === $expect['iss'], $failures);
    check('sub matches',   ($claims['sub'] ?? null) === $expect['sub'], $failures);
    check('email matches', ($claims['email'] ?? null) === $expect['email'], $failures);
    check('ver matches',   ($claims['ver'] ?? null) === $expect['ver'], $failures);
    check('roles match',   ($claims['roles'] ?? null) == $expect['roles'], $failures);
    check('jti present',   is_string($claims['jti'] ?? null) && $claims['jti'] !== '', $failures);
    check('iat present',   is_int($claims['iat'] ?? null), $failures);
    check('exp in future', is_int($claims['exp'] ?? null) && $claims['exp'] > time(), $failures);
}

// --- Negative: wrong secret is rejected ---
check(
    'wrong secret rejected',
    bdas_sso_jwt_verify($token, 'a-different-secret-that-is-also-32+chars-long') === null,
    $failures
);

// --- Negative: signature-tampered token is rejected ---
$parts = explode('.', $token);
if (count($parts) === 3) {
    $sig = $parts[2];
    $parts[2] = ($sig[0] === 'A' ? 'B' : 'A') . substr($sig, 1);
    check('tampered signature rejected', bdas_sso_jwt_verify(implode('.', $parts), $secret) === null, $failures);
}

// --- Negative: alg:none confusion attack is rejected ---
$b64url = static fn (string $s): string => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
$origParts = explode('.', $token);
$forged = $b64url('{"alg":"none","typ":"JWT"}') . '.' . $origParts[1] . '.';
check('alg:none rejected', bdas_sso_jwt_verify($forged, $secret) === null, $failures);

if ($failures) {
    fwrite(STDERR, "\nSSO contract FAILED: " . implode(', ', $failures) . "\n");
    exit(1);
}

fwrite(STDOUT, "\nSSO issuer ↔ verifier contract holds.\n");
exit(0);
