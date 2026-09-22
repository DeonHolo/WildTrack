import { AcademicDataWorkspace } from '../components/workspace/AcademicDataWorkspace.jsx';
import { PageHeader } from '../components/ui.jsx';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';

export function AcademicDataPage() {
  const { activeWorkspaceId, session } = useWorkspaceSession();

  return (
    <div className="page-stack wt-academic-data-page">
      <PageHeader
        title="Academic data"
        description="Edit WildTrack's imported academic records in a spreadsheet-style grid. Changes stay inside WildTrack and never write back to Google Sheets."
      />
      <AcademicDataWorkspace workspaceId={activeWorkspaceId} cacheScope={session?.authenticated ? session.googleSubject || session.email : null} />
    </div>
  );
}
