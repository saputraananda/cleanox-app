import { Route } from 'react-router-dom';
import { PrivateRoute } from '@shared/components/RouteGuards.jsx';
import MorningWorkUnlockGate from '@mobile/components/MorningWorkUnlockGate.jsx';
import MobileWorkerHomePage from '@mobile/pages/MobileWorkerHomePage.jsx';
import MobileWorkerAttendancePage from '@mobile/pages/MobileWorkerAttendancePage.jsx';
import MobileWorkerTasksPage from '@mobile/pages/MobileWorkerTasksPage.jsx';
import MobileWorkerTaskSurveyPage from '@mobile/pages/MobileWorkerTaskSurveyPage.jsx';
import MobileWorkerKebersihanPage from '@mobile/pages/MobileWorkerKebersihanPage.jsx';
import MobileWorkerCalendarPage from '@mobile/pages/MobileWorkerCalendarPage.jsx';
import MobileWorkerProfilePage from '@mobile/pages/MobileWorkerProfilePage.jsx';
import MobileWorkerRiwayatPage from '@mobile/pages/MobileWorkerRiwayatPage.jsx';
import MobileWorkerLeavePage from '@mobile/pages/MobileWorkerLeavePage.jsx';
import MobileWorkerGroomingPage from '@mobile/pages/MobileWorkerGroomingPage.jsx';

function withMorningUnlock(page) {
  return (
    <PrivateRoute companyIds={[3]}>
      <MorningWorkUnlockGate>{page}</MorningWorkUnlockGate>
    </PrivateRoute>
  );
}

const mobileRoutes = [
  <Route
    key="mobile-home"
    path="/mobile-worker"
    element={
      <PrivateRoute companyIds={[3]}>
        <MobileWorkerHomePage />
      </PrivateRoute>
    }
  />,
  <Route
    key="mobile-attendance"
    path="/mobile-worker/attendance"
    element={
      <PrivateRoute companyIds={[3]}>
        <MobileWorkerAttendancePage />
      </PrivateRoute>
    }
  />,
  <Route
    key="mobile-tasks"
    path="/mobile-worker/tasks"
    element={withMorningUnlock(<MobileWorkerTasksPage />)}
  />,
  <Route
    key="mobile-survey"
    path="/mobile-worker/tasks/:assignmentId/survey"
    element={withMorningUnlock(<MobileWorkerTaskSurveyPage />)}
  />,
  <Route
    key="mobile-kebersihan"
    path="/mobile-worker/kebersihan"
    element={
      <PrivateRoute companyIds={[3]}>
        <MobileWorkerKebersihanPage />
      </PrivateRoute>
    }
  />,
  <Route
    key="mobile-calendar"
    path="/mobile-worker/calendar"
    element={withMorningUnlock(<MobileWorkerCalendarPage />)}
  />,
  <Route
    key="mobile-profile"
    path="/mobile-worker/profile"
    element={
      <PrivateRoute companyIds={[3]}>
        <MobileWorkerProfilePage />
      </PrivateRoute>
    }
  />,
  <Route
    key="mobile-riwayat"
    path="/mobile-worker/riwayat"
    element={
      <PrivateRoute companyIds={[3]}>
        <MobileWorkerRiwayatPage />
      </PrivateRoute>
    }
  />,
  <Route
    key="mobile-leave"
    path="/mobile-worker/leave"
    element={withMorningUnlock(<MobileWorkerLeavePage />)}
  />,
  <Route
    key="mobile-grooming"
    path="/mobile-worker/grooming"
    element={
      <PrivateRoute companyIds={[3]}>
        <MobileWorkerGroomingPage />
      </PrivateRoute>
    }
  />,
];

export default mobileRoutes;
