import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  calculateDaysLate,
  applyClassRecordImport,
  deriveAttemptFlags,
  deliverableUsesDocumentCheck,
  findDeliverableForUpsert,
  findOwnedResponse,
  findStudent,
  findWorkspace,
  firstSubmissionLink,
  getDeliverable,
  getTrackerColumn,
  hasResponseConflict,
  hashArchiveRecord,
  importPublicClassRecord,
  importPublicSheetSource,
  loadActiveWorkspaceId,
  loadStudentAccounts,
  loadWorkflowState,
  loadWorkspaceCatalog,
  materializeStudentSession,
  mergeDeliverables,
  normalizeStudentNumber,
  resetWorkflowState,
  saveActiveWorkspaceId,
  saveActiveStudentAccountEmail,
  saveStudentAccounts,
  saveWorkflowState,
  saveWorkspaceCatalog,
  slugify,
  sortDeliverables,
  upsertDeliverable,
  validateSubmission,
  valuesChanged
} from '../lib/workflow.js';
import { disableGoogleAutoSelect } from '../lib/googleIdentitySession.js';
import {
  createWorkspace as createBackendWorkspace,
  deleteDocumentTemplate,
  describeSnapshotFailures,
  getApiBaseUrl,
  getBackendSnapshot,
  getCurrentSession,
  getWorkspaces as getBackendWorkspaces,
  importSheetSource as importBackendSheetSource,
  logout as apiLogout,
  runDocumentCheck as requestDocumentCheck,
  saveBackendDeliverable,
  uploadDocumentTemplate,
  uploadDriveDocumentTemplate,
  writeTrackerValue
} from '../lib/api.js';

const WorkflowContext = createContext(null);

