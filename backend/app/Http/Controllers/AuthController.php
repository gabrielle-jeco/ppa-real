<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\User;
use App\Services\YoabsenAuthService;
use App\Services\YojadwalPresenceService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Handle the login request.
     */
    public function login(Request $request, YoabsenAuthService $yoabsenAuth, YojadwalPresenceService $presenceService)
    {
        $request->validate([
            'username' => 'required',
            'password' => 'required',
            'location_id' => 'nullable|string'
        ]);

        $user = User::where('username', $request->username)->first();
        if (!$user) {
            Auth::logout();
            throw $this->invalidCredentials();
        }

        if ($user->role_type === 'superadmin') {
            if (!Auth::attempt($request->only('username', 'password'))) {
                throw $this->invalidCredentials();
            }
        } else {
            if (!$this->credentialsAreValid($request, $yoabsenAuth)) {
                throw $this->invalidCredentials();
            }

            $this->syncYojadwalUserData($user, $yoabsenAuth->lastPayload());
        }

        if (!$user->active) {
            Auth::logout();
            throw ValidationException::withMessages([
                'username' => ['Account is inactive.'],
            ]);
        }

        if ($user->role_type === 'manager') {
            if ($user->manager_type === 'SM') {
                if (!$user->location_id) {
                    Auth::logout();
                    return response()->json(['message' => 'Kesalahan sistem: SM belum memiliki lokasi.'], 403);
                }

                if ($request->has('location_id') && $request->location_id != $user->location_id) {
                    Auth::logout();
                    throw ValidationException::withMessages([
                        'location_id' => ['Access denied: You are locked to a different location.'],
                    ]);
                }
            }

        }

        $tokenExpirationMinutes = config('sanctum.expiration');
        $expiresAt = $tokenExpirationMinutes ? Carbon::now()->addMinutes((int) $tokenExpirationMinutes) : null;
        $token = $user->createToken('auth_token')->plainTextToken;
        if ($user->role_type !== 'superadmin') {
            $this->syncCurrentMonthAttendance($presenceService, $user);
        }

        return response()->json([
            'message' => 'Login successful',
            'access_token' => $token,
            'token_type' => 'Bearer',
            'expires_at' => $expiresAt?->toIso8601String(),
            'user' => $user
        ]);
    }

    /**
     * Handle logout.
     */
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out successfully']);
    }

    /**
     * Get authenticated user.
     */
    public function me(Request $request)
    {
        return $request->user();
    }

    private function invalidCredentials(): ValidationException
    {
        return ValidationException::withMessages([
            'username' => ['Username dan password yang Anda masukkan tidak sesuai'],
        ]);
    }

    private function credentialsAreValid(Request $request, YoabsenAuthService $yoabsenAuth): bool
    {
        return $yoabsenAuth->enabled()
            ? $yoabsenAuth->authenticate($request->username, $request->password)
            : Auth::attempt($request->only('username', 'password'));
    }

    private function syncCurrentMonthAttendance(YojadwalPresenceService $presenceService, User $user): void
    {
        if (!$presenceService->enabled()) {
            return;
        }

        try {
            $today = Carbon::now();
            $presenceService->syncMonthIfNeeded($user->username, $today->month, $today->year);
        } catch (\Throwable $error) {
            Log::warning('YoJadwal attendance sync after login failed.', [
                'username' => $user->username,
                'message' => $error->getMessage(),
            ]);
        }
    }

    private function syncYojadwalUserData(User $user, ?array $payload): void
    {
        $initialStore = data_get($payload, 'data.user.initial_store');
        if (!$initialStore) {
            return;
        }

        $user->initial_store = strtoupper(trim((string) $initialStore));
        $user->save();
    }
}
