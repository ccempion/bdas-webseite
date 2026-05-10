<?php
/**
 * Cookie reader and current-user hydration.
 *
 * Phase 1 only does "logged in vs not". Role mapping (BDAS roles → WP roles)
 * is Phase 5 per spec §16. For now any verified token gets a low-privilege
 * Subscriber-level WP user, auto-created on first match by email.
 */

if (!defined('ABSPATH')) {
    exit;
}

function bdas_sso_get_secret(): string {
    return defined('BDAS_SSO_SECRET') ? (string) BDAS_SSO_SECRET : '';
}

/**
 * Read the bdas_session cookie, verify it, and set the current WP user.
 * No-op when the cookie is absent or invalid (anonymous request).
 */
function bdas_sso_hydrate_current_user(): void {
    if (is_admin() && !defined('REST_REQUEST')) {
        // Don't interfere with classic wp-admin auth flows.
        return;
    }

    $secret = bdas_sso_get_secret();
    if ($secret === '') {
        return;
    }

    $raw = $_COOKIE[BDAS_SSO_COOKIE_NAME] ?? null;
    if (!is_string($raw) || $raw === '') {
        return;
    }

    $claims = bdas_sso_jwt_verify($raw, $secret);
    if (!is_array($claims)) {
        return;
    }

    $email = strtolower(trim((string) $claims['email']));
    if ($email === '' || !is_email($email)) {
        return;
    }

    $user = get_user_by('email', $email);
    if (!$user) {
        $user_id = bdas_sso_create_subscriber($email);
        if (!$user_id) {
            return;
        }
        $user = get_user_by('id', $user_id);
        if (!$user) {
            return;
        }
    }

    wp_set_current_user($user->ID);
}

/**
 * Create a low-privilege WP user matching the BDAS member's email.
 * Returns the new user_id on success, 0 on any failure.
 */
function bdas_sso_create_subscriber(string $email): int {
    $base = sanitize_user(strtolower(strstr($email, '@', true) ?: 'bdas'), true);
    if ($base === '') {
        $base = 'bdas-' . substr(md5($email), 0, 8);
    }
    $login = $base;
    $i = 1;
    while (username_exists($login)) {
        $login = $base . '-' . $i++;
        if ($i > 50) {
            return 0;
        }
    }

    $userdata = [
        'user_login' => $login,
        'user_email' => $email,
        'user_pass'  => wp_generate_password(32, true, true),
        'role'       => 'subscriber',
        'meta_input' => ['bdas_sso_provisioned' => 1],
    ];
    $user_id = wp_insert_user($userdata);
    if (is_wp_error($user_id)) {
        return 0;
    }
    return (int) $user_id;
}
