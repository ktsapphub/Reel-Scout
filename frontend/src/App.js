import { useState, useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import LandingPage from "@/pages/LandingPage";
import DashboardPage from "@/pages/DashboardPage";
import HistoryPage from "@/pages/HistoryPage";
import AuditLogPage from "@/pages/AuditLogPage";
import SettingsPage from "@/pages/SettingsPage";
import { safeGet, safeSet, safeRemove } from "@/lib/safeStorage";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function App() {
  const [token, setToken] = useState(() => safeGet("token"));
  const [userEmail, setUserEmail] = useState(() => safeGet("userEmail"));

  // Keep the browser tab title in sync with the configured brand.
  useEffect(() => {
    document.title = `${BRAND_NAME} · ${BRAND_TAGLINE}`;
  }, []);

  // Cross-tab logout sync: if another tab clears the token, drop session here too.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "token" && !e.newValue) {
        setToken(null);
        setUserEmail(null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleLogin = (newToken, email) => {
    safeSet("token", newToken);
    safeSet("userEmail", email);
    setToken(newToken);
    setUserEmail(email);
  };

  const handleLogout = () => {
    safeRemove("token");
    safeRemove("userEmail");
    setToken(null);
    setUserEmail(null);
  };

  const requireAuth = (element) =>
    token ? element : <Navigate to="/login" replace />;

  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              token ? <Navigate to="/" replace />
                : <LandingPage onLogin={handleLogin} backendUrl={BACKEND_URL} />
            }
          />
          <Route path="/" element={requireAuth(
            <DashboardPage token={token} userEmail={userEmail} onLogout={handleLogout} backendUrl={BACKEND_URL} />
          )} />
          <Route path="/history" element={requireAuth(
            <HistoryPage token={token} userEmail={userEmail} onLogout={handleLogout} backendUrl={BACKEND_URL} />
          )} />
          <Route path="/audit-log" element={requireAuth(
            <AuditLogPage token={token} userEmail={userEmail} backendUrl={BACKEND_URL} />
          )} />
          <Route path="/settings" element={requireAuth(
            <SettingsPage token={token} userEmail={userEmail} backendUrl={BACKEND_URL} />
          )} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </>
  );
}

export default App;
