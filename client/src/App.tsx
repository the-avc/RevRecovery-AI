import React, { useState, Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import AuditLogPage from './pages/AuditLogPage';
import TransactionDetailPage from './pages/TransactionDetailPage';
import PaymentCheckoutPage from './pages/PaymentCheckoutPage';

// Lazy-load Three.js orbs — avoids blocking initial paint
const FloatingOrbs = lazy(() => import('./components/three/FloatingOrbs'));

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-bg-primary relative">
      {/* Three.js ambient background — lazy loaded */}
      <Suspense fallback={null}>
        <FloatingOrbs />
      </Suspense>

      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-screen lg:pl-64 relative z-10">
        {/* Mobile top bar */}
        <TopBar onMenuClick={() => setSidebarOpen(true)} />

        {/* Page content */}
        <main className="flex-1 page-content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/transactions/:id" element={<TransactionDetailPage />} />
            <Route path="/pay/:id" element={<PaymentCheckoutPage />} />
            <Route path="/audit" element={<AuditLogPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
