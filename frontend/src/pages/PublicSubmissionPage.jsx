import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {

  Alert,
  Button,
  Center,
  Container,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Title
} from '@mantine/core';
import { CalendarBlank, Clock, FilePdf, LinkSimple, PaperPlaneTilt, WarningCircle } from '@phosphor-icons/react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { GoogleIdentityAccess } from '../components/auth/GoogleIdentityAccess.jsx';
import { FormArtwork } from '../components/public/FormArtwork.jsx';
import { StudentIdentityPanel } from '../components/public/StudentIdentityPanel.jsx';
import { SubmissionResult } from '../components/public/SubmissionResult.jsx';
import { WildTrackPublicHeader } from '../components/public/WildTrackPublicHeader.jsx';
import {
  findStudent,
  formatDate,
  formatTime,
  getIdentityStudents,
  getWorkspacePublicKey,
  validateSubmission
} from '../lib/workflow.js';
import {
  clearSubmissionDraft,
  commitSubmission,
  confirmSubmissionAssociation,
  describeSubmissionError,
  loadSubmissionState,
  openPublicSubmission,
  saveSubmissionDraft
} from '../lib/submissionClient.js';
import { getRosterOptions } from '../lib/api.js';
import { createWorkspaceResourceCache } from '../lib/workspaceResourceCache.js';

function FormUnavailable({ deliverable }) {
  return (
    <Paper className="wt-form-surface" radius="md" p={{ base: 'lg', sm: 'xl' }}>
      <Center mih={300}>
        <Stack align="center" gap="md" maw={500} ta="center">
          <ThemeIcon color="orange" variant="light" size={48} radius="sm">
            <WarningCircle size={28} weight="duotone" aria-hidden="true" />
          </ThemeIcon>
          <Title order={1} size="h2">{deliverable ? 'Submission form unavailable' : 'Submission form not found'}</Title>
          <Text c="dimmed">
            {deliverable
              ? 'This deliverable is not accepting new responses right now. Previous responses remain recorded.'
              : 'This link does not match a published deliverable in the selected workspace.'}
          </Text>
          <Button component={Link} to="/student" variant="default">Open student dashboard</Button>
        </Stack>
      </Center>
    </Paper>
  );
}

function WorkspaceError({ message, onRetry }) {
  return (
    <Paper className="wt-form-surface" radius="md" p={{ base: 'lg', sm: 'xl' }}>
      <Center mih={300}>
        <Stack align="center" gap="md" maw={520} ta="center">
          <ThemeIcon color="red" variant="light" size={48} radius="sm">
            <WarningCircle size={28} weight="duotone" aria-hidden="true" />
          </ThemeIcon>
          <Title order={1} size="h2">Unable to open submission form</Title>
          <Alert color="red" variant="light" role="alert">{message}</Alert>
          <Button onClick={onRetry}>Retry opening form</Button>
          <Button component={Link} to="/" variant="default">Return to WildTrack</Button>
        </Stack>
      </Center>
    </Paper>
  );
}

