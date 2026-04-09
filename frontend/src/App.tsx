import { useState, useEffect } from 'react';
import LoginPage from './general/LoginPage';
import SupervisorLayout from './desktop - supervisor/SupervisorLayout';
import SupervisorDashboard from './desktop - supervisor/SupervisorDashboard';
import SupervisorMobileApp from './mobile - supervisor/SupervisorMobileApp';
import CrewMobileApp from './mobile - crew/CrewMobileApp';

function App() {
  const [user, setUser] = useState<any>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user_data');
    const token = localStorage.getItem('auth_token');

    // Preliminary set to allow immediate initial render (UX)
    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
    }

    // Security Audit Fix: Validate token immediately
    const verifyToken = async () => {
      if (!token) {
        setIsVerifying(false);
        return;
      }
      try {
        const response = await fetch('/api/user', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const verifiedUser = await response.json();
          // Overwrite local storage to block tampering
          localStorage.setItem('user_data', JSON.stringify(verifiedUser));
          setUser(verifiedUser);
        } else {
          // Token is invalid, expired, or user data was tampered and backend rejected
          handleLogout();
        }
      } catch (error) {
        console.error("Token verification failed", error);
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();

    // Dynamic PWA Theme Color Logic
    const updateThemeColor = () => {
      const isMobile = window.innerWidth < 768;
      const themeColor = isMobile ? '#2563eb' : '#7c3aed'; // Blue-600 vs Purple-600 (Primary)

      let metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (!metaThemeColor) {
        metaThemeColor = document.createElement('meta');
        metaThemeColor.setAttribute('name', 'theme-color');
        document.head.appendChild(metaThemeColor);
      }
      metaThemeColor.setAttribute('content', themeColor);
    };

    // Initial check
    updateThemeColor();

    // Mobile detection (reactive to resize) + theme color update
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', updateThemeColor);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', updateThemeColor);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Simplified Auth Flow for Phase 2 Verification
  const handleLoginSuccess = (userData: any) => {
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    setUser(null);
  };

  if (isVerifying && !user) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400">Verifying session...</div>;
  }

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  if (user.role_type === 'manager') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="max-w-lg w-full bg-white border border-gray-200 rounded-3xl p-8 shadow-sm text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-gray-400 mb-3">Milestone Build</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Manager flow is hidden in this timeline</h1>
          <p className="text-sm text-gray-500 mb-6">
            This rollback build only keeps mobile crew, mobile supervisor, and the desktop supervisor dashboard.
          </p>
          <button
            onClick={handleLogout}
            className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800 transition"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // Supervisor Flow
  if (user.role_type === 'supervisor') {
    if (isMobile) {
      return <SupervisorMobileApp />;
    }

    return (
      <SupervisorLayout onLogout={handleLogout}>
        <SupervisorDashboard user={user} />
      </SupervisorLayout>
    );
  }

  // Crew Flow
  if (user.role_type === 'crew' || user.role_type === 'employee') {
    return <CrewMobileApp user={user} onLogout={handleLogout} />;
  }

  return <div>Role not supported yet.</div>;
}

export default App;
