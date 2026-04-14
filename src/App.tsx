import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

// Admin pages are large and only needed for a small subset of users —
// lazy-load them so the main game bundle stays slim.
const Admin = lazy(() => import("./pages/Admin.tsx"));
const AdminLogin = lazy(() => import("./pages/AdminLogin.tsx"));

const queryClient = new QueryClient();

const AdminFallback = () => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0f',
      color: 'rgba(255,255,255,0.6)',
      fontFamily: "'Tajawal', system-ui, sans-serif",
      fontSize: 14,
    }}
  >
    Loading admin…
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route
            path="/admin"
            element={
              <Suspense fallback={<AdminFallback />}>
                <Admin />
              </Suspense>
            }
          />
          <Route
            path="/admin/login"
            element={
              <Suspense fallback={<AdminFallback />}>
                <AdminLogin />
              </Suspense>
            }
          />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
