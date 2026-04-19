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

  useEffect(() => {
    if (user?.role_type === 'manager') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');
      setUser(null);
    }
  }, [user]);

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

  // Supervisor Flow
  if (user.role_type === 'supervisor') {
    if (isMobile) {
      return <SupervisorMobileApp />;
    }

    return (
      <SupervisorLayout onLogout={handleLogout}>
        <SupervisorDashboard />
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