export function PublicSubmissionPage() {
  const { slug, workspaceKey } = useParams();
  const [searchParams] = useSearchParams();
  const {
    session,
    sessionStatus,
    workspaceCatalogStatus,
    account: activeAccount,
    activeWorkspace,
    activeWorkspaceId,
    needsWorkspaceChoice,
    switchWorkspace,
    refreshSession
  } = useWorkspaceSession();
  const activeWorkspaceKey = getWorkspacePublicKey(activeWorkspace);
  const targetWorkspaceKey = workspaceKey || activeWorkspaceKey;
  const formKey = JSON.stringify([targetWorkspaceKey, slug]);
  const waitingForWorkspace = !targetWorkspaceKey && (sessionStatus === 'loading' || workspaceCatalogStatus === 'loading');
  const [workspaceStatus, setWorkspaceStatus] = useState('ready');
  const [workspaceError, setWorkspaceError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [publicCache] = useState(() => createWorkspaceResourceCache({ storageKey: 'wildtrack.public-forms.v1' }));
  const [publicResult, setPublicResult] = useState(() => {
    const data = publicCache.read(formKey);
    return data ? { key: formKey, status: 'refreshing', data } : null;
  });
  const publicFormPayload = publicResult?.key === formKey ? publicResult.data : null;
  const fetchingPublicForm = publicResult?.key !== formKey || publicResult?.status === 'loading' || waitingForWorkspace;
  const publicError = publicResult?.key === formKey ? publicResult.error : '';
  const [retry, setRetry] = useState(0);
  const [workspaceRetry, setWorkspaceRetry] = useState(0);
  const [privateRetry, setPrivateRetry] = useState(0);
  const [rosterRetry, setRosterRetry] = useState(0);
  const deliverable = publicFormPayload?.deliverable?.slug === slug ? publicFormPayload.deliverable : null;
  const queryStudent = searchParams.get('student') || '';
  const [identity, setIdentity] = useState({ studentNumber: '', studentName: '', teamCode: '' });
  const [values, setValues] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [draftStatus, setDraftStatus] = useState(''); // '', 'saving', 'saved', 'error'
  const draftRevisionRef = useRef(null);
  const privateScope = useRef(0);
  const [identityErrors, setIdentityErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState(null);
  const [identityStudents, setIdentityStudents] = useState([]);
  const student = useMemo(() => findStudent(identityStudents, identity.studentNumber), [identity.studentNumber, identityStudents]);
  const [serverAssociation, setServerAssociation] = useState(null);
  const [myServerResponse, setMyServerResponse] = useState(null);
  const ownedResponse = myServerResponse;
  const hydrationKey = JSON.stringify([activeAccount?.email, session?.googleSubject, session?.authenticated, activeWorkspaceId, formKey, deliverable?.id]);
  const [hydration, setHydration] = useState({ key: '', status: 'idle' });
  const [roster, setRoster] = useState({ key: '', status: 'idle', error: '' });
  const rosterReady = roster.key === hydrationKey && roster.status === 'ready';
  const [valuesEdited, setValuesEdited] = useState(false);
  const [deniedAccess, setDeniedAccess] = useState(null);
  const accessDenied = deniedAccess?.key === hydrationKey;
  const privateReady = hydration.key === hydrationKey && hydration.status === 'ready'
    && activeWorkspaceId === publicFormPayload?.workspace?.id && workspaceStatus === 'ready' && !accessDenied
    && publicResult?.status === 'ready';
  const requiresPdf = Boolean(deliverable?.fields?.some((field) => field.pdfRequired));

  useLayoutEffect(() => {
    privateScope.current += 1;
    setSubmitting(false);
    setFormError('');
    setIdentityErrors({});
    setFieldErrors({});
    setValues({});
    setValuesEdited(false);
    setDeniedAccess(null);
    setHydration({ key: hydrationKey, status: 'idle' });
    setRoster({ key: hydrationKey, status: 'idle', error: '' });
    setIdentityStudents([]);
    setServerAssociation(null);
    setMyServerResponse(null);
    draftRevisionRef.current = null;
    setDraftStatus('');
    setResult(null);
    if (session?.authenticated) {
      setIdentity({ studentNumber: '', studentName: '', teamCode: '' });
    }
    return () => { privateScope.current += 1; };
  }, [hydrationKey]);

  useEffect(() => {
    let active = true;
    if (waitingForWorkspace) return () => { active = false; };
    if (!slug || !targetWorkspaceKey) {
      setPublicResult({ key: formKey, status: 'ready', data: null });
      return () => { active = false; };
    }
    const cached = publicCache.read(formKey);
    setPublicResult({ key: formKey, status: cached ? 'refreshing' : 'loading', data: cached || null });
    publicCache.load(formKey, () => openPublicSubmission(targetWorkspaceKey, slug))
      .then((data) => {
        if (!active) return;
        setPublicResult({ key: formKey, status: 'ready', data });
      })
      .catch((error) => {
        if (!active) return;
        publicCache.remove(formKey);
        setPublicResult({ key: formKey, status: error?.status === 404 ? 'ready' : 'error', data: null,
          error: error?.status === 404 ? '' : error?.message || 'This submission form could not be opened.' });
      });
    return () => { active = false; };
  }, [formKey, targetWorkspaceKey, slug, waitingForWorkspace, retry]);

  useEffect(() => {
    let active = true;
    const targetWorkspaceId = publicFormPayload?.workspace?.id;
    if (!session?.authenticated || !targetWorkspaceId || (!needsWorkspaceChoice && targetWorkspaceId === activeWorkspaceId)) {
      setWorkspaceStatus('ready');
      setWorkspaceError('');
      return () => { active = false; };
    }
    setWorkspaceStatus('loading');
    setWorkspaceError('');
    switchWorkspace(targetWorkspaceId)
      .then((response) => {
        if (!active) return;
        if (response?.ok) {
          setWorkspaceStatus('ready');
          return;
        }
        setWorkspaceStatus('error');
        setWorkspaceError(response?.error || 'This academic workspace could not be opened.');
      })
      .catch((error) => {
        if (!active) return;
        setWorkspaceStatus('error');
        setWorkspaceError(error?.message || 'This academic workspace could not be opened.');
      });
    return () => { active = false; };
  }, [activeWorkspaceId, needsWorkspaceChoice, publicFormPayload?.workspace?.id, session?.authenticated, switchWorkspace, workspaceRetry]);

  useEffect(() => {
    let cancelled = false;
    if (!session?.authenticated || !activeWorkspaceId || activeWorkspaceId !== publicFormPayload?.workspace?.id) return;
    setRoster({ key: hydrationKey, status: 'loading', error: '' });
    getRosterOptions(activeWorkspaceId).then(rows => {
      if (cancelled) return;
      setIdentityStudents(getIdentityStudents((rows || []).map((row) => ({
        rowKey: row.id, studentNumber: row.studentNumber || '', name: row.studentName || '',
        teamCode: row.teamCode || '', memberNumber: row.memberNumber || '', section: row.sectionName || '',
        adviser: row.adviserName || '', email: row.institutionalEmail || '', milestones: {}
      }))));
      setRoster({ key: hydrationKey, status: 'ready', error: '' });
    }).catch(error => {
      if (!cancelled && (error?.status === 401 || error?.status === 403)) {
        setDeniedAccess({ key: hydrationKey, status: error.status, message: describeSubmissionError(error) });
      }
      if (!cancelled) setRoster({ key: hydrationKey, status: 'error', error: describeSubmissionError(error) });
    });
    return () => { cancelled = true; };
  }, [hydrationKey, publicFormPayload?.workspace?.id, rosterRetry]);

  useEffect(() => {
    const targetStudentNumber = queryStudent;
    if (!targetStudentNumber || serverAssociation) return;
    const matched = findStudent(identityStudents, targetStudentNumber);
    if (matched) {
      setIdentity((current) => ({
        studentNumber: matched.studentNumber || current.studentNumber,
        studentName: matched.name || current.studentName,
        teamCode: matched.teamCode || current.teamCode
      }));
    }
  }, [identityStudents, queryStudent, serverAssociation]);

  useEffect(() => {
    const matched = findStudent(identityStudents, serverAssociation?.studentNumber);
    if (!matched) return;
    setIdentity((current) => current.studentNumber === matched.studentNumber ? {
      ...current,
      studentName: matched.name,
      teamCode: serverAssociation.teamCode || matched.teamCode || ''
    } : current);
  }, [identityStudents, serverAssociation]);

  useEffect(() => {
    let cancelled = false;
    const targetWorkspaceId = publicFormPayload?.workspace?.id;
    if (!session?.authenticated || !activeWorkspaceId || activeWorkspaceId !== targetWorkspaceId || !deliverable?.id) {
      setServerAssociation(null);
      setMyServerResponse(null);
      return () => { cancelled = true; };
    }
    setHydration({ key: hydrationKey, status: 'loading' });
    loadSubmissionState(activeWorkspaceId, deliverable.id)
      .then(({ association, draft, response, values: restoredValues }) => {
        if (cancelled) return;
        setServerAssociation(association || null);
        if (association?.studentNumber) {
          setIdentity({
            studentNumber: association.studentNumber,
            studentName: association.studentName || '',
            teamCode: association.teamCode || ''
          });
        }
        const owned = response ? {
          ...response,
          deliverableId: deliverable.id,
          studentNumber: association?.studentNumber || '',
          googleEmail: activeAccount?.email || ''
        } : null;
        setMyServerResponse(owned);
        draftRevisionRef.current = draft?.revision ?? null;
        setValues({ ...restoredValues });
        setFormError('');
        setHydration({ key: hydrationKey, status: 'ready' });
      })
      .catch((error) => {
        if (cancelled) return;
        setServerAssociation(null);
        setMyServerResponse(null);
        setFormError(describeSubmissionError(error));
        if (error?.status === 401 || error?.status === 403) {
          setDeniedAccess({ key: hydrationKey, status: error.status, message: describeSubmissionError(error) });
        }
        setHydration({ key: hydrationKey, status: 'error' });
      });
    return () => { cancelled = true; };
  }, [hydrationKey, publicFormPayload?.workspace?.id, privateRetry]);

  useEffect(() => {
    if (!privateReady || !valuesEdited || submitting || result) return undefined;
    if (!Object.keys(values).length) return undefined;
    let cancelled = false;
    setDraftStatus('saving');
    const timer = setTimeout(() => {
      saveSubmissionDraft(activeWorkspaceId, deliverable.id, values, draftRevisionRef.current)
        .then((saved) => {
          if (cancelled) return;
          if (saved.conflict) {
            setDraftStatus('conflict');
            return;
          }
          draftRevisionRef.current = saved.revision;
          setDraftStatus('saved');
        })
        .catch((error) => {
          if (cancelled) return;
          setDraftStatus('error');
          setFormError(describeSubmissionError(error));
        });
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeWorkspaceId, deliverable?.id, privateReady, valuesEdited, submitting, result, values]);

  function updateField(id, value) {
    if (!privateReady) return;
    setValuesEdited(true);
    setValues((current) => ({ ...current, [id]: value }));
    setFieldErrors((current) => ({ ...current, [id]: '' }));
  }

  function updateIdentity(nextIdentity) {
    if (!privateReady || !rosterReady) return;
    setIdentity(nextIdentity);
    setIdentityErrors({});
    setFormError('');
  }

  async function finishGoogleSignIn() {
    const scope = privateScope.current;
    const current = await refreshSession();
    if (!current?.authenticated) setFormError('Google sign-in completed, but the WildTrack session could not be opened.');
    else if (privateScope.current === scope) retryPrivateState();
  }

  function retryPrivateState() {
    setValues({});
    setValuesEdited(false);
    setIdentity({ studentNumber: '', studentName: '', teamCode: '' });
    setServerAssociation(null);
    setMyServerResponse(null);
    setHydration({ key: hydrationKey, status: 'idle' });
    setRoster({ key: hydrationKey, status: 'idle', error: '' });
    setDeniedAccess(null);
    setPrivateRetry(value => value + 1);
    setRosterRetry(value => value + 1);
  }

  async function submit(event) {
    event.preventDefault();
    if (!privateReady || !rosterReady || submitting) return;
    const submittingScope = privateScope.current;
    setFormError('');
    setFieldErrors({});
    if (!activeAccount) {
      setFormError('Continue with Google before submitting this form.');
      return;
    }
    const nextIdentityErrors = {
      studentNumber: identity.studentNumber.trim() ? '' : 'Choose a Student Number.',
      studentName: identity.studentName.trim() ? '' : 'Choose a Student Name.',
      teamCode: identity.teamCode.trim() ? '' : 'Choose a Team Code.'
    };
    if (Object.values(nextIdentityErrors).some(Boolean)) {
      setIdentityErrors(nextIdentityErrors);
      setFormError(identity.studentNumber.trim()
        ? 'Complete the required student details.'
        : 'Choose a Student Number from this workspace\'s class record.');
      return;
    }
    if (!student) {
      setIdentityErrors({ studentNumber: 'Choose a Student Number from this workspace.' });
      setFormError('Choose a Student Number from this workspace\'s class record.');
      return;
    }
    const validation = validateSubmission({ deliverable, values });
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      setFormError('Review the required submission fields and try again.');
      return;
    }
    setSubmitting(true);
    try {
      if (serverAssociation?.studentNumber !== identity.studentNumber) {
        const association = await confirmSubmissionAssociation(activeWorkspaceId, identity.studentNumber);
        if (submittingScope !== privateScope.current) return;
        setServerAssociation(association || null);
      }
      const saved = await commitSubmission(activeWorkspaceId, deliverable.id, values, myServerResponse?.revision ?? null);
      if (submittingScope !== privateScope.current) return;
      if (saved.conflict) {
        setFormError('A newer version was saved from another session. Reload the form to continue editing.');
        return;
      }
      clearSubmissionDraft(activeWorkspaceId, deliverable.id).catch(() => {});
      setMyServerResponse((current) => ({ ...current, id: saved.responseId, revision: saved.revision, values }));
      setValuesEdited(false);
      setResult({
        ok: true,
        updated: saved.changed && Boolean(myServerResponse),
        unchanged: !saved.changed,
        attempt: { values, primaryStatus: 'Submitted', reviewStatus: 'PENDING_REVIEW' },
        student: { name: identity.studentName, studentNumber: identity.studentNumber, teamCode: identity.teamCode },
        deliverable: { title: deliverable.title || '', shortTitle: deliverable.shortTitle || deliverable.title || '' },
        trackerSync: null
      });
    } catch (error) {
      if (submittingScope !== privateScope.current) return;
      setFormError(describeSubmissionError(error));
    } finally {
      if (submittingScope === privateScope.current) setSubmitting(false);
    }
  }

  return (
    <main className="wt-public-root">
      <WildTrackPublicHeader subtitle={publicFormPayload?.workspace?.name || activeWorkspace?.name || 'WildTrack'} />
      <Container component="section" size="sm" py={{ base: 'lg', sm: 'xl' }} aria-busy={fetchingPublicForm}>
        {fetchingPublicForm ? null : publicError || workspaceStatus === 'error' ? (
          <WorkspaceError message={publicError || workspaceError} onRetry={() => publicError
            ? setRetry(value => value + 1) : setWorkspaceRetry(value => value + 1)} />
        ) : accessDenied ? (
          <Paper withBorder p="xl"><Stack>
            <Title order={1}>{deniedAccess.status === 401 ? 'Sign in to continue' : 'Workspace access unavailable'}</Title>
            {deniedAccess.status === 401 ? <GoogleIdentityAccess embedded title="Continue with Google" error={deniedAccess.message} onAuthenticated={finishGoogleSignIn} />
              : <><Alert color="red" role="alert">{deniedAccess.message}</Alert><Button onClick={retryPrivateState}>Retry access</Button></>}
          </Stack></Paper>
        ) : !deliverable || deliverable.status === 'Unpublished' ? (
          <FormUnavailable deliverable={deliverable} />
        ) : result ? (
          <SubmissionResult result={result} identity={identity} onEdit={() => setResult(null)} />
        ) : (
          <Stack gap="md">
            <FormArtwork />
            <Paper className="wt-form-surface" radius="md" p={{ base: 'lg', sm: 'xl' }}>
              <form onSubmit={submit} noValidate>
                <Stack gap="xl">
                  <Stack gap="md">
                    <Title order={1} className="wt-form-title">{deliverable.title}</Title>
                    <Text className="wt-form-instructions">{deliverable.instructions}</Text>
                    <Group className="wt-form-meta" gap="lg" wrap="wrap">
                      <Group gap={7} wrap="nowrap"><CalendarBlank size={18} aria-hidden="true" /><Text size="sm"><Text component="span" fw={700}>Due </Text>{formatDate(deliverable.dueAt)}</Text></Group>
                      <Group gap={7} wrap="nowrap"><Clock size={18} aria-hidden="true" /><Text size="sm" ff="monospace">{formatTime(deliverable.dueAt)}</Text></Group>
                      <Group gap={7} wrap="nowrap">
                        {requiresPdf ? <FilePdf size={18} aria-hidden="true" /> : <LinkSimple size={18} aria-hidden="true" />}
                        <Text size="sm">{requiresPdf ? 'PDF Drive link required' : 'Submission links required'}</Text>
                      </Group>
                    </Group>
                    {activeAccount && ownedResponse ? (
                      <Alert color="blue" variant="light">
                        Your previous response is ready to edit. Saving material changes records a new response-history event.
                      </Alert>
                    ) : null}
                  </Stack>

                  {!activeAccount ? (sessionStatus === 'loading' ? null : (
                    <>
                      <Divider />
                      <GoogleIdentityAccess
                        embedded
                        title="Continue with Google"
                        description="Use your Google account before entering your student and submission details."
                        error={formError}
                        onAuthenticated={finishGoogleSignIn}
                      />
                    </>
                  )) : (
                    <>
                      <Divider />
                      {hydration.key === hydrationKey && hydration.status === 'error' ? <Stack gap="xs">
                        <Alert color="red" role="alert">{formError}</Alert>
                        <Button variant="default" onClick={() => setPrivateRetry(value => value + 1)}>Retry loading your response</Button>
                      </Stack> : null}
                      {roster.key === hydrationKey && roster.status === 'error' ? <Stack gap="xs">
                        <Alert color="red" role="alert">{roster.error}</Alert>
                        <Button variant="default" onClick={() => setRosterRetry(value => value + 1)}>Retry loading class roster</Button>
                      </Stack> : null}
                      <fieldset disabled={!privateReady} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                      <Stack gap="xl">
                      <fieldset disabled={!rosterReady} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                      <StudentIdentityPanel
                        students={identityStudents}
                        identity={identity}
                        activeAccount={activeAccount}
                        errors={identityErrors}
                        mode="submission"
                        onChange={updateIdentity}
                      />
                      </fieldset>

                      <Divider />
                      <Stack gap="md" aria-label="Submission links">
                        {deliverable.fields.map((field) => field.type === 'textarea' ? (
                          <Textarea
                            key={field.id}
                            label={field.label}
                            required={field.required}
                            value={values[field.id] || ''}
                            error={fieldErrors[field.id]}
                            minRows={4}
                            autosize
                            onChange={(event) => updateField(field.id, event.currentTarget.value)}
                          />
                        ) : (
                          <TextInput
                            key={field.id}
                            label={field.label}
                            required={field.required}
                            value={values[field.id] || ''}
                            error={fieldErrors[field.id]}
                            description={field.pdfRequired ? 'Share a Google Drive link that opens to the final PDF.' : undefined}
                            placeholder={field.pdfRequired ? 'https://drive.google.com/file/d/...' : 'https://'}
                            leftSection={field.pdfRequired ? <FilePdf size={18} aria-hidden="true" /> : null}
                            onChange={(event) => updateField(field.id, event.currentTarget.value)}
                          />
                        ))}
                        {formError && hydration.status !== 'error' ? (
                          <Alert color="red" variant="light" icon={<WarningCircle size={20} />} role="alert">{formError}</Alert>
                        ) : null}
                      </Stack>

                      <Divider />
                      <Group justify="space-between" gap="md" wrap="wrap">
                        <Text c="dimmed" size="xs" maw={460}>Submitting records your Google account, selected class identity, and response time.</Text>
                  {draftStatus && (
                    <Text size="sm" c="dimmed" role="status">
                      {draftStatus === 'saving' ? 'Saving draft…' : draftStatus === 'saved' ? 'Draft saved' : draftStatus === 'conflict' ? 'Draft changed in another session. Reload to continue.' : draftStatus === 'error' ? 'Draft not saved' : ''
                    }</Text>
                  )}
                        <Button type="submit" size="md" disabled={!rosterReady} loading={submitting} leftSection={<PaperPlaneTilt size={19} weight="bold" />}>
                          {ownedResponse ? 'Save response changes' : 'Submit response'}
                        </Button>
                      </Group>
                      </Stack>
                      </fieldset>
                    </>
                  )}
                </Stack>
              </form>
            </Paper>
          </Stack>
        )}
      </Container>
    </main>
  );
}
