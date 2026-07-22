<?php
declare(strict_types=1);

require __DIR__ . '/config.php';

session_name(SESSION_NAME);
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond($data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $message, int $code = 400): void
{
    respond(['ok' => false, 'error' => $message], $code);
}

function require_auth(): void
{
    if (empty($_SESSION['admin_logged_in'])) {
        fail('Unauthorized', 401);
    }
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        fail('Invalid JSON body');
    }
    return $data;
}

function load_data(): array
{
    if (!is_file(DATA_FILE)) {
        fail('building-data.json not found', 500);
    }
    $raw = file_get_contents(DATA_FILE);
    $data = json_decode($raw ?: '', true);
    if (!is_array($data) || !isset($data['building'], $data['floors']) || !is_array($data['floors'])) {
        fail('Invalid building-data.json', 500);
    }
    if (!isset($data['amenityCatalog']) || !is_array($data['amenityCatalog'])) {
        $data['amenityCatalog'] = DEFAULT_AMENITY_CATALOG;
    }
    return $data;
}

function recalculate_totals(array &$data): void
{
    $unitCount = 0;
    foreach ($data['floors'] as $floor) {
        $unitCount += isset($floor['units']) && is_array($floor['units']) ? count($floor['units']) : 0;
    }
    $data['building']['totalFloors'] = count($data['floors']);
    $data['building']['totalUnits'] = $unitCount;
}

function save_data(array $data): void
{
    recalculate_totals($data);
    if (!isset($data['amenityCatalog']) || !is_array($data['amenityCatalog'])) {
        $data['amenityCatalog'] = DEFAULT_AMENITY_CATALOG;
    }
    $data['amenityCatalog'] = array_values(array_unique(array_map('strval', $data['amenityCatalog'])));

    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        fail('Failed to encode JSON', 500);
    }

    $fp = fopen(DATA_FILE, 'c+');
    if ($fp === false) {
        fail('Cannot open data file for writing', 500);
    }
    try {
        if (!flock($fp, LOCK_EX)) {
            fail('Could not lock data file', 500);
        }
        ftruncate($fp, 0);
        rewind($fp);
        if (fwrite($fp, $json . "\n") === false) {
            fail('Failed to write data file', 500);
        }
        fflush($fp);
        flock($fp, LOCK_UN);
    } finally {
        fclose($fp);
    }
}

function find_floor_index(array $data, $floorId): int
{
    foreach ($data['floors'] as $i => $floor) {
        if ((string) $floor['id'] === (string) $floorId) {
            return (int) $i;
        }
    }
    return -1;
}

function find_unit_index(array $floor, $unitId): int
{
    foreach ($floor['units'] as $i => $unit) {
        if ((string) $unit['id'] === (string) $unitId) {
            return (int) $i;
        }
    }
    return -1;
}

function normalize_unit(array $unit, string $fallbackId = ''): array
{
    $id = trim((string) ($unit['id'] ?? $fallbackId));
    if ($id === '') {
        fail('Unit id is required');
    }
    $status = strtolower(trim((string) ($unit['status'] ?? 'available')));
    if (!in_array($status, ['available', 'reserved', 'sold'], true)) {
        $status = 'available';
    }
    $quadrant = strtoupper(trim((string) ($unit['quadrant'] ?? 'NE')));
    if (!in_array($quadrant, ['NE', 'NW', 'SE', 'SW'], true)) {
        $quadrant = 'NE';
    }

    $amenities = $unit['amenities'] ?? [];
    if (!is_array($amenities)) {
        $amenities = [];
    }
    $features = $unit['features'] ?? [];
    if (!is_array($features)) {
        $features = [];
    }
    $images = $unit['images'] ?? [];
    if (!is_array($images)) {
        $images = [];
    }

    return [
        'id' => $id,
        'name' => trim((string) ($unit['name'] ?? ('Unit ' . $id))),
        'price' => trim((string) ($unit['price'] ?? '')),
        'area' => trim((string) ($unit['area'] ?? '')),
        'bedrooms' => (int) ($unit['bedrooms'] ?? 0),
        'bathrooms' => (int) ($unit['bathrooms'] ?? 0),
        'amenities' => array_values(array_filter(array_map('strval', $amenities), static fn($v) => $v !== '')),
        'status' => $status,
        'quadrant' => $quadrant,
        'features' => array_values(array_filter(array_map('strval', $features), static fn($v) => $v !== '')),
        'images' => array_values(array_filter(array_map('strval', $images), static fn($v) => $v !== '')),
    ];
}

