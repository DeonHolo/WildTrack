import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell, GlobalDevPreview } from '../components/ui.jsx';
import { WorkflowProvider } from './WorkflowContext.jsx';
import { ArchivePage } from '../pages/ArchivePage.jsx';
import { AdviserViewPage } from '../pages/AdviserViewPage.jsx';
import { CommandCenterPage } from '../pages/CommandCenterPage.jsx';
import { FormsPage } from '../pages/FormsPage.jsx';
import { PublicSubmissionPage } from '../pages/PublicSubmissionPage.jsx';
import { RegisterPage } from '../pages/RegisterPage.jsx';
import { ReviewPage } from '../pages/ReviewPage.jsx';
import { StudentStatusPage } from '../pages/StudentStatusPage.jsx';
import { TrackerPage } from '../pages/TrackerPage.jsx';
import { WorkspacePage } from '../pages/WorkspacePage.jsx';

export default function App() {
  return (
    <WorkflowProvider>
      <Routes>
        <Route path="/w/:workspaceKey/submit/:slug" element={<PublicSubmissionPage />} />
        <Route path="/submit/:slug" element={<PublicSubmissionPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<RegisterPage />} />
        <Route path="/student" element={<StudentStatusPage />} />
        <Route path="/" element={<AppShell><CommandCenterPage /></AppShell>} />
        <Route path="/forms" element={<AppShell><FormsPage /></AppShell>} />
        <Route path="/tracker" element={<AppShell><TrackerPage /></AppShell>} />
        <Route path="/review" element={<AppShell><ReviewPage /></AppShell>} />
        <Route path="/adviser" element={<AppShell><AdviserViewPage /></AppShell>} />
        <Route path="/archive" element={<AppShell><ArchivePage /></AppShell>} />
        <Route path="/workspace" element={<AppShell><WorkspacePage /></AppShell>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <GlobalDevPreview />
    </WorkflowProvider>
  );
}
