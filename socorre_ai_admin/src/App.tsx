import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme } from './utils/theme';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Categories from './pages/Categories';
import Mechanics from './pages/Mechanics';
import Services from './pages/Services';
import Appointments from './pages/Appointments';
import Reviews from './pages/Reviews';
import Partners from './pages/Partners';
import EmergencyRequests from './pages/EmergencyRequests';
import DeliveryOrders from './pages/DeliveryOrders';
import PurchaseOrders from './pages/PurchaseOrders';
import Wallets from './pages/Wallets';
import Disputes from './pages/Disputes';
import DocumentApproval from './pages/DocumentApproval';

// Componente para verificar autenticação
const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('admin_token');
  
  // Se não há token, redireciona para login
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/users"
            element={
              <PrivateRoute>
                <Layout>
                  <Users />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/categories"
            element={
              <PrivateRoute>
                <Layout>
                  <Categories />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/mechanics"
            element={
              <PrivateRoute>
                <Layout>
                  <Mechanics />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/services"
            element={
              <PrivateRoute>
                <Layout>
                  <Services />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/appointments"
            element={
              <PrivateRoute>
                <Layout>
                  <Appointments />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/reviews"
            element={
              <PrivateRoute>
                <Layout>
                  <Reviews />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/partners"
            element={
              <PrivateRoute>
                <Layout>
                  <Partners />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/emergency-requests"
            element={
              <PrivateRoute>
                <Layout>
                  <EmergencyRequests />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/delivery-orders"
            element={
              <PrivateRoute>
                <Layout>
                  <DeliveryOrders />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/purchase-orders"
            element={
              <PrivateRoute>
                <Layout>
                  <PurchaseOrders />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/wallets"
            element={
              <PrivateRoute>
                <Layout>
                  <Wallets />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/disputes"
            element={
              <PrivateRoute>
                <Layout>
                  <Disputes />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/document-approval"
            element={
              <PrivateRoute>
                <Layout>
                  <DocumentApproval />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <PrivateRoute>
                <Layout>
                  <div>Página de Configurações (em desenvolvimento)</div>
                </Layout>
              </PrivateRoute>
            }
          />
          <Route path="/" element={
            <PrivateRoute>
              <Navigate to="/dashboard" replace />
            </PrivateRoute>
          } />
          {/* Rota catch-all para URLs não encontradas */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
