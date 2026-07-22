<?php
/**
 * Admin config — hardcoded credentials, JSON as the datastore.
 */
declare(strict_types=1);

define('ADMIN_USER', 'admin');
define('ADMIN_PASS', 'SkylineAdmin2026');

define('DATA_FILE', dirname(__DIR__) . DIRECTORY_SEPARATOR . 'building-data.json');
define('UPLOAD_DIR', dirname(__DIR__) . DIRECTORY_SEPARATOR . 'model' . DIRECTORY_SEPARATOR . 'UnitImages');
define('UPLOAD_WEB_PREFIX', 'model/UnitImages/');

define('DEFAULT_AMENITY_CATALOG', [
    'Central AC',
    'City View',
    'Gym Access',
    'Parking',
    'Pool Access',
    'Smart Home',
    'West Open',
]);

define('SESSION_NAME', 'skyline_admin');
define('MAX_UPLOAD_BYTES', 5 * 1024 * 1024);
define('ALLOWED_IMAGE_TYPES', [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
]);