export function WorkflowProvider({ children, allowLocalImportFallback = import.meta.env.DEV }) {
  const [workspaces, setWorkspaces] = useState(() => loadWorkspaceCatalog());
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => loadActiveWorkspaceId(loadWorkspaceCatalog()));
  const activeWorkspace = activeWorkspaceId
    ? workspaces.find((workspace) => workspace.id === activeWorkspaceId) || workspaces[0]
    : workspaces.length === 1 ? workspaces[0] : null;
  const needsWorkspaceChoice = !activeWorkspaceId && workspaces.length > 1;
  const effectiveWorkspaceId = activeWorkspaceId || activeWorkspace?.id || null;
  const [state, setState] = useState(() => loadWorkflowState(effectiveWorkspaceId, activeWorkspace));
  const [session, setSession] = useState(null);
  const backendBootstrapped = useRef(false);
  const activeWorkspaceRef = useRef(activeWorkspaceId);

  const refreshSession = useCallback(async () => {
    try {
      const data = await getCurrentSession();
      setSession(data);
      return data;
    } catch {
      const anonymous = { authenticated: false, roles: [] };
      setSession(anonymous);
      return anonymous;
    }
  }, []);

  const refreshBackendData = useCallback(async ({ silent = false } = {}) => {
    try {
      const workspaceId = activeWorkspaceRef.current;
      const snapshot = await getBackendSnapshot(workspaceId);
      if (activeWorkspaceRef.current !== workspaceId) return { ok: false, error: 'Workspace changed while data was loading.' };
      const failureMessage = describeSnapshotFailures(snapshot.failures);
      setState((current) => applyBackendSnapshot(current, snapshot, {
        status: 'Backend data loaded.',
        enabled: true
      }));
      if (failureMessage) return { ok: false, error: failureMessage, snapshot, partial: true };
      return { ok: true, snapshot };
    } catch (error) {
      if (!silent) {
        setState((current) => ({
          ...current,
          backendSync: {
            enabled: false,
            apiBaseUrl: getApiBaseUrl(),
            status: 'Backend unavailable',
            lastError: error.message,
            lastLoadedAt: new Date().toISOString()
          }
        }));
      }
      return { ok: false, error: error.message };
    }
  }, []);

  useEffect(() => {
    refreshSession();
    if (backendBootstrapped.current) return;
    backendBootstrapped.current = true;
    getBackendWorkspaces()
      .then((backendWorkspaces) => {
        if (!backendWorkspaces.length) return;
        setWorkspaces(backendWorkspaces);
        saveWorkspaceCatalog(backendWorkspaces);
        const currentExists = backendWorkspaces.some((workspace) => workspace.id === activeWorkspaceRef.current);
        if (!currentExists) {
          if (backendWorkspaces.length === 1) {
            const nextId = backendWorkspaces[0].id;
            activeWorkspaceRef.current = nextId;
            setActiveWorkspaceId(nextId);
            saveActiveWorkspaceId(nextId);
            setState((current) => ({
              ...loadWorkflowState(nextId, backendWorkspaces[0]),
              studentAccounts: current.studentAccounts || [],
              activeAccountEmail: current.activeAccountEmail || ''
            }));
            getBackendSnapshot(nextId)
              .then((snapshot) => {
                setState((current) => applyBackendSnapshot(current, snapshot, {
                  status: 'Backend data loaded.',
                  enabled: true
                }));
              })
              .catch(() => {});
          }
          // When multiple workspaces exist and no preference is stored,
          // leave activeWorkspaceId null so the chooser renders (AC 4).
        }
      })
      .catch(() => {});
    refreshBackendData({ silent: true });
  }, [refreshBackendData, refreshSession]);

  useEffect(() => {
    const wsId = state.workspaceId || activeWorkspaceRef.current;
    if (wsId) saveWorkflowState(state, wsId);
  }, [state]);

  const switchWorkspace = useCallback(async (workspaceIdOrPublicKey) => {
    const target = findWorkspace(workspaces, workspaceIdOrPublicKey);
    if (!target) return { ok: false, error: 'Workspace was not found.' };
    const workspaceId = target.id;
    if (workspaceId === activeWorkspaceRef.current) return { ok: true, workspace: target };

    saveWorkflowState(state, activeWorkspaceRef.current);
    activeWorkspaceRef.current = workspaceId;
    setActiveWorkspaceId(workspaceId);
    saveActiveWorkspaceId(workspaceId);
    const localState = loadWorkflowState(workspaceId, target);
    setState(localState);

    try {
      const snapshot = await getBackendSnapshot(workspaceId);
      if (activeWorkspaceRef.current === workspaceId) {
        setState((current) => applyBackendSnapshot(current, snapshot, {
          status: 'Workspace data loaded.',
          enabled: true
        }));
      }
      return { ok: true, workspace: target };
    } catch (error) {
      if (activeWorkspaceRef.current === workspaceId) {
        setState((current) => ({
          ...current,
          backendSync: {
            enabled: false,
            apiBaseUrl: getApiBaseUrl(),
            status: 'Using saved workspace data.',
            lastError: error.message,
            lastLoadedAt: new Date().toISOString()
          }
        }));
      }
      return { ok: true, workspace: target, localOnly: true };
    }
  }, [state, workspaces]);

  const createWorkspace = useCallback(async (payload) => {
    let workspace;
    try {
      workspace = await createBackendWorkspace({ ...payload, active: true });
    } catch {
      workspace = {
        id: crypto.randomUUID(),
        ...payload,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }
    setWorkspaces((current) => {
      const next = [...current.filter((item) => item.id !== workspace.id), workspace];
      saveWorkspaceCatalog(next);
      return next;
    });
    saveWorkflowState(state, activeWorkspaceRef.current);
    activeWorkspaceRef.current = workspace.id;
    setActiveWorkspaceId(workspace.id);
    saveActiveWorkspaceId(workspace.id);
    setState(loadWorkflowState(workspace.id, workspace));
    return { ok: true, workspace };
  }, [state]);

  const publishDeliverable = useCallback((payload) => {
    const workspaceId = activeWorkspaceRef.current;
    if (workspaceId) {
      saveBackendDeliverable(workspaceId, payload).catch(() => null);
    }
    setState((current) => {
      const existingDeliverable = findDeliverableForUpsert(current.deliverables, payload);
      const trackerColumn = getTrackerColumn(current, payload.trackerColumn);
      const shortTitle = payload.shortTitle || trackerColumn?.label || payload.trackerColumn;
      const title = payload.title || `${shortTitle} Submission`;
      const deliverable = {
        ...(existingDeliverable || {}),
        title,
        shortTitle,
        status: payload.status || 'Published',
        fields: payload.fields,
        ...payload
      };
      const nextDeliverables = upsertDeliverable(current.deliverables, deliverable);
      const savedDeliverable = nextDeliverables.find((item) => item.trackerColumn === payload.trackerColumn);
      return {
        ...current,
        deliverables: sortDeliverables(current, nextDeliverables),
        activity: [{ id: `act-${Date.now()}`, at: new Date().toISOString(), text: `${existingDeliverable ? 'Updated' : 'Published'} ${savedDeliverable?.title || title}.` }, ...current.activity]
      };
    });
  }, []);

  const removeDeliverable = useCallback((deliverableId) => {
    setState((current) => {
      const deliverable = current.deliverables.find((item) => item.id === deliverableId);
      return {
        ...current,
        deliverables: current.deliverables.map((item) => item.id === deliverableId ? { ...item, status: 'Unpublished' } : item),
        activity: [{ id: `act-${Date.now()}`, at: new Date().toISOString(), text: `Unpublished ${deliverable?.title || 'a form'}. Responses were preserved.` }, ...current.activity]
      };
    });
  }, []);

  const connectSheetSource = useCallback(async (sourceType, payload) => {
    const workspaceId = activeWorkspaceRef.current;
    const workspaceState = state;
    const previewPromise = importPublicSheetSource(sourceType, payload, workspaceState).catch(() => null);

    try {
      const backendImport = await importBackendSheetSource(sourceType, {
        ...payload,
        displayName: sourceType === 'tracker' ? payload.trackerSheet : payload.name
      }, workspaceId);
      const snapshot = await getBackendSnapshot(workspaceId);
      const preview = await previewPromise;
      if (activeWorkspaceRef.current !== workspaceId) {
        return { ok: false, error: 'Workspace changed before the Sheet import finished.' };
      }
      const imported = buildBackendImportResult(sourceType, backendImport, snapshot, preview);
      setState((current) => {
        const next = applyClassRecordImport(current, { ...payload, sourceType }, imported);
        return applyBackendSnapshot(next, snapshot, {
          enabled: true,
          status: `${imported.importSummary?.sourceType || 'Sheet'} imported through backend.`
        });
      });
      return imported;
    } catch (backendError) {
      if (activeWorkspaceRef.current !== workspaceId) {
        return { ok: false, error: 'Workspace changed before the Sheet import finished.' };
      }
      if (!allowLocalImportFallback) {
        setState((current) => ({
          ...current,
          backendSync: {
            enabled: false,
            apiBaseUrl: getApiBaseUrl(),
            status: `${describeSheetSourceType(sourceType)} import failed. The Sheet was not saved to the backend.`,
            lastError: backendError.message,
            lastLoadedAt: new Date().toISOString()
          }
        }));
        return { ok: false, error: backendError.message, backendError: backendError.message };
      }
      const imported = await previewPromise || await importPublicSheetSource(sourceType, payload, workspaceState);
      const fallbackImport = {
        ...imported,
        backendError: backendError.message
      };
      setState((current) => {
        const next = applyClassRecordImport(current, { ...payload, sourceType }, fallbackImport);
        return {
          ...next,
          backendSync: {
            enabled: false,
            apiBaseUrl: getApiBaseUrl(),
            status: imported.ok ? 'Local Sheet import used (development only).' : 'Import failed.',
            lastError: backendError.message,
            lastLoadedAt: new Date().toISOString()
          }
        };
      });
      return fallbackImport;
    }
  }, [allowLocalImportFallback, state]);
  const connectClassRecord = useCallback(async (payload) => {
    return connectSheetSource('tracker', payload);
  }, [connectSheetSource]);

  const generateFormsFromSuggestions = useCallback((suggestions = []) => {
    if (!suggestions.length) return;
    const workspaceId = activeWorkspaceRef.current;
    setState((current) => {
      const now = Date.now();
      const nextDeliverables = [...current.deliverables];
      const created = [];
      const sortedSuggestions = [...suggestions].sort((first, second) => {
        const firstTime = Date.parse(first.dueAt || '');
        const secondTime = Date.parse(second.dueAt || '');
        if (!Number.isNaN(firstTime) && !Number.isNaN(secondTime) && firstTime !== secondTime) return firstTime - secondTime;
        const firstColumn = getTrackerColumn(current, first.trackerColumn);
        const secondColumn = getTrackerColumn(current, second.trackerColumn);
        const columns = current.trackerColumns || [];
        const firstIndex = columns.findIndex((column) => column.id === firstColumn?.id);
        const secondIndex = columns.findIndex((column) => column.id === secondColumn?.id);
        return (firstIndex < 0 ? 9999 : firstIndex) - (secondIndex < 0 ? 9999 : secondIndex);
      });
      sortedSuggestions.forEach((suggestion, index) => {
        const trackerColumn = getTrackerColumn(current, suggestion.trackerColumn);
        const shortTitle = trackerColumn?.label || suggestion.shortTitle || suggestion.trackerColumn;
        const existingIndex = nextDeliverables.findIndex((item) => item.trackerColumn === suggestion.trackerColumn);
        const existing = existingIndex >= 0 ? nextDeliverables[existingIndex] : null;
        const deliverable = {
          ...(existing || {}),
          id: existing?.id || `deliv-generated-${now}-${index}`,
          slug: existing?.slug || slugify(suggestion.title || `${shortTitle} Submission`),
          title: suggestion.title || `${shortTitle} Submission`,
          shortTitle,
          dueAt: `${suggestion.dueAt}:00+08:00`,
          trackerColumn: suggestion.trackerColumn,
          audience: 'Students',
          status: 'Published',
          instructions: suggestion.pdfRequired ? `Submit your ${shortTitle} as a PDF Drive file.` : `Submit the required link for ${shortTitle}.`,
          fields: suggestion.pdfRequired
            ? [{ id: 'documentPdf', label: 'PDF Drive Link', type: 'drive', required: true, pdfRequired: true }]
            : [{ id: 'primaryLink', label: 'Submission Link', type: 'url', required: true, pdfRequired: false }]
        };
        if (workspaceId) {
          saveBackendDeliverable(workspaceId, deliverable).catch(() => null);
        }
        if (existingIndex >= 0) nextDeliverables[existingIndex] = deliverable;
        else nextDeliverables.push(deliverable);
        created.push(shortTitle);
      });
      return {
        ...current,
        deliverables: sortDeliverables(current, nextDeliverables),
        classRecord: {
          ...current.classRecord,
          pendingFormSuggestions: [],
          importSummary: current.classRecord.importSummary
            ? { ...current.classRecord.importSummary, suggestedForms: [], formsGenerated: created.length }
            : current.classRecord.importSummary
        },
        activity: [{ id: `act-${Date.now()}`, at: new Date().toISOString(), text: `Generated forms for ${created.join(', ')} from detected deadlines.` }, ...current.activity]
      };
    });
  }, []);

  const registerStudentAccount = useCallback((payload) => {
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email) return { ok: false, error: 'Enter an email address.' };
    const accounts = loadStudentAccounts(state.studentAccounts);
    if (accounts.some((account) => account.email.toLowerCase() === email)) {
      return { ok: false, error: 'An account already exists for this email. Sign in instead.' };
    }

    const account = {
      id: payload.id || `acct-${Date.now()}`,
      email,
      authMethod: payload.authMethod || 'Email',
      workspaceClaims: {},
      createdAt: new Date().toISOString()
    };
    const nextAccounts = [account, ...accounts];
    saveStudentAccounts(nextAccounts);
    saveActiveStudentAccountEmail(account.email);
    setState((current) => {
      return {
        ...current,
        studentAccounts: nextAccounts,
        activeAccountEmail: account.email,
        activeStudentNumber: '',
        activity: [{ id: `act-${Date.now()}`, at: account.createdAt, text: `${account.email} registered a student account.` }, ...current.activity]
      };
    });

    return { ok: true, account: { email } };
  }, [state.studentAccounts]);

  const loginStudentAccount = useCallback((payload) => {
    const accounts = loadStudentAccounts(state.studentAccounts);
    const account = accounts.find((item) => item.email.toLowerCase() === String(payload.email || '').toLowerCase());
    if (!account) return { ok: false, error: 'No student account found for that email.' };
    const claim = account.workspaceClaims?.[activeWorkspaceRef.current];
    saveActiveStudentAccountEmail(account.email);
    setState((current) => materializeStudentSession({
      ...current,
      studentAccounts: accounts,
      activeAccountEmail: account.email,
      activeStudentNumber: claim?.studentNumber || ''
    }, activeWorkspaceRef.current));
    return { ok: true, account };
  }, [state.studentAccounts]);
  const authenticateGoogleAccount = useCallback((identity) => {
    const email = String(identity.email || '').trim().toLowerCase();
    const googleSubject = String(identity.subject || identity.sub || '').trim();
    if (!email || !googleSubject) {
      return { ok: false, error: 'Google sign-in did not return a usable identity.' };
    }

    const accounts = loadStudentAccounts(state.studentAccounts);
    const existing = accounts.find((account) =>
      account.googleSubject === googleSubject || account.email.toLowerCase() === email
    );
    const authenticatedAt = new Date().toISOString();
    const account = {
      ...(existing || {}),
      id: existing?.id || `acct-google-${googleSubject}`,
      email,
      displayName: identity.name || existing?.displayName || '',
      pictureUrl: identity.pictureUrl || existing?.pictureUrl || '',
      googleSubject,
      authMethod: 'Google',
      workspaceClaims: existing?.workspaceClaims || {},
      createdAt: existing?.createdAt || authenticatedAt,
      lastAuthenticatedAt: authenticatedAt
    };
    const nextAccounts = [
      account,
      ...accounts.filter((item) => item.id !== account.id && item.googleSubject !== googleSubject && item.email.toLowerCase() !== email)
    ];

    let targetWorkspaceId = activeWorkspaceRef.current;
    if (!account.workspaceClaims?.[targetWorkspaceId]) {
      const existingClaimedWorkspaceId = Object.keys(account.workspaceClaims || {})[0];
      if (existingClaimedWorkspaceId && workspaces?.some((w) => w.id === existingClaimedWorkspaceId)) {
        targetWorkspaceId = existingClaimedWorkspaceId;
      } else {
        const currentMatch = (state.students || []).some((s) => (s.institutionalEmail || s.email || '').toLowerCase() === email);
        if (!currentMatch && Array.isArray(workspaces)) {
          for (const ws of workspaces) {
            if (ws.id === targetWorkspaceId) continue;
            const wsState = loadWorkflowState(ws.id, ws);
            const found = (wsState.students || []).some((s) => (s.institutionalEmail || s.email || '').toLowerCase() === email);
            if (found) {
              targetWorkspaceId = ws.id;
              break;
            }
          }
        }
      }
    }

    if (targetWorkspaceId !== activeWorkspaceRef.current) {
      activeWorkspaceRef.current = targetWorkspaceId;
      setActiveWorkspaceId(targetWorkspaceId);
      saveActiveWorkspaceId(targetWorkspaceId);
    }

    const claim = account.workspaceClaims?.[targetWorkspaceId];

    saveStudentAccounts(nextAccounts);
    saveActiveStudentAccountEmail(account.email);
    refreshSession();
    setState((current) => materializeStudentSession({
      ...(targetWorkspaceId !== current.workspaceId ? loadWorkflowState(targetWorkspaceId, workspaces?.find((w) => w.id === targetWorkspaceId)) : current),
      studentAccounts: nextAccounts,
      activeAccountEmail: account.email,
      activeStudentNumber: claim?.studentNumber || '',
      activity: [{
        id: `act-${Date.now()}`,
        at: authenticatedAt,
        text: `${account.email} signed in with Google.`
      }, ...current.activity]
    }, targetWorkspaceId));

    return { ok: true, account };
  }, [refreshSession, state.studentAccounts, state.students, workspaces]);

  const logoutStudentAccount = useCallback(() => {
    disableGoogleAutoSelect();
    apiLogout().catch(() => {});
    setSession({ authenticated: false, roles: [] });
    saveActiveStudentAccountEmail('');
    setState((current) => ({
      ...current,
      activeAccountEmail: '',
      activeStudentNumber: ''
    }));
  }, []);

  const logoutStaffSession = useCallback(async () => {
    disableGoogleAutoSelect();
    saveActiveStudentAccountEmail('');
    setSession({ authenticated: false, roles: [] });
    setState((current) => ({
      ...current,
      activeAccountEmail: '',
      activeStudentNumber: ''
    }));
    try {
      await apiLogout();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }, []);

  const claimStudentNumber = useCallback((studentNumber) => {
    const email = state.activeAccountEmail;
    if (!email) return { ok: false, error: 'Continue with Google before connecting a Student Number.' };
    const student = findStudent(state.students, studentNumber);
    if (!student) return { ok: false, error: 'Choose a Student Number from the connected class record.' };

    const claimedAt = new Date().toISOString();
    const globalAccounts = loadStudentAccounts(state.studentAccounts);
    const nextAccounts = globalAccounts.map((account) => account.email.toLowerCase() === email.toLowerCase() ? {
      ...account,
      workspaceClaims: {
        ...(account.workspaceClaims || {}),
        [activeWorkspaceRef.current]: {
          studentNumber: student.studentNumber,
          studentName: student.name,
          teamCode: student.teamCode,
          claimedAt
        }
      },
      studentNumber: student.studentNumber,
      studentName: student.name,
      teamCode: student.teamCode,
      claimedAt
    } : account);
    saveStudentAccounts(nextAccounts);
    setState((current) => materializeStudentSession({
      ...current,
      studentAccounts: nextAccounts,
      activeStudentNumber: student.studentNumber,
      activity: [{ id: `act-${Date.now()}`, at: claimedAt, text: `${student.name} claimed Student Number ${student.studentNumber} in ${activeWorkspace?.name || 'the current workspace'}.` }, ...current.activity]
    }, activeWorkspaceRef.current));
    return { ok: true, student };
  }, [activeWorkspace?.name, state.activeAccountEmail, state.studentAccounts, state.students]);

  const disconnectStudentNumber = useCallback(() => {
    const email = state.activeAccountEmail;
    if (!email) return { ok: false, error: 'Sign in before disconnecting a Student Number.' };

    const disconnectedAt = new Date().toISOString();
    const globalAccounts = loadStudentAccounts(state.studentAccounts);
    const nextAccounts = globalAccounts.map((account) => {
      if (account.email.toLowerCase() !== email.toLowerCase()) return account;
      const workspaceClaims = { ...(account.workspaceClaims || {}) };
      delete workspaceClaims[activeWorkspaceRef.current];
      return {
        ...account,
        workspaceClaims,
        studentNumber: '',
        studentName: '',
        teamCode: '',
        claimedAt: ''
      };
    });

    saveStudentAccounts(nextAccounts);
    setState((current) => materializeStudentSession({
      ...current,
      studentAccounts: nextAccounts,
      activeStudentNumber: '',
      activity: [{
        id: `act-${Date.now()}`,
        at: disconnectedAt,
        text: `${email} disconnected its Student Number from ${activeWorkspace?.name || 'the current workspace'}.`
      }, ...current.activity]
    }, activeWorkspaceRef.current));
    return { ok: true };
  }, [activeWorkspace?.name, state.activeAccountEmail, state.studentAccounts]);

  const setActiveStudentNumber = useCallback((studentNumber) => {
    setState((current) => ({ ...current, activeStudentNumber: studentNumber }));
  }, []);

  const executeDocumentCheck = useCallback(async (attempt, deliverable) => {
    const attemptId = attempt.id;
    const workspaceId = activeWorkspaceRef.current;
    const sourceUrl = firstSubmissionLink(attempt.values);
    if (!sourceUrl) return { ok: false, error: 'This response does not contain a submitted file link.' };

    setState((current) => ({
      ...current,
      attempts: current.attempts.map((item) => item.id === attemptId
        ? { ...item, fileCheckStatus: 'Checking', fileCheckError: '' }
        : item)
    }));

    try {
      const report = await requestDocumentCheck(workspaceId, {
        responseId: attempt.id,
        deliverableKey: deliverable?.trackerColumn || deliverable?.shortTitle || attempt.deliverableId,
        sourceUrl,
        sourceResponseUpdatedAt: attempt.updatedAt || attempt.submittedAt
      });
      if (activeWorkspaceRef.current !== workspaceId) {
        return { ok: false, error: 'Workspace changed before Document Check finished.' };
      }
      const reportStatus = report.status === 'UNAVAILABLE' ? 'Unavailable' : 'Current';
      setState((current) => ({
        ...current,
        attempts: current.attempts.map((item) => {
          if (item.id !== attemptId) return item;
          const preservedFlags = (item.flags || []).filter((flag) =>
            !['Not Checked', 'PDF Verified', 'No Template', 'Too Short', 'Template-like',
              'Template Headings Missing', 'Invalid Drive Link', 'Inaccessible', 'Not PDF',
              'Download Disabled', 'File Too Large', 'Download Failed', 'Password Protected',
              'Corrupt PDF'].includes(flag)
          );
          const resultFlags = report.flags || [];
          const reviewStatus = item.reviewStatus === 'Accepted'
            ? 'Accepted'
            : report.attentionRequired ? 'Needs Review' : 'Received';
          return {
            ...item,
            flags: [...new Set([...preservedFlags, ...resultFlags])],
            checkSummary: report.summary,
            fileCheckStatus: report.status,
            fileCheckError: '',
            primaryStatus: item.reviewStatus === 'Accepted' ? 'Accepted' : reviewStatus,
            reviewStatus,
            documentCheck: {
              status: reportStatus,
              type: 'Document Check',
              summary: report.summary,
              flags: resultFlags,
              redFlags: report.redFlags || [],
              missingSections: report.missingSections || [],
              suggestedAction: report.suggestedAction,
              checkedBy: report.checkedBy,
              checkedAt: report.checkedAt,
              sourceResponseUpdatedAt: report.sourceResponseUpdatedAt,
              metadata: report.metadata,
              document: report.document,
              templateComparison: report.templateComparison,
              reportId: report.id
            }
          };
        }),
        activity: [{
          id: `act-${Date.now()}`,
          at: new Date().toISOString(),
          text: `${deliverable?.shortTitle || 'Submitted document'} check completed.`
        }, ...current.activity]
      }));
      return { ok: true, report };
    } catch (error) {
      if (activeWorkspaceRef.current !== workspaceId) {
        return { ok: false, error: 'Workspace changed before Document Check finished.' };
      }
      setState((current) => ({
        ...current,
        attempts: current.attempts.map((item) => item.id === attemptId
          ? {
              ...item,
              fileCheckStatus: 'Error',
              fileCheckError: error.message,
              checkSummary: `Document Check could not finish: ${error.message}`,
              documentCheck: {
                status: 'Error',
                type: 'Document Check',
                summary: `Document Check could not finish: ${error.message}`,
                flags: [],
                redFlags: [],
                missingSections: [],
                suggestedAction: 'Confirm that the backend and Google Drive API are available, then check this document again.',
                checkedAt: new Date().toISOString(),
                sourceResponseUpdatedAt: attempt.updatedAt || attempt.submittedAt
              }
            }
          : item)
      }));
      return { ok: false, error: error.message };
    }
  }, []);

  const submitPublicForm = useCallback(async (slug, payload) => {
    const deliverable = getDeliverable(state, slug);
    if (!deliverable) return { ok: false, formError: 'This submission form was not found.' };
    if (deliverable.status === 'Unpublished') return { ok: false, formError: 'This submission form is not currently accepting responses.' };
    const validation = validateSubmission({ deliverable, values: payload.values });
    if (!validation.ok) return { ok: false, fieldErrors: validation.errors };

    const student = findStudent(state.students, payload.studentNumber);
    if (!student) return { ok: false, formError: 'Choose a Student Number from the class record list.' };
    const submittedAt = new Date().toISOString();
    const existing = findOwnedResponse(state.attempts, {
      deliverableId: deliverable.id,
      studentNumber: student.studentNumber,
      googleSubject: payload.googleSubject,
      googleEmail: payload.googleEmail
    });
    const identityConflict = !existing && hasResponseConflict(state.attempts, {
      deliverableId: deliverable.id,
      studentNumber: student.studentNumber,
      googleSubject: payload.googleSubject,
      googleEmail: payload.googleEmail
    });
    const identityChanged = existing && (
      existing.studentName !== (payload.studentName || student.name) ||
      existing.teamCode !== (payload.teamCode || student.teamCode)
    );
    const changed = !existing || identityChanged || valuesChanged(existing.values, payload.values);
    const documentChanged = deliverableUsesDocumentCheck(deliverable) && (
      !existing || firstSubmissionLink(existing.values) !== firstSubmissionLink(payload.values)
    );
    const flags = documentChanged
      ? deriveAttemptFlags(payload.values, validation.flags)
      : existing?.flags || deriveAttemptFlags(payload.values, validation.flags);

    if (existing && !changed) {
      return { ok: true, unchanged: true, attempt: existing, student, deliverable };
    }

    const attempt = {
      id: existing?.id || `resp-${Date.now()}`,
      deliverableId: deliverable.id,
      studentNumber: payload.studentNumber,
      studentName: payload.studentName || student?.name || '',
      teamCode: payload.teamCode || student?.teamCode || '',
      googleSubject: payload.googleSubject || existing?.googleSubject || '',
      googleEmailSnapshot: payload.googleEmail || existing?.googleEmailSnapshot || '',
      identityConflict,
      matched: Boolean(student),
      submittedAt,
      updatedAt: submittedAt,
      values: payload.values,
      flags,
      checkSummary: documentChanged ? '' : existing?.checkSummary || '',
      fileCheckStatus: documentChanged ? 'Pending' : existing?.fileCheckStatus,
      fileCheckError: '',
      primaryStatus: 'Received',
      reviewStatus: 'Received',
      archiveStatus: existing?.archiveStatus || 'Not Archived',
      feedback: existing?.feedback || [],
      documentCheck: documentChanged ? null : existing?.documentCheck || null,
      aiReport: documentChanged ? null : existing?.aiReport || null,
      acceptance: null,
      history: existing ? [
        {
          id: `hist-${Date.now()}`,
          changedAt: submittedAt,
          previousValues: existing.values,
          previousStudentName: existing.studentName,
          previousTeamCode: existing.teamCode
        },
        ...(existing.history || [])
      ] : []
    };

    setState((current) => {
      const nextStudents = identityConflict ? current.students : current.students.map((item) => {
        if (item.studentNumber !== student.studentNumber) return item;
        return {
          ...item,
          milestones: {
            ...item.milestones,
            [deliverable.trackerColumn]: calculateDaysLate(deliverable.dueAt, submittedAt)
          }
        };
      });
      const withoutExisting = existing
        ? current.attempts.filter((oldAttempt) => oldAttempt.id !== existing.id)
        : current.attempts;
      return {
        ...current,
        students: nextStudents,
        attempts: [attempt, ...withoutExisting],
        activity: [{ id: `act-${Date.now()}`, at: submittedAt, text: `${payload.studentName || student?.name || payload.studentNumber} ${existing ? 'updated' : 'submitted'} ${deliverable.shortTitle}${identityConflict ? '; identity conflict requires review.' : existing?.acceptance ? '; prior acceptance requires review.' : '.'}` }, ...current.activity]
      };
    });

    if (documentChanged) {
      void executeDocumentCheck(attempt, deliverable);
    }

    const daysLate = calculateDaysLate(deliverable.dueAt, submittedAt);
    let trackerSync;
    if (identityConflict) {
      trackerSync = {
        status: 'IDENTITY_CONFLICT',
        message: 'Response saved separately. The existing tracker source was not replaced.'
      };
    } else {
      try {
        trackerSync = await writeTrackerValue(activeWorkspaceRef.current, {
          studentNumber: student.studentNumber,
          teamCode: student.teamCode,
          memberNumber: String(student.memberNumber || ''),
          trackerColumnKey: deliverable.trackerColumn,
          daysLate,
          writeToGoogleSheet: true
        });
      } catch (error) {
        trackerSync = {
          status: 'LOCAL_ONLY',
          message: `Response saved and the WildTrack tracker was updated. Google Sheet sync is pending: ${error.message}`
        };
      }
    }

    return { ok: true, updated: Boolean(existing), attempt, student, deliverable, trackerSync, documentCheckStarted: documentChanged };
  }, [executeDocumentCheck, state]);

  const runDocumentCheck = useCallback(async (attemptId) => {
    const attempt = state.attempts.find((item) => item.id === attemptId);
    if (!attempt) return { ok: false, error: 'The selected response was not found.' };
    const deliverable = getDeliverable(state, attempt.deliverableId);
    return executeDocumentCheck(attempt, deliverable);
  }, [executeDocumentCheck, state]);

  const runDocumentChecks = useCallback(async (attemptIds, options = {}) => {
    const requestedIds = new Set(attemptIds || []);
    const candidates = state.attempts.filter((attempt) => requestedIds.has(attempt.id));
    const results = [];
    let completed = 0;
    let cursor = 0;
    const workerCount = Math.min(3, candidates.length);
    const runWorker = async () => {
      while (cursor < candidates.length) {
        const index = cursor;
        cursor += 1;
        const attempt = candidates[index];
        const deliverable = getDeliverable(state, attempt.deliverableId);
        const result = await executeDocumentCheck(attempt, deliverable);
        results.push({ attemptId: attempt.id, ...result });
        completed += 1;
        options.onProgress?.({ completed, total: candidates.length });
      }
    };
    await Promise.all(Array.from({ length: workerCount }, runWorker));
    return {
      ok: results.every((result) => result.ok),
      total: candidates.length,
      completed,
      failed: results.filter((result) => !result.ok).length,
      results
    };
  }, [executeDocumentCheck, state]);

  const runAiReview = useCallback(async () => ({
    ok: false,
    unavailable: true,
    error: 'Gemini AI Review is not connected yet. Document Check results remain available without Gemini.'
  }), []);

  const saveFeedback = useCallback((attemptId, payload) => {
    const note = String(payload.note || '').trim();
    if (!note) return;
    setState((current) => {
      const now = new Date().toISOString();
      return {
        ...current,
        attempts: current.attempts.map((attempt) => {
          if (attempt.id !== attemptId) return attempt;
          const existing = (attempt.feedback || []).find((item) => item.visibility !== 'Staff');
          const staffFeedback = (attempt.feedback || []).filter((item) => item.visibility === 'Staff');
          return {
            ...attempt,
            feedback: [
              {
                id: existing?.id || `fb-${Date.now()}`,
                note,
                author: payload.author || 'Sir/adviser',
                visibility: payload.visibility || 'Student',
                createdAt: existing?.createdAt || now,
                updatedAt: now
              },
              ...staffFeedback
            ]
          };
        })
      };
    });
  }, []);

  const markAccepted = useCallback((attemptId, reviewer = {}) => {
    const acceptedAt = new Date().toISOString();
    setState((current) => ({
      ...current,
      attempts: current.attempts.map((attempt) => attempt.id === attemptId ? {
        ...attempt,
        primaryStatus: 'Accepted',
        reviewStatus: 'Accepted',
        flags: (attempt.flags || []).includes('Accepted') ? attempt.flags : [...(attempt.flags || []), 'Accepted'],
        acceptance: {
          acceptedBy: reviewer.name || 'Sir Ralph Laviste',
          acceptedByRole: reviewer.role || 'Teacher/Admin',
          scope: reviewer.scope || 'Individual response',
          acceptedAt,
          sourceResponseUpdatedAt: attempt.updatedAt || attempt.submittedAt
        }
      } : attempt),
      activity: [{ id: `act-${Date.now()}`, at: acceptedAt, text: `${reviewer.name || 'Sir Ralph Laviste'} accepted a ${reviewer.scope || 'submission'}.` }, ...current.activity]
    }));
  }, []);

  const revokeAcceptance = useCallback((attemptId) => {
    const revokedAt = new Date().toISOString();
    setState((current) => {
      const target = current.attempts.find((attempt) => attempt.id === attemptId);
      if (!target || target.archiveStatus === 'Archived') return current;
      const deliverable = getDeliverable(current, target.deliverableId);
      return {
        ...current,
        attempts: current.attempts.map((attempt) => {
          if (attempt.id !== attemptId) return attempt;
          return {
            ...attempt,
            primaryStatus: 'Needs Review',
            reviewStatus: 'Needs Review',
            flags: (attempt.flags || []).filter((flag) => flag !== 'Accepted'),
            acceptance: null
          };
        }),
        activity: [{
          id: `act-${Date.now()}`,
          at: revokedAt,
          text: `Revoked acceptance for ${target.studentName || target.studentNumber} - ${deliverable?.shortTitle || 'deliverable'}.`
        }, ...current.activity]
      };
    });
  }, []);

  const archiveAttempts = useCallback(async (attemptIds) => {
    const requestedIds = [...new Set(attemptIds || [])];
    const eligibleAttempts = state.attempts.filter((attempt) => (
      requestedIds.includes(attempt.id) &&
      attempt.reviewStatus === 'Accepted' &&
      attempt.archiveStatus !== 'Archived'
    ));
    if (!eligibleAttempts.length) {
      return { ok: false, archived: 0, error: 'No accepted, unarchived responses were selected.' };
    }

    const archives = await Promise.all(
      eligibleAttempts.map((attempt, index) => buildArchiveRecord(state, attempt, index, activeWorkspace))
    );
    const archivedIds = new Set(archives.map((archive) => archive.attemptId));
    const archivedAt = new Date().toISOString();

    setState((current) => ({
      ...current,
      archives: [
        ...archives,
        ...current.archives.filter((archive) => !archivedIds.has(archive.attemptId))
      ],
      attempts: current.attempts.map((attempt) => archivedIds.has(attempt.id) ? {
        ...attempt,
        archiveStatus: 'Archived',
        flags: (attempt.flags || []).includes('Archived') ? attempt.flags : [...(attempt.flags || []), 'Archived']
      } : attempt),
      activity: [
        {
          id: `act-${Date.now()}`,
          at: archivedAt,
          text: archives.length === 1
            ? `Archived ${archives[0].deliverableTitle} for ${archives[0].teamCode}.`
            : `Archived ${archives.length} accepted responses.`
        },
        ...current.activity
      ]
    }));
    return { ok: true, archived: archives.length };
  }, [activeWorkspace, state]);

  const archiveAttempt = useCallback((attemptId) => archiveAttempts([attemptId]), [archiveAttempts]);

  const updateTrackerColumn = useCallback((columnId, updates) => {
    setState((current) => ({
      ...current,
      trackerColumns: current.trackerColumns.map((column) => column.id === columnId ? { ...column, ...updates } : column)
    }));
  }, []);

  const addTrackerColumn = useCallback((label) => {
    const clean = String(label || '').trim();
    if (!clean) return;
    setState((current) => ({
      ...current,
      trackerColumns: [
        ...current.trackerColumns,
        {
          id: `col-${Date.now()}`,
          key: clean,
          label: clean,
          sourceColumn: clean,
          active: true,
          pdfRequired: false
        }
      ],
      classRecord: {
        ...current.classRecord,
        importedColumns: [...new Set([...(current.classRecord.importedColumns || []), clean])]
      }
    }));
  }, []);

  const saveTemplate = useCallback(async (payload) => {
    const workspaceId = activeWorkspaceRef.current;
    try {
      const saved = payload.sourceType === 'drive'
        ? await uploadDriveDocumentTemplate(workspaceId, {
            deliverableKey: payload.deliverable,
            displayName: payload.name,
            driveUrl: payload.driveUrl
          })
        : await uploadDocumentTemplate(workspaceId, {
            deliverableKey: payload.deliverable,
            displayName: payload.name,
            file: payload.file
          });
      if (activeWorkspaceRef.current !== workspaceId) {
        return { ok: false, error: 'Workspace changed before the template was saved.' };
      }
      const template = mapBackendTemplate(saved);
      setState((current) => ({
        ...current,
        templates: [
          template,
          ...current.templates.filter((item) =>
            String(item.deliverable).toLowerCase() !== String(template.deliverable).toLowerCase()
          )
        ]
      }));
      return { ok: true, template };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }, []);

  const removeTemplate = useCallback(async (templateId) => {
    const workspaceId = activeWorkspaceRef.current;
    try {
      await deleteDocumentTemplate(workspaceId, templateId);
      if (activeWorkspaceRef.current !== workspaceId) {
        return { ok: false, error: 'Workspace changed before the template was removed.' };
      }
      setState((current) => ({
        ...current,
        templates: current.templates.filter((item) => item.id !== templateId)
      }));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      ...resetWorkflowState(activeWorkspaceRef.current, activeWorkspace),
      backendSync: {
        enabled: false,
        apiBaseUrl: getApiBaseUrl(),
        status: 'Starter data restored.',
        lastError: '',
        lastLoadedAt: new Date().toISOString()
      }
    });
  }, [activeWorkspace]);

  const value = useMemo(() => ({
    state,
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    needsWorkspaceChoice,
    createWorkspace,
    switchWorkspace,
    addTrackerColumn,
    connectClassRecord,
    connectSheetSource,
    claimStudentNumber,
    disconnectStudentNumber,
    authenticateGoogleAccount,
    generateFormsFromSuggestions,
    loginStudentAccount,
    logoutStudentAccount,
    logoutStaffSession,
    session,
    refreshSession,
    publishDeliverable,
    refreshBackendData,
    registerStudentAccount,
    removeDeliverable,
    removeTemplate,
    saveTemplate,
    setActiveStudentNumber,
    submitPublicForm,
    runDocumentCheck,
    runDocumentChecks,
    runAiReview,
    updateTrackerColumn,
    saveFeedback,
    markAccepted,
    revokeAcceptance,
    archiveAttempt,
    archiveAttempts,
    reset
  }), [activeWorkspace, activeWorkspaceId, addTrackerColumn, archiveAttempt, archiveAttempts, authenticateGoogleAccount, claimStudentNumber, connectClassRecord, connectSheetSource, createWorkspace, disconnectStudentNumber, generateFormsFromSuggestions, loginStudentAccount, logoutStaffSession, logoutStudentAccount, markAccepted, needsWorkspaceChoice, publishDeliverable, refreshBackendData, refreshSession, registerStudentAccount, removeDeliverable, removeTemplate, reset, revokeAcceptance, runAiReview, runDocumentCheck, runDocumentChecks, saveFeedback, saveTemplate, session, setActiveStudentNumber, state, submitPublicForm, switchWorkspace, updateTrackerColumn, workspaces]);

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflow() {
  const context = useContext(WorkflowContext);
  if (!context) throw new Error('useWorkflow must be used within WorkflowProvider');
  return context;
}

async function buildArchiveRecord(state, attempt, index, workspace) {
  const deliverable = getDeliverable(state, attempt.deliverableId);
  const student = findStudent(state.students, attempt.studentNumber);
  const teamCode = student?.teamCode || attempt.teamCode || 'No team';
  const project = (state.projectMetadata || []).find((item) => String(item.groupCode || '').toLowerCase() === String(teamCode).toLowerCase());
  const hash = await hashArchiveRecord(`${attempt.id}|${attempt.submittedAt}|${JSON.stringify(attempt.values)}`);
  const archivedAt = new Date().toISOString();
  return {
    id: `arc-${Date.now()}-${index}`,
    attemptId: attempt.id,
    workspaceId: workspace?.id || state.workspaceId || '',
    workspaceName: workspace?.name || '',
    deliverableTitle: deliverable?.title || 'Unknown deliverable',
    teamCode,
    studentName: student?.name || attempt.studentName || attempt.studentNumber,
    studentNumber: student?.studentNumber || attempt.studentNumber || '',
    projectTitle: project?.projectTitle || '',
    softwareName: project?.softwareName || '',
    adviserName: project?.adviserName || student?.adviser || '',
    version: `v${Math.max(1, (attempt.history?.length || 0) + 1)}`,
    archivedAt,
    sourceLink: firstSubmissionLink(attempt.values),
    metadataSha256: hash,
    sha256: hash,
    storageStatus: 'Metadata only',
    integrityStatus: 'Unavailable',
    verified: false
  };
}

function describeSheetSourceType(sourceType) {
  if (sourceType === 'teamFormation') return 'Team Formation';
  if (sourceType === 'projectMonitor') return 'Software Project Monitor';
  return 'Tracker';
}

function applyBackendSnapshot(current, snapshot, options = {}) {
  const mapped = mapBackendSnapshot(snapshot);
  const failures = snapshot.failures || [];
  const failureMessage = snapshot.failureMessage || describeSnapshotFailures(failures);
  const nextSources = {
    ...(current.classRecord?.sources || {}),
    ...(mapped.sources || {})
  };
  const hasSources = Object.keys(mapped.sources || {}).length > 0;
  return {
    ...current,
    ...(mapped.students.length ? { students: mapped.students } : {}),
    ...(mapped.trackerColumns.length ? { trackerColumns: mapped.trackerColumns } : {}),
    ...(mapped.projectMetadata.length ? { projectMetadata: mapped.projectMetadata } : {}),
    ...(mapped.deliverables.length ? { deliverables: sortDeliverables(current, mergeDeliverables(current.deliverables, mapped.deliverables)) } : {}),
    ...(mapped.attempts.length ? { attempts: mapped.attempts } : {}),
    templates: mapped.templates,
    classRecord: {
      ...current.classRecord,
      ...(hasSources ? { sources: nextSources } : {})
    },
    backendSync: {
      enabled: options.enabled ?? true,
      apiBaseUrl: getApiBaseUrl(),
      status: failureMessage || options.status || 'Backend data loaded.',
      lastError: failureMessage,
      failedSegments: failures.map((failure) => failure.label || failure.segment),
      lastLoadedAt: new Date().toISOString()
    }
  };
}

function buildBackendImportResult(sourceType, backendImport, snapshot, preview = null) {
  const mapped = mapBackendSnapshot(snapshot);
  const suggestedForms = (backendImport.deadlineSuggestions || []).map((item) => ({
    trackerColumn: item.trackerColumnKey,
    shortTitle: item.trackerColumnKey,
    title: item.title,
    dueAt: item.dueAt,
    pdfRequired: item.pdfRequired,
    sourceValue: item.sourceValue,
    sourceRowNumber: item.sourceRowNumber
  }));
  const details = backendImport.details || {};
  const previewSummary = preview?.importSummary || {};
  const commonSummary = {
    ...previewSummary,
    sourceType: sourceType === 'teamFormation'
      ? 'Team Formation'
      : sourceType === 'projectMonitor'
        ? 'Software Project Monitor'
        : 'Tracker',
    resultStatus: (backendImport.warnings || []).length ? 'Imported with warnings' : 'Imported',
    headerRow: details.headerRow,
    detectedFields: previewSummary.detectedFields || details.detectedFields || [],
    missingFields: previewSummary.missingFields || details.missingFields || [],
    metrics: { ...(previewSummary.metrics || {}), ...(details.metrics || {}) },
    deadlineRows: previewSummary.deadlineRows || details.deadlineRows || [],
    suggestedForms,
    warnings: backendImport.warnings || []
  };
  const importSummary = sourceType === 'teamFormation'
    ? {
        ...commonSummary,
        studentsFound: backendImport.studentsFound,
        officialIdsFound: backendImport.officialIdsFound
      }
    : sourceType === 'projectMonitor'
      ? {
          ...commonSummary,
          groupsFound: backendImport.groupsFound
        }
      : {
          ...commonSummary,
          studentsFound: backendImport.studentsFound,
          officialIdsFound: backendImport.officialIdsFound,
          columnsFound: backendImport.columnsFound
        };

  return {
    ok: true,
    sourceType,
    headers: preview?.headers || previewSummary.headers || [],
    csvUrl: preview?.csvUrl || '',
    warnings: backendImport.warnings || [],
    suggestedForms,
    importSummary,
    ...(mapped.students.length ? { students: mapped.students } : {}),
    ...(mapped.trackerColumns.length ? { trackerColumns: mapped.trackerColumns } : {}),
    ...(mapped.projectMetadata.length ? { projectMetadata: mapped.projectMetadata } : {}),
    ...(mapped.deliverables.length ? { deliverables: mapped.deliverables } : {})
  };
}

function mapBackendSnapshot(snapshot) {
  const projectMetadata = (snapshot.projects || []).map((project) => ({
    id: project.id,
    groupCode: project.groupCode,
    projectTitle: project.projectTitle || '',
    softwareName: project.softwareName || '',
    description: project.description || '',
    proposalRemarks: project.proposalRemarks || '',
    demoComments: project.demoComments || '',
    adviserName: project.adviserName || '',
    status: project.projectStatus || '',
    category: project.category || ''
  }));
  const trackerColumns = (snapshot.trackerColumns || []).map((column) => ({
    id: column.id,
    key: column.columnKey,
    label: column.label,
    sourceColumn: column.sourceColumn,
    active: column.active,
    pdfRequired: column.pdfRequired
  }));
  const studentRecords = (snapshot.students || []).map((student) => ({
    rowKey: student.id,
    studentNumber: student.studentNumber || '',
    name: student.studentName,
    teamCode: student.teamCode,
    memberNumber: student.memberNumber || '',
    section: student.sectionName || '',
    adviser: student.adviserName || '',
    email: student.institutionalEmail || '',
    milestones: {}
  }));
  const studentByNumber = new Map(studentRecords.filter((student) => student.studentNumber).map((student) => [normalizeStudentNumber(student.studentNumber), student]));
  const studentByTeamMember = new Map(studentRecords.map((student) => [`${String(student.teamCode).toLowerCase()}::${String(student.memberNumber).toLowerCase()}`, student]));
  const trackerRows = (snapshot.trackerRows || []).map((row) => {
    const matched = row.studentNumber
      ? studentByNumber.get(normalizeStudentNumber(row.studentNumber))
      : studentByTeamMember.get(`${String(row.teamCode).toLowerCase()}::${String(row.memberNumber || '').toLowerCase()}`);
    const milestones = Object.fromEntries((row.cells || []).map((cell) => [cell.columnKey, cell.rawValue || '']));
    return {
      ...(matched || {}),
      rowKey: row.id,
      studentNumber: row.studentNumber || matched?.studentNumber || '',
      name: row.studentName || matched?.name || '',
      teamCode: row.teamCode || matched?.teamCode || '',
      memberNumber: row.memberNumber || matched?.memberNumber || '',
      section: row.sectionName || matched?.section || '',
      adviser: row.adviserName || matched?.adviser || '',
      email: matched?.email || '',
      milestones
    };
  });
  const students = trackerRows.length ? trackerRows : studentRecords;
  const deliverables = (snapshot.deliverables || []).map((deliverable) => ({
    id: deliverable.id,
    slug: deliverable.slug,
    title: deliverable.title,
    shortTitle: deliverable.trackerColumnKey,
    dueAt: normalizeBackendDueAt(deliverable.dueAt),
    trackerColumn: deliverable.trackerColumnKey,
    audience: 'Students',
    status: titleCase(String(deliverable.status || 'PUBLISHED').toLowerCase()),
    instructions: deliverable.instructions || '',
    fields: deliverable.pdfRequired
      ? [{ id: 'documentPdf', label: 'PDF Drive Link', type: 'drive', required: true, pdfRequired: true }]
      : [{ id: 'primaryLink', label: 'Submission Link', type: 'url', required: true, pdfRequired: false }]
  }));
  const templates = (snapshot.templates || []).map(mapBackendTemplate);

  const sources = {};
  for (const source of snapshot.sources || []) {
    const key = source.sourceType === 'TEAM_FORMATION' ? 'teamFormation'
      : source.sourceType === 'PROJECT_MONITOR' ? 'projectMonitor'
      : 'tracker';
    sources[key] = {
      status: source.status === 'IMPORTED' ? 'Imported' : source.status === 'CONNECTED' ? 'Connected' : 'Starter data',
      sheetUrl: source.sheetUrl || '',
      displayName: source.displayName || '',
      connectedAt: source.connectedAt || ''
    };
  }

  const attempts = (snapshot.staffResponses || []).map((resp) => {
    let values = {};
    try {
      values = typeof resp.valuesJson === 'string' ? JSON.parse(resp.valuesJson) : resp.valuesJson || {};
    } catch {
      values = {};
    }
    return {
      id: resp.id,
      deliverableId: resp.deliverableId,
      studentNumber: resp.studentNumber,
      studentName: resp.studentName,
      teamCode: resp.teamCode,
      googleSubject: resp.googleSubject,
      googleEmailSnapshot: resp.googleEmail,
      submittedAt: resp.submittedAt,
      updatedAt: resp.updatedAt,
      values,
      flags: [],
      reviewStatus: 'Received',
      primaryStatus: 'Received'
    };
  });

  return {
    students,
    trackerColumns,
    projectMetadata,
    deliverables,
    templates,
    sources,
    attempts
  };
}

function mapBackendTemplate(template) {
  return {
    id: template.id,
    deliverable: template.deliverableKey,
    name: template.displayName,
    originalFilename: template.originalFilename,
    contentType: template.contentType,
    sha256: template.sha256,
    extractedCharacterCount: template.extractedCharacterCount,
    status: 'Active',
    extractedAt: template.updatedAt
  };
}

function titleCase(value) {
  return String(value || '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeBackendDueAt(value) {
  const text = String(value || '');
  if (!text) return new Date().toISOString();
  if (/[zZ]|[+-]\d\d:\d\d$/.test(text)) return text;
  return `${text.length === 16 ? `${text}:00` : text}+08:00`;
}






