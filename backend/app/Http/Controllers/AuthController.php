<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\User;
use App\Services\YoabsenAuthService;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Handle the login request.
     */
    public function login(Request $request, YoabsenAuthService $yoabsenAuth)
    {
        $request->validate([
            'username' => 'required',
            'password' => 'required',
            'location_id' => 'nullable|string' // Optional: store initial if the frontend sends current location
        ]);

        $credentialsAreValid = $yoabsenAuth->enabled()
            ? $yoabsenAuth->authenticate($request->username, $request->password)
            : Auth::attempt($request->only('username', 'password'));

        if (!$credentialsAreValid) {
            throw $this->invalidCredentials();
        }

        $user = User::where('username', $request->username)->first();
        if (!$user) {
            Auth::logout();
            throw $this->invalidCredentials();
        }

        // Check if user is active
        if (!$user->active) {
            Auth::logout();
            throw ValidationException::withMessages([
                'username' => ['Account is inactive.'],
            ]);
        }

        // Manager Logic: Location Lock
        if ($user->role_type === 'manager') {

            // Store Manager (SM) must be locked to their assigned location
            if ($user->manager_type === 'SM') {
                if (!$user->location_id) {
                    // Safety check: SM must have a location assigned in DB
                    Auth::logout();
                    return response()->json(['message' => 'System Error: SM has no assigned location.'], 403);
                }

                // In a real PWA on-site, we might verify IP or geolocation here.
                // For now, we assume the location_id passed (or lack thereof) implies checking the backend assignment
                // Getting stricter: If the request includes a location_id (e.g. from a site kiosk), it must match.
                if ($request->has('location_id') && $request->location_id != $user->location_id) {
                    Auth::logout();
                    throw ValidationException::withMessages([
                        'location_id' => ['Access denied: You are locked to a different location.'],
                    ]);
                }
            }

            // Regional Manager (RM) - No Lock
            // Can access from anywhere.
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'message' => 'Login successful',
            'access_token' => $token,
            'token_type' => 'Bearer',
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
            'username' => ['Invalid credentials.'],
        ]);
    }
}
