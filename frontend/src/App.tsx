import { useState, useEffect } from 'react';
import LoginPage from './general/LoginPage';
import ManagerLayout from './desktop - manager/ManagerLayout';
import ManagerDashboard from './desktop - manager/ManagerDashboard';
import SupervisorLayout from './desktop - supervisor/SupervisorLayout';
import SupervisorDashboard from './desktop - supervisor/SupervisorDashboard';
import SupervisorMobileApp from './mobile - supervisor/SupervisorMobileApp';
import SupervisorPerformance from './desktop - supervisor/SupervisorPerformance';
import CrewMobileApp from './mobile - crew/CrewMobileApp';

function App() {
  const [user, setUser] = useState<any>(null);
  const [activeSupervisorPage, setActiveSupervisorPage] = useState<'employees' | 'performance'>('employees');

  useEffect(() => {
    const storedUser = localStorage.getItem('user_data');
    const token = localStorage.getItem('auth_token');
    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
    }

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

    // Listen to resize
    window.addEventListener('resize', updateThemeColor);

    return () => window.removeEventListener('resize', updateThemeColor);
  }, []);

  // Simplified Auth Flow for Phase 2 Verification
  const handleLoginSuccess = (userData: any) => {
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    setUser(null);
    setActiveSupervisorPage('employees'); // Reset
  };

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
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
    // Simple mobile check (you can move this to a hook later if needed)
    const isMobile = window.innerWidth < 768;

    // Re-check on resize (optional for dev convenience)
    // useEffect(() => { ... }) - omitted for brevity, initial check is usually enough for "Load as Mobile"

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
  // Crew Flow
  if (user.role_type === 'crew' || user.role_type === 'employee') {
    return <CrewMobileApp user={user} onLogout={handleLogout} />;
  }

  return <div>Role not supported yet.</div>;
}

export default App;
