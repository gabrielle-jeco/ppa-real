<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'mailgun' => [
        'domain' => env('MAILGUN_DOMAIN'),
        'secret' => env('MAILGUN_SECRET'),
        'endpoint' => env('MAILGUN_ENDPOINT', 'api.mailgun.net'),
    ],

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'yoabsen' => [
        'enabled' => env('YOABSEN_ENABLED', false),
        'base_url' => env('YOABSEN_BASE_URL'),
        'login_path' => env('YOABSEN_LOGIN_PATH', '/api/login'),
        'token' => env('YOABSEN_TOKEN'),
        'timeout' => env('YOABSEN_TIMEOUT', 10),
        'nik_field' => env('YOABSEN_NIK_FIELD', 'nik'),
        'password_field' => env('YOABSEN_PASSWORD_FIELD', 'password'),
        'success_field' => env('YOABSEN_SUCCESS_FIELD'),
    ],

];
