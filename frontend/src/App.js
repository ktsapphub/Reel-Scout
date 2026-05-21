import { useState, useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import HistoryPage from "@/pages/HistoryPage";
import AuditLogPage from "@/pages/AuditLogPage";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [userEmail, setUserEmail] = useState(localStorage.getItem("userEmail"));

  const handleLogin = (newToken, email) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("userEmail", email);
    setToken(newToken);
    setUserEmail(email);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userEmail");
    setToken(null);
    setUserEmail(null);
  };

  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              token ? (
                <Navigate to="/" replace />
              ) : (
                <LoginPage onLogin={handleLogin} backendUrl={BACKEND_URL} />
              )
            }
          />
          <Route
            path="/"
            element={
              token ? (
                <DashboardPage
                  token={token}
                  userEmail={userEmail}
                  onLogout={handleLogout}
                  backendUrl={BACKEND_URL}
                />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/history"
            element={
              token ? (
                <HistoryPage
                  token={token}
                  userEmail={userEmail}
                  onLogout={handleLogout}
                  backendUrl={BACKEND_URL}
                />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/audit-log"
            element={
              token ? (
                <AuditLogPage
                  token={token}
                  userEmail={userEmail}
                  backendUrl={BACKEND_URL}
                />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </>
  );
}

export default App;
