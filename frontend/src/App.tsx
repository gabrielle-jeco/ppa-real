import { useState, useEffect } from 'react';
import LoginPage from './general/LoginPage';
import ManagerLayout from './desktop - manager/ManagerLayout';
import ManagerDashboard from './desktop - manager/ManagerDashboard';
import AdminLayout from './desktop - admin/AdminLayout';
import AdminDashboard from './desktop - admin/AdminDashboard';
import SupervisorLayout from './desktop - supervisor/SupervisorLayout';
import SupervisorDashboard from './desktop - supervisor/SupervisorDashboard';
import SupervisorMobileApp from './mobile - supervisor/SupervisorMobileApp';
import SupervisorPerformance from './desktop - supervisor/SupervisorPerformance';
import CrewMobileApp from './mobile - crew/CrewMobileApp';

function App() {
  const [user, setUser] = useState<any>(null);
  const [activeSupervisorPage, setActiveSupervisorPage] = useState<'employees' | 'performance'>('employees');
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user_data');
    const token = localStorage.getItem('auth_token');
    const sessionExpiresAt = localStorage.getItem('session_expires_at');
    const sessionExpired = !!sessionExpiresAt && Date.now() >= new Date(sessionExpiresAt).getTime();

    if (sessionExpired) {
      handleLogout();
      setIsVerifying(false);
      return;
    }

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
    const sessionTimer = window.setInterval(() => {
      const expiresAt = localStorage.getItem('session_expires_at');
      if (expiresAt && Date.now() >= new Date(expiresAt).getTime()) {
        handleLogout();
      }
    }, 60 * 1000);

    window.addEventListener('resize', updateThemeColor);
    window.addEventListener('resize', handleResize);

    return () => {
      window.clearInterval(sessionTimer);
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
    localStorage.removeItem('session_expires_at');
    setUser(null);
    setActiveSupervisorPage('employees'); // Reset
  };

  if (isVerifying && !user) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400">Verifying session...</div>;
  }

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  if (user.role_type === 'superadmin') {
    return (
      <AdminLayout onLogout={handleLogout}>
        <AdminDashboard />
      </AdminLayout>
    );
  }

  // ALLOW SM and RM
  if (user.role_type === 'manager') {
    return (
      <ManagerLayout user={user} onLogout={handleLogout}>
        <ManagerDashboard />
      </ManagerLayout>
    );
  }

  // Supervisor Flow
  if (user.role_type === 'supervisor') {
    if (isMobile) {
      return <SupervisorMobileApp />;
    }

    return (
      <SupervisorLayout
        activePage={activeSupervisorPage}
        onPageChange={setActiveSupervisorPage}
        onLogout={handleLogout}
      >
        {activeSupervisorPage === 'employees' ? (
          <SupervisorDashboard />
        ) : (
          <SupervisorPerformance />
        )}
      </SupervisorLayout>
    );
  }

  // Crew Flow
  if (user.role_type === 'crew' || user.role_type === 'employee') {
    return <CrewMobileApp user={user} onLogout={handleLogout} />;
  }

  return <UnsupportedRolePage role={user.role_type} onLogout={handleLogout} />;
}

function UnsupportedRolePage({ role, onLogout }: { role?: string; onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6 font-sans text-gray-800">
      <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-xl shadow-gray-100">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50 text-primary">
          <span className="text-2xl font-black">!</span>
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">Access Check</p>
        <h1 className="mt-2 text-2xl font-black text-gray-900">Role belum didukung</h1>
        <p className="mt-3 text-sm leading-6 text-gray-500">
          Akun ini berhasil login, tapi role <span className="font-bold text-gray-800">{role || 'unknown'}</span> belum
          terhubung ke halaman YoDaily. Silakan hubungi admin untuk mapping role.
        </p>
        <button
          onClick={onLogout}
          className="mt-6 w-full rounded-xl bg-primary py-3 font-bold text-white shadow-lg shadow-purple-100 transition hover:bg-primary-dark"
        >
          Logout
        </button>
      </div>
    </div>
  );
}

export default App;
