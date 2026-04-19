import React, { useState } from 'react';

interface LoginPageProps {
    onLoginSuccess: (user: any) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                const apiError =
                    data?.errors?.username?.[0] ||
                    data?.errors?.password?.[0] ||
                    data?.message ||
                    'Login failed';

                throw new Error(apiError);
            }

            // Success


            // Store token for API requests
            localStorage.setItem('auth_token', data.access_token);
            localStorage.setItem('user_data', JSON.stringify(data.user));
            sessionStorage.setItem('just_logged_in', 'true');

            onLoginSuccess(data.user);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 md:px-0">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 space-y-6 border border-gray-100">
                <div className="text-center">
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Let's get you logged in</h1>
                    <p className="text-gray-500 mt-2">PPA - Ceklis</p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none transition"
                            placeholder="e.g. sm_jakarta"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none transition"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 md:bg-primary hover:bg-blue-700 md:hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 disabled:opacity-50"
                    >
                        {loading ? 'Verifying...' : 'Sign In'}
                    </button>
                </form>

                <div className="text-center text-xs text-gray-400">
                    &copy; 2026 PPA - Ceklis
                </div>
            </div>
        </div>
    );
}
