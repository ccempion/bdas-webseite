<?php
/**
 * Plugin Name:       BDAS SSO Bridge
 * Description:       Hydrates the WordPress current user from the bdas_session cookie issued by dashboard.bdas.de, and exposes the primary navigation as a JSON endpoint at /wp-json/bdas/v1/menu.
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            BDAS
 * License:           Proprietary — internal federation use.
 *
 * Configuration (wp-config.php):
 *
 *   define('BDAS_SSO_SECRET', 'paste the same value as SSO_JWT_SECRET in the Next app');
 *
 * Without that constant the plugin loads but does nothing — no error, no
 * forged sessions. See ADR 0002 for the cookie shape.
 */

if (!defined('ABSPATH')) {
    exit;
}

define('BDAS_SSO_VERSION', '0.1.0');
define('BDAS_SSO_COOKIE_NAME', 'bdas_session');
define('BDAS_SSO_TOKEN_VERSION', 1);

require_once __DIR__ . '/src/jwt.php';
require_once __DIR__ . '/src/sso.php';
require_once __DIR__ . '/src/menu.php';

// Hydrate the current user as early as possible so theme / nav / shortcodes
// see the SSO'd identity. priority 1 runs before most plugins.
add_action('plugins_loaded', 'bdas_sso_hydrate_current_user', 1);

// Register the /wp-json/bdas/v1/menu endpoint.
add_action('rest_api_init', 'bdas_sso_register_menu_route');
