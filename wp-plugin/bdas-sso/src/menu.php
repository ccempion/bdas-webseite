<?php
/**
 * /wp-json/bdas/v1/menu — public read-only endpoint that returns the
 * primary navigation as a normalised JSON array. Consumed by
 * `@bdas/content-bridge` per ADR 0004.
 *
 * Resolution rules, in order:
 *   1. Menu assigned to the `primary` theme location.
 *   2. Menu named `Primary`, `Hauptmenü`, or `Navigation` (case-insensitive).
 *   3. The most recently created menu.
 *   4. Empty array.
 */

if (!defined('ABSPATH')) {
    exit;
}

function bdas_sso_register_menu_route(): void {
    register_rest_route('bdas/v1', '/menu', [
        'methods'             => 'GET',
        'callback'            => 'bdas_sso_menu_endpoint',
        'permission_callback' => '__return_true',
    ]);
}

function bdas_sso_menu_endpoint(): WP_REST_Response {
    $menu = bdas_sso_resolve_primary_menu();
    if (!$menu) {
        return new WP_REST_Response(['items' => []], 200);
    }

    $items = wp_get_nav_menu_items($menu->term_id, ['update_post_term_cache' => false]);
    if (!is_array($items)) {
        return new WP_REST_Response(['items' => []], 200);
    }

    $out = [];
    foreach ($items as $item) {
        $url = (string) $item->url;
        $slug = bdas_sso_slug_from_url($url);
        $out[] = [
            'id'     => (int) $item->ID,
            'title'  => wp_strip_all_tags((string) $item->title),
            'url'    => $url,
            'slug'   => $slug,
            'parent' => (int) $item->menu_item_parent,
            'order'  => (int) $item->menu_order,
        ];
    }

    return new WP_REST_Response(['items' => $out], 200);
}

function bdas_sso_resolve_primary_menu(): ?WP_Term {
    $locations = get_nav_menu_locations();
    if (isset($locations['primary'])) {
        $by_loc = wp_get_nav_menu_object($locations['primary']);
        if ($by_loc instanceof WP_Term) {
            return $by_loc;
        }
    }

    $menus = wp_get_nav_menus();
    if (!is_array($menus) || count($menus) === 0) {
        return null;
    }

    $preferred = ['primary', 'hauptmenü', 'hauptmenu', 'navigation'];
    foreach ($menus as $menu) {
        if ($menu instanceof WP_Term && in_array(strtolower($menu->name), $preferred, true)) {
            return $menu;
        }
    }

    // Fall back to the most recently created.
    usort($menus, function ($a, $b) {
        return ($b->term_id ?? 0) <=> ($a->term_id ?? 0);
    });
    return $menus[0] instanceof WP_Term ? $menus[0] : null;
}

function bdas_sso_slug_from_url(string $url): string {
    $path = parse_url($url, PHP_URL_PATH);
    if (!is_string($path) || $path === '' || $path === '/') {
        return '';
    }
    $segments = array_values(array_filter(explode('/', $path), 'strlen'));
    return $segments ? (string) end($segments) : '';
}
