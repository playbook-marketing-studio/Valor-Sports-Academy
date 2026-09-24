import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import { Navigate } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Home from '@/pages/Home';
import Workouts from '@/pages/Workouts';
import Nutrition from '@/pages/Nutrition';
import ProgressPage from '@/pages/Progress';
import WorkoutSession from '@/pages/WorkoutSession';
import AdminBookings from '@/pages/admin/Bookings';
import AdminAthletes from '@/pages/admin/Athletes';
import AthleteDetail from '@/pages/admin/AthleteDetail';
import AdminEnrollment from '@/pages/admin/Enrollment';
import { ProgramsList, ProgramDetail } from '@/pages/admin/Programs';
import ClassLog from '@/pages/admin/ClassLog';
import Today from '@/pages/admin/Today';
import { useAuth as useAuthForHome } from '@/lib/AuthContext';

// Staff land on Today; parents on their athlete home.
const HomeRoute = () => { const { user } = useAuthForHome(); return user?.role === 'admin' ? <Today /> : <Home />; };
import RequireEnrollment from '@/components/RequireEnrollment';
import Welcome from '@/pages/public/Welcome';
import Paid from '@/pages/public/Paid';
import ExternalRedirect from '@/components/ExternalRedirect';
import { SITE_ASSESSMENT_URL } from '@/lib/valor';
import RequireRole from '@/components/RequireRole';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* Cold leads book the free assessment on the website, not here. */}
      <Route path="/book/*" element={<ExternalRedirect to={SITE_ASSESSMENT_URL} />} />
      {/* Parent lands here from the login link a coach sends after the assessment. */}
      <Route path="/welcome" element={<Welcome />} />
      {/* Stripe sends the parent's phone here after paying from the coach's QR code. */}
      <Route path="/paid" element={<Paid />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomeRoute />} />
          {/* included with enrollment: unpaid families get the enroll-and-pay screen */}
          <Route element={<RequireEnrollment />}>
            <Route path="/workouts" element={<Workouts />} />
            <Route path="/nutrition" element={<Nutrition />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/workout/:workoutId" element={<WorkoutSession />} />
          </Route>
          <Route element={<RequireRole roles={['admin']} />}>
            <Route path="/admin/bookings" element={<AdminBookings />} />
            <Route path="/admin/athletes" element={<AdminAthletes />} />
            <Route path="/admin/athletes/:id" element={<AthleteDetail />} />
            <Route path="/admin/enrollment" element={<AdminEnrollment />} />
            <Route path="/admin/programs" element={<ProgramsList />} />
            <Route path="/admin/programs/:id" element={<ProgramDetail />} />
            <Route path="/admin/log" element={<ClassLog />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App