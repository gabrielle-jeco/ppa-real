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
        'enabled' => env('YOJADWAL_ENABLED', env('YOABSEN_ENABLED', false)),
        'base_url' => env('YOJADWAL_BASE_URL', env('YOABSEN_BASE_URL')),
        'login_path' => env('YOJADWAL_LOGIN_PATH', env('YOABSEN_LOGIN_PATH', '/api/login')),
        'presence_path' => env('YOJADWAL_PRESENCE_PATH', '/api/presence'),
        'token' => env('YOJADWAL_TOKEN', env('YOABSEN_TOKEN')),
        'cookie' => env('YOJADWAL_COOKIE'),
        'app_client' => env('YOJADWAL_APP_CLIENT', 'Android-Mobile-App'),
        'timeout' => env('YOJADWAL_TIMEOUT', env('YOABSEN_TIMEOUT', 10)),
        'nik_field' => env('YOJADWAL_NIK_FIELD', env('YOABSEN_NIK_FIELD', 'username')),
        'password_field' => env('YOJADWAL_PASSWORD_FIELD', env('YOABSEN_PASSWORD_FIELD', 'password')),
        'success_field' => env('YOJADWAL_SUCCESS_FIELD', env('YOABSEN_SUCCESS_FIELD', 'success')),
        'allow_local_superadmin_fallback' => env('YOJADWAL_ALLOW_LOCAL_SUPERADMIN_FALLBACK', true),
    ],

    'webpush' => [
        'enabled' => env('WEB_PUSH_ENABLED', false),
        'subject' => env('WEB_PUSH_SUBJECT', env('APP_URL', 'https://yodaily.local')),
        'public_key' => env('WEB_PUSH_PUBLIC_KEY'),
        'private_key' => env('WEB_PUSH_PRIVATE_KEY'),
    ],

];