function collect_image_refs(array $data): array
{
    $refs = [];
    foreach ($data['floors'] as $floor) {
        foreach ($floor['units'] as $unit) {
            foreach ($unit['images'] ?? [] as $img) {
                $refs[$img] = ($refs[$img] ?? 0) + 1;
            }
        }
    }
    return $refs;
}

function list_uploaded_images(array $data): array
{
    $refs = collect_image_refs($data);
    $items = [];
    if (is_dir(UPLOAD_DIR)) {
        foreach (scandir(UPLOAD_DIR) ?: [] as $file) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            $path = UPLOAD_DIR . DIRECTORY_SEPARATOR . $file;
            if (!is_file($path)) {
                continue;
            }
            $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp'], true)) {
                continue;
            }
            $web = UPLOAD_WEB_PREFIX . $file;
            $items[] = [
                'path' => $web,
                'name' => $file,
                'size' => filesize($path) ?: 0,
                'usedBy' => $refs[$web] ?? 0,
            ];
        }
    }
    usort($items, static fn($a, $b) => strcasecmp($a['name'], $b['name']));
    return $items;
}

function stats_from(array $data): array
{
    $available = 0;
    $reserved = 0;
    $sold = 0;
    foreach ($data['floors'] as $floor) {
        foreach ($floor['units'] as $unit) {
            $s = $unit['status'] ?? 'available';
            if ($s === 'reserved') {
                $reserved++;
            } elseif ($s === 'sold') {
                $sold++;
            } else {
                $available++;
            }
        }
    }
    return [
        'floors' => count($data['floors']),
        'units' => (int) ($data['building']['totalUnits'] ?? 0),
        'available' => $available,
        'reserved' => $reserved,
        'sold' => $sold,
        'amenities' => count($data['amenityCatalog'] ?? []),
        'images' => count(list_uploaded_images($data)),
    ];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'me':
        respond([
            'ok' => true,
            'loggedIn' => !empty($_SESSION['admin_logged_in']),
            'user' => !empty($_SESSION['admin_logged_in']) ? ADMIN_USER : null,
        ]);

    case 'login':
        if ($method !== 'POST') {
            fail('Method not allowed', 405);
        }
        $body = read_json_body();
        $user = trim((string) ($body['username'] ?? ''));
        $pass = (string) ($body['password'] ?? '');
        if ($user === ADMIN_USER && hash_equals(ADMIN_PASS, $pass)) {
            $_SESSION['admin_logged_in'] = true;
            respond(['ok' => true, 'user' => ADMIN_USER]);
        }
        fail('Invalid username or password', 401);

    case 'logout':
        if ($method !== 'POST') {
            fail('Method not allowed', 405);
        }
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], (bool) $p['secure'], (bool) $p['httponly']);
        }
        session_destroy();
        respond(['ok' => true]);

    case 'bootstrap':
        require_auth();
        $data = load_data();
        recalculate_totals($data);
        respond([
            'ok' => true,
            'data' => $data,
            'stats' => stats_from($data),
            'images' => list_uploaded_images($data),
        ]);

    case 'building':
        require_auth();
        if ($method !== 'PUT' && $method !== 'POST') {
            fail('Method not allowed', 405);
        }
        $body = read_json_body();
        $data = load_data();
        $data['building']['name'] = trim((string) ($body['name'] ?? $data['building']['name']));
        $data['building']['tagline'] = trim((string) ($body['tagline'] ?? $data['building']['tagline']));
        save_data($data);
        respond(['ok' => true, 'building' => $data['building'], 'stats' => stats_from($data)]);

    case 'floor':
        require_auth();
        $data = load_data();

        if ($method === 'POST') {
            $body = read_json_body();
            $name = trim((string) ($body['name'] ?? ''));
            if ($name === '') {
                fail('Floor name is required');
            }
            $maxId = 0;
            foreach ($data['floors'] as $f) {
                $maxId = max($maxId, (int) $f['id']);
            }
            $id = isset($body['id']) && $body['id'] !== '' ? (int) $body['id'] : $maxId + 1;
            if (find_floor_index($data, $id) >= 0) {
                fail('Floor id already exists');
            }
            $floor = [
                'id' => $id,
                'name' => $name,
                'heightWeight' => (float) ($body['heightWeight'] ?? 1),
                'units' => [],
            ];
            $data['floors'][] = $floor;
            save_data($data);
            respond(['ok' => true, 'floor' => $floor, 'stats' => stats_from($data)]);
        }

        if ($method === 'PUT') {
            $body = read_json_body();
            $floorId = $body['id'] ?? null;
            $idx = find_floor_index($data, $floorId);
            if ($idx < 0) {
                fail('Floor not found', 404);
            }
            if (isset($body['name'])) {
                $data['floors'][$idx]['name'] = trim((string) $body['name']);
            }
            if (isset($body['heightWeight'])) {
                $data['floors'][$idx]['heightWeight'] = (float) $body['heightWeight'];
            }
            save_data($data);
            respond(['ok' => true, 'floor' => $data['floors'][$idx], 'stats' => stats_from($data)]);
        }

        if ($method === 'DELETE') {
            $floorId = $_GET['id'] ?? null;
            $idx = find_floor_index($data, $floorId);
            if ($idx < 0) {
                fail('Floor not found', 404);
            }
            array_splice($data['floors'], $idx, 1);
            save_data($data);
            respond(['ok' => true, 'stats' => stats_from($data)]);
        }

        fail('Method not allowed', 405);

    case 'unit':
        require_auth();
        $data = load_data();

        if ($method === 'POST') {
            $body = read_json_body();
            $floorId = $body['floorId'] ?? null;
            $idx = find_floor_index($data, $floorId);
            if ($idx < 0) {
                fail('Floor not found', 404);
            }
            $unit = normalize_unit($body['unit'] ?? $body);
            if (find_unit_index($data['floors'][$idx], $unit['id']) >= 0) {
                fail('Unit id already exists on this floor');
            }
            foreach ($unit['amenities'] as $a) {
                if (!in_array($a, $data['amenityCatalog'], true)) {
                    $data['amenityCatalog'][] = $a;
                }
            }
            $data['floors'][$idx]['units'][] = $unit;
            save_data($data);
            respond(['ok' => true, 'unit' => $unit, 'stats' => stats_from($data)]);
        }

        if ($method === 'PUT') {
            $body = read_json_body();
            $floorId = $body['floorId'] ?? null;
            $idx = find_floor_index($data, $floorId);
            if ($idx < 0) {
                fail('Floor not found', 404);
            }
            $originalId = (string) ($body['originalId'] ?? ($body['unit']['id'] ?? ''));
            $uIdx = find_unit_index($data['floors'][$idx], $originalId);
            if ($uIdx < 0) {
                fail('Unit not found', 404);
            }
            $unit = normalize_unit($body['unit'] ?? $body, $originalId);
            // Prevent duplicate ids when renaming
            $dup = find_unit_index($data['floors'][$idx], $unit['id']);
            if ($dup >= 0 && $dup !== $uIdx) {
                fail('Another unit already uses this id');
            }
            foreach ($unit['amenities'] as $a) {
                if (!in_array($a, $data['amenityCatalog'], true)) {
                    $data['amenityCatalog'][] = $a;
                }
            }
            $data['floors'][$idx]['units'][$uIdx] = $unit;
            save_data($data);
            respond(['ok' => true, 'unit' => $unit, 'stats' => stats_from($data)]);
        }

        if ($method === 'DELETE') {
            $floorId = $_GET['floorId'] ?? null;
            $unitId = $_GET['id'] ?? null;
            $idx = find_floor_index($data, $floorId);
            if ($idx < 0) {
                fail('Floor not found', 404);
            }
            $uIdx = find_unit_index($data['floors'][$idx], $unitId);
            if ($uIdx < 0) {
                fail('Unit not found', 404);
            }
            array_splice($data['floors'][$idx]['units'], $uIdx, 1);
            save_data($data);
            respond(['ok' => true, 'stats' => stats_from($data)]);
        }

        fail('Method not allowed', 405);

    case 'amenities':
        require_auth();
        $data = load_data();

        if ($method === 'POST') {
            $body = read_json_body();
            $name = trim((string) ($body['name'] ?? ''));
            if ($name === '') {
                fail('Amenity name is required');
            }
            if (in_array($name, $data['amenityCatalog'], true)) {
                fail('Amenity already exists');
            }
            $data['amenityCatalog'][] = $name;
            save_data($data);
            respond(['ok' => true, 'amenityCatalog' => $data['amenityCatalog'], 'stats' => stats_from($data)]);
        }

        if ($method === 'PUT') {
            $body = read_json_body();
            $from = trim((string) ($body['from'] ?? ''));
            $to = trim((string) ($body['to'] ?? ''));
            if ($from === '' || $to === '') {
                fail('Both from and to names are required');
            }
            $cIdx = array_search($from, $data['amenityCatalog'], true);
            if ($cIdx === false) {
                fail('Amenity not found', 404);
            }
            if ($from !== $to && in_array($to, $data['amenityCatalog'], true)) {
                fail('Target amenity name already exists');
            }
            $data['amenityCatalog'][$cIdx] = $to;
            foreach ($data['floors'] as &$floor) {
                foreach ($floor['units'] as &$unit) {
                    $unit['amenities'] = array_values(array_unique(array_map(
                        static fn($a) => $a === $from ? $to : $a,
                        $unit['amenities'] ?? []
                    )));
                }
            }
            unset($floor, $unit);
            save_data($data);
            respond(['ok' => true, 'amenityCatalog' => $data['amenityCatalog'], 'stats' => stats_from($data)]);
        }

        if ($method === 'DELETE') {
            $name = trim((string) ($_GET['name'] ?? ''));
            if ($name === '') {
                fail('Amenity name is required');
            }
            $data['amenityCatalog'] = array_values(array_filter(
                $data['amenityCatalog'],
                static fn($a) => $a !== $name
            ));
            foreach ($data['floors'] as &$floor) {
                foreach ($floor['units'] as &$unit) {
                    $unit['amenities'] = array_values(array_filter(
                        $unit['amenities'] ?? [],
                        static fn($a) => $a !== $name
                    ));
                }
            }
            unset($floor, $unit);
            save_data($data);
            respond(['ok' => true, 'amenityCatalog' => $data['amenityCatalog'], 'stats' => stats_from($data)]);
        }

        fail('Method not allowed', 405);

    case 'upload':
        require_auth();
        if ($method !== 'POST') {
            fail('Method not allowed', 405);
        }
        if (!isset($_FILES['image']) || !is_array($_FILES['image'])) {
            fail('No image uploaded');
        }
        $file = $_FILES['image'];
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            fail('Upload failed (error ' . ($file['error'] ?? '?') . ')');
        }
        if (($file['size'] ?? 0) > MAX_UPLOAD_BYTES) {
            fail('Image exceeds 5MB limit');
        }
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($file['tmp_name']);
        if (!isset(ALLOWED_IMAGE_TYPES[$mime])) {
            fail('Only JPG, PNG, and WebP images are allowed');
        }
        if (!is_dir(UPLOAD_DIR) && !mkdir(UPLOAD_DIR, 0755, true)) {
            fail('Cannot create upload directory', 500);
        }
        $ext = ALLOWED_IMAGE_TYPES[$mime];
        $name = 'upload_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $dest = UPLOAD_DIR . DIRECTORY_SEPARATOR . $name;
        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            fail('Failed to save uploaded file', 500);
        }
        $web = UPLOAD_WEB_PREFIX . $name;
        $data = load_data();
        respond([
            'ok' => true,
            'path' => $web,
            'images' => list_uploaded_images($data),
            'stats' => stats_from($data),
        ]);

    case 'image':
        require_auth();
        if ($method !== 'DELETE') {
            fail('Method not allowed', 405);
        }
        $path = (string) ($_GET['path'] ?? '');
        if ($path === '' || strpos($path, '..') !== false || strpos($path, UPLOAD_WEB_PREFIX) !== 0) {
            fail('Invalid image path');
        }
        $basename = basename($path);
        $full = UPLOAD_DIR . DIRECTORY_SEPARATOR . $basename;
        $data = load_data();
        // Detach from units
        foreach ($data['floors'] as &$floor) {
            foreach ($floor['units'] as &$unit) {
                $unit['images'] = array_values(array_filter(
                    $unit['images'] ?? [],
                    static fn($img) => $img !== $path
                ));
            }
        }
        unset($floor, $unit);
        save_data($data);
        if (is_file($full)) {
            @unlink($full);
        }
        respond(['ok' => true, 'images' => list_uploaded_images($data), 'stats' => stats_from($data)]);

    default:
        fail('Unknown action', 404);
}
