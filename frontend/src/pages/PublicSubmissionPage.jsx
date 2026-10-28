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
  ThemeIcon,
  Title
} from '@mantine/core';
import { CalendarBlank, Clock, FilePdf, LinkSimple, PaperPlaneTilt, WarningCircle } from '@phosphor-icons/react';
import { Link, useParams } from 'react-router-dom';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { GoogleIdentityAccess } from '../components/auth/GoogleIdentityAccess.jsx';
import { FormArtwork } from '../components/public/FormArtwork.jsx';
import { SubmissionFields } from '../components/public/SubmissionFields.jsx';
import { SubmissionResult } from '../components/public/SubmissionResult.jsx';
import { WildTrackPublicHeader } from '../components/public/WildTrackPublicHeader.jsx';
import {
  findStudent,
  formatDate,
  formatTime,
  getWorkspacePublicKey,
  activeSubmissionValues,
  validateSubmission,
  validateSubmissionIdentity
} from '../lib/workflow.js';
import {
  clearSubmissionDraft,
  commitSubmission,
  confirmSubmissionAssociation,
  describeSubmissionError,
  loadSubmissionState,
  openPublicSubmission,
  openSharedSubmission,
  saveSubmissionDraft
} from '../lib/submissionClient.js';

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
              : 'Ask your instructor for the current deliverable link. This link is unavailable or your account cannot open it.'}
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
  const { slug, workspaceKey, shareToken } = useParams();
  useEffect(() => {
    if (!shareToken) return undefined;
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex, nofollow';
    document.head.append(meta);
    return () => meta.remove();
  }, [shareToken]);
  const {
    session,
    sessionStatus,
    workspaceCatalogStatus,
    account: activeAccount,
    activeWorkspace,
    activeWorkspaceId: selectedWorkspaceId,
    refreshSession
  } = useWorkspaceSession();
  const activeWorkspaceKey = getWorkspacePublicKey(activeWorkspace);
  const targetWorkspaceKey = shareToken ? '' : workspaceKey || activeWorkspaceKey;
  const formKey = JSON.stringify([shareToken || targetWorkspaceKey, slug || '', session?.googleSubject || activeAccount?.email || '']);
  const waitingForWorkspace = !shareToken && !targetWorkspaceKey && (sessionStatus === 'loading' || workspaceCatalogStatus === 'loading');
  const [submitting, setSubmitting] = useState(false);
  const [publicResult, setPublicResult] = useState(null);
  const publicFormPayload = publicResult?.key === formKey ? publicResult.data : null;
  const activeWorkspaceId = publicFormPayload?.workspace?.id || selectedWorkspaceId;
  const fetchingPublicForm = publicResult?.key !== formKey || publicResult?.status === 'loading' || waitingForWorkspace;
  const publicError = publicResult?.key === formKey ? publicResult.error : '';
  const [retry, setRetry] = useState(0);
  const [privateRetry, setPrivateRetry] = useState(0);
  const deliverable = shareToken || publicFormPayload?.deliverable?.slug === slug ? publicFormPayload?.deliverable : null;
  const [identity, setIdentity] = useState({ studentNumber: '', studentName: '', teamCode: '' });
  const [values, setValues] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [draftStatus, setDraftStatus] = useState(''); // '', 'saving', 'saved', 'error'
  const draftRevisionRef = useRef(null);
  const privateScope = useRef(0);
  const [identityErrors, setIdentityErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [identityStudents, setIdentityStudents] = useState([]);
  const student = useMemo(() => findStudent(identityStudents, identity.studentNumber), [identity.studentNumber, identityStudents]);
  const [serverAssociation, setServerAssociation] = useState(null);
  const [myServerResponse, setMyServerResponse] = useState(null);
  const ownedResponse = myServerResponse;
  const hydrationKey = JSON.stringify([activeAccount?.email, session?.googleSubject, session?.authenticated, activeWorkspaceId, formKey, deliverable?.id]);
  const editScopeKey = JSON.stringify([activeAccount?.email, session?.googleSubject, session?.authenticated, formKey]);
  const editScope = useRef('');
  const editedFields = useRef(new Set());
  const identityEdited = useRef(false);
  const [hydration, setHydration] = useState({ key: '', status: 'idle' });
  const rosterReady = Boolean(student);
  const [valuesEdited, setValuesEdited] = useState(false);
  const [deniedAccess, setDeniedAccess] = useState(null);
  const accessDenied = deniedAccess?.key === hydrationKey;
  const privateReady = hydration.key === hydrationKey && hydration.status === 'ready'
    && activeWorkspaceId === publicFormPayload?.workspace?.id && !accessDenied
    && publicResult?.status === 'ready';
  const requiresPdf = Boolean(deliverable?.fields?.some((field) => field.pdfRequired));

  useLayoutEffect(() => {
    privateScope.current += 1;
    setSubmitting(false);
    setVerifying(false);
    setFormError('');
    setIdentityErrors({});
    setFieldErrors({});
    if (editScope.current !== editScopeKey) {
      editScope.current = editScopeKey;
      editedFields.current.clear();
      identityEdited.current = false;
      setValues({});
      setValuesEdited(false);
      setIdentity({ studentNumber: '', studentName: '', teamCode: '' });
    }
    setDeniedAccess(null);
    setHydration({ key: hydrationKey, status: 'idle' });
    setIdentityStudents([]);
    setServerAssociation(null);
    setMyServerResponse(null);
    draftRevisionRef.current = null;
    setDraftStatus('');
    setResult(null);
    return () => { privateScope.current += 1; };
  }, [hydrationKey]);

  useEffect(() => {
    let active = true;
    if (waitingForWorkspace) return () => { active = false; };
    if (!shareToken && (!slug || !targetWorkspaceKey)) {
      setPublicResult({ key: formKey, status: 'ready', data: null });
      return () => { active = false; };
    }
    setPublicResult({ key: formKey, status: 'loading', data: null });
    (shareToken ? openSharedSubmission(shareToken) : openPublicSubmission(targetWorkspaceKey, slug))
      .then((data) => {
        if (!active) return;
        setPublicResult({ key: formKey, status: 'ready', data });
      })
      .catch((error) => {
        if (!active) return;
        setPublicResult({ key: formKey, status: error?.status === 404 ? 'ready' : 'error', data: null,
          error: error?.status === 404 ? '' : error?.message || 'This submission form could not be opened.' });
      });
    return () => { active = false; };
  }, [formKey, targetWorkspaceKey, slug, shareToken, waitingForWorkspace, retry]);

  useEffect(() => {
    const matched = findStudent(identityStudents, serverAssociation?.studentNumber);
    if (!matched || identityEdited.current) return;
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
    loadSubmissionState(activeWorkspaceId, deliverable.id, ...(shareToken ? [shareToken] : []))
      .then(({ association, draft, response, values: restoredValues }) => {
        if (cancelled) return;
        setServerAssociation(association || null);
        if (association?.studentNumber) setIdentityStudents([{ studentNumber: association.studentNumber, name: association.studentName || '', teamCode: association.teamCode || '' }]);
        if (association?.studentNumber && !identityEdited.current) {
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
        // Merge only untouched fields: restoration must not erase typing during a slow request.
        setValues(current => ({ ...restoredValues, ...Object.fromEntries(
          [...editedFields.current].filter(id => Object.hasOwn(current, id)).map(id => [id, current[id]])
        ) }));
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
      saveSubmissionDraft(activeWorkspaceId, deliverable.id, activeSubmissionValues(deliverable, values, student), draftRevisionRef.current, ...(shareToken ? [shareToken] : []))
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
  }, [activeWorkspaceId, deliverable?.id, privateReady, valuesEdited, submitting, result, student, values]);

  function updateField(id, value) {
    if (!activeAccount || accessDenied || submitting) return;
    editedFields.current.add(id);
    setValuesEdited(true);
    setValues((current) => ({ ...current, [id]: value }));
    setFieldErrors((current) => ({ ...current, [id]: '' }));
  }

  function updateIdentity(nextIdentity) {
    if (!activeAccount || accessDenied || submitting) return;
    identityEdited.current = true;
    setIdentity(nextIdentity);
    setIdentityErrors({});
    setFormError('');
  }

  async function verifyStudent() {
    if (verifying || !deliverable?.id) return;
    const scope = privateScope.current;
    setFormError('');
    setVerifying(true);
    try {
      const matched = await confirmSubmissionAssociation(activeWorkspaceId, identity.studentNumber, identity.studentName, deliverable.id, ...(shareToken ? [shareToken] : []));
      if (scope !== privateScope.current) return;
      setIdentityStudents([{ studentNumber: matched.studentNumber, name: matched.studentName, teamCode: matched.teamCode || '' }]);
      setIdentity({ studentNumber: matched.studentNumber, studentName: matched.studentName, teamCode: matched.teamCode || '' });
    } catch (error) {
      if (scope !== privateScope.current) return;
      setIdentityStudents([]);
      setFormError(describeSubmissionError(error));
    } finally {
      if (scope === privateScope.current) setVerifying(false);
    }
  }

  async function finishGoogleSignIn(identity, verifiedSession) {
    const scope = privateScope.current;
    const current = verifiedSession || await refreshSession();
    if (!current?.authenticated) setFormError('Google sign-in completed, but the WildTrack session could not be opened.');
    else if (privateScope.current === scope) retryPrivateState();
  }

  function retryPrivateState() {
    setServerAssociation(null);
    setMyServerResponse(null);
    setHydration({ key: hydrationKey, status: 'idle' });
    setDeniedAccess(null);
    setPrivateRetry(value => value + 1);
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
    const submittedValues = activeSubmissionValues(deliverable, values, student);
    const nextIdentityErrors = validateSubmissionIdentity({ deliverable, identity, student, values: submittedValues });
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
    const validation = validateSubmission({ deliverable, values: submittedValues });
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      setFormError('Review the required submission fields and try again.');
      return;
    }
    setSubmitting(true);
    try {
      const saved = await commitSubmission(
        activeWorkspaceId, deliverable.id, submittedValues, myServerResponse?.revision ?? null, identity.studentNumber, identity.studentName, ...(shareToken ? [shareToken] : []));
      if (submittingScope !== privateScope.current) return;
      if (saved.conflict) {
        setFormError('A newer version was saved from another session. Reload the form to continue editing.');
        return;
      }
      clearSubmissionDraft(activeWorkspaceId, deliverable.id, ...(shareToken ? [shareToken] : [])).catch(() => {});
      setMyServerResponse((current) => ({ ...current, id: saved.responseId, revision: saved.revision, values: submittedValues }));
      setValuesEdited(false);
      window.dispatchEvent(new Event('wildtrack:server-mutation'));
      window.dispatchEvent(new Event('wildtrack:refresh-resources'));
      refreshSession?.();
      setResult({
        ok: true,
        updated: saved.changed && Boolean(myServerResponse),
        unchanged: !saved.changed,
        attempt: { values: submittedValues, primaryStatus: 'Submitted', reviewStatus: 'PENDING_REVIEW' },
        student: { name: student.name, studentNumber: student.studentNumber, teamCode: student.teamCode },
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
        {fetchingPublicForm ? null : publicError ? (
          <WorkspaceError message={publicError} onRetry={() => setRetry(value => value + 1)} />
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
                        You can edit your previous submission below. When you're done, select Save response changes.
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
                      <fieldset disabled={submitting} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                      <Stack gap="xl">
                      {!serverAssociation && !student ? <Stack>
                        <TextInput label="Student Number" required value={identity.studentNumber} disabled={verifying} onChange={event => updateIdentity({ ...identity, studentNumber: event.currentTarget.value })} />
                        <TextInput label="Student Name" required value={identity.studentName} disabled={verifying} onChange={event => updateIdentity({ ...identity, studentName: event.currentTarget.value })} />
                        <Button type="button" onClick={verifyStudent} loading={verifying} disabled={!identity.studentNumber.trim() || !identity.studentName.trim()}>Verify student details</Button>
                      </Stack> : null}
                      <SubmissionFields
                        fields={deliverable.fields}
                        values={values}
                        errors={fieldErrors}
                        onValueChange={updateField}
                        students={identityStudents}
                        identity={identity}
                        identityErrors={identityErrors}
                        onIdentityChange={updateIdentity}
                        activeAccount={activeAccount}
                        disabled={submitting}
                        hideIdentity={!student}
                      />
                      {formError && hydration.status !== 'error' ? (
                        <Alert color="red" variant="light" icon={<WarningCircle size={20} />} role="alert">{formError}</Alert>
                      ) : null}

                      <Divider />
                      <Group justify="space-between" gap="md" wrap="wrap">
                        <Text c="dimmed" size="xs" maw={460}>When you submit, we save your Google account, student details, and submission time.</Text>
                  {draftStatus && (
                    <Text size="sm" c="dimmed" role="status">
                      {draftStatus === 'saving' ? 'Saving draft…' : draftStatus === 'saved' ? 'Draft saved' : draftStatus === 'conflict' ? 'Draft changed in another session. Reload to continue.' : draftStatus === 'error' ? 'Draft not saved' : ''
                    }</Text>
                  )}
                        <Button type="submit" size="md" disabled={!privateReady || !rosterReady} loading={submitting} leftSection={<PaperPlaneTilt size={19} weight="bold" />}>
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
