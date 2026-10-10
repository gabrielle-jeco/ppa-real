<?php

return [
    'enabled' => env('BEYOND_CASHIER_ENABLED', false),
    'base_url' => env('BEYOND_CASHIER_BASE_URL'),
    'cashiers_path' => env('BEYOND_CASHIERS_PATH'),
    'ibop_path' => env('BEYOND_IBOP_PATH'),
    'push_selling_path' => env('BEYOND_PUSH_SELLING_PATH'),
    'token' => env('BEYOND_CASHIER_TOKEN'),
    'timeout' => (int) env('BEYOND_CASHIER_TIMEOUT', 20),
];
