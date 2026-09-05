import { useEffect, useMemo, useRef, useState } from 'react';
import {

  Alert,
  Button,
  Center,
  Container,
  Divider,
  Group,
  Loader,
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
import { useWorkflow } from '../app/WorkflowContext.jsx';
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

function FormLoading() {
  return (
    <Paper className="wt-form-surface" radius="md" p="xl">
      <Center mih={280}>
        <Stack align="center" gap="md">
          <Loader color="wildtrackMaroon" size="md" />
          <Title order={1} size="h3">Opening submission form</Title>
          <Text c="dimmed">Loading the academic workspace connected to this link.</Text>
        </Stack>
      </Center>
    </Paper>
  );
}

function WorkspaceError({ message }) {
  return (
    <Paper className="wt-form-surface" radius="md" p={{ base: 'lg', sm: 'xl' }}>
      <Center mih={300}>
        <Stack align="center" gap="md" maw={520} ta="center">
          <ThemeIcon color="red" variant="light" size={48} radius="sm">
            <WarningCircle size={28} weight="duotone" aria-hidden="true" />
          </ThemeIcon>
          <Title order={1} size="h2">Unable to open submission form</Title>
          <Alert color="red" variant="light" role="alert">{message}</Alert>
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
    state,
    authenticateGoogleAccount,
    refreshBackendData
  } = useWorkflow();
  const {
    session,
    account: activeAccount,
    activeWorkspace,
    activeWorkspaceId,
    needsWorkspaceChoice,
    switchWorkspace
  } = useWorkspaceSession();
  const activeWorkspaceKey = getWorkspacePublicKey(activeWorkspace);
  const [workspaceStatus, setWorkspaceStatus] = useState('loading');
  const [workspaceError, setWorkspaceError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [publicFormPayload, setPublicFormPayload] = useState(null);
  const [fetchingPublicForm, setFetchingPublicForm] = useState(Boolean(slug));
  const deliverable = publicFormPayload?.deliverable?.slug === slug ? publicFormPayload.deliverable : null;
  const queryStudent = searchParams.get('student') || '';
  const [identity, setIdentity] = useState({ studentNumber: '', studentName: '', teamCode: '' });
  const [values, setValues] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [draftStatus, setDraftStatus] = useState(''); // '', 'saving', 'saved', 'error'
  const draftRevisionRef = useRef(null);
  const [identityErrors, setIdentityErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState(null);
  const student = useMemo(() => findStudent(state.students, identity.studentNumber), [identity.studentNumber, state.students]);
  const [serverAssociation, setServerAssociation] = useState(null);
  const [myServerResponse, setMyServerResponse] = useState(null);
  const ownedResponse = myServerResponse;
  const identityStudents = useMemo(() => getIdentityStudents(state.students), [state.students]);
  const requiresPdf = Boolean(deliverable?.fields?.some((field) => field.pdfRequired));

  useEffect(() => {
    setValues({});
    setServerAssociation(null);
    setMyServerResponse(null);
    draftRevisionRef.current = null;
    setDraftStatus('');
    setResult(null);
    if (session?.authenticated) {
      setIdentity({ studentNumber: '', studentName: '', teamCode: '' });
    }
  }, [activeAccount?.email, deliverable?.id, publicFormPayload?.workspace?.id, session?.authenticated]);

  useEffect(() => {
    let active = true;
    const targetWorkspaceKey = workspaceKey || activeWorkspaceKey;
    if (!slug || !targetWorkspaceKey) {
      setFetchingPublicForm(false);
      setPublicFormPayload(null);
      setWorkspaceStatus('ready');
      return () => { active = false; };
    }
    setFetchingPublicForm(true);
    setWorkspaceError('');
    openPublicSubmission(targetWorkspaceKey, slug)
      .then((data) => {
        if (!active) return;
        setPublicFormPayload(data || null);
        setFetchingPublicForm(false);
        const needsPrivateWorkspace = session?.authenticated && data?.workspace?.id && (
          needsWorkspaceChoice || data.workspace.id !== activeWorkspaceId
        );
        setWorkspaceStatus(needsPrivateWorkspace ? 'loading' : 'ready');
      })
      .catch((error) => {
        if (!active) return;
        setPublicFormPayload(null);
        setFetchingPublicForm(false);
        setWorkspaceStatus('error');
        setWorkspaceError(error?.message || 'This submission form could not be opened.');
      });
    return () => { active = false; };
  }, [activeWorkspaceId, activeWorkspaceKey, needsWorkspaceChoice, session?.authenticated, slug, workspaceKey]);

  useEffect(() => {
    let active = true;
    const targetWorkspaceId = publicFormPayload?.workspace?.id;
    if (!session?.authenticated || !targetWorkspaceId || (!needsWorkspaceChoice && targetWorkspaceId === activeWorkspaceId)) {
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
  }, [activeWorkspaceId, needsWorkspaceChoice, publicFormPayload?.workspace?.id, session?.authenticated, switchWorkspace]);

  useEffect(() => {
    const targetStudentNumber = queryStudent;
    if (session?.authenticated) return;
    if (!targetStudentNumber) return;
    const matched = findStudent(identityStudents, targetStudentNumber);
    if (matched) {
      setIdentity((current) => ({
        studentNumber: matched.studentNumber || current.studentNumber,
        studentName: matched.name || current.studentName,
        teamCode: matched.teamCode || current.teamCode
      }));
    }
  }, [identityStudents, queryStudent, session?.authenticated]);

  useEffect(() => {
    let cancelled = false;
    const targetWorkspaceId = publicFormPayload?.workspace?.id;
    if (!session?.authenticated || !activeWorkspaceId || activeWorkspaceId !== targetWorkspaceId || !deliverable?.id) {
      setServerAssociation(null);
      setMyServerResponse(null);
      return () => { cancelled = true; };
    }
    loadSubmissionState(activeWorkspaceId, deliverable.id)
      .then(({ association, draft, response }) => {
        if (cancelled) return;
        setServerAssociation(association || null);
        if (association?.studentNumber) {
          const matched = findStudent(identityStudents, association.studentNumber);
          setIdentity({
            studentNumber: association.studentNumber,
            studentName: matched?.name || association.studentName || '',
            teamCode: association.teamCode || matched?.teamCode || ''
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
        setValues(response?.values ? { ...response.values } : draft?.values ? { ...draft.values } : {});
        setFormError('');
      })
      .catch((error) => {
        if (cancelled) return;
        setServerAssociation(null);
        setMyServerResponse(null);
        setFormError(describeSubmissionError(error));
      });
    return () => { cancelled = true; };
  }, [activeAccount?.email, activeWorkspaceId, deliverable?.id, identityStudents, publicFormPayload?.workspace?.id, session?.authenticated]);

  useEffect(() => {
    if (!session?.authenticated || !activeWorkspaceId || activeWorkspaceId !== publicFormPayload?.workspace?.id || !deliverable?.id) return undefined;
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
  }, [activeWorkspaceId, deliverable?.id, publicFormPayload?.workspace?.id, session?.authenticated, values]);

  function updateField(id, value) {
    setValues((current) => ({ ...current, [id]: value }));
    setFieldErrors((current) => ({ ...current, [id]: '' }));
  }

  function updateIdentity(nextIdentity) {
    setIdentity(nextIdentity);
    setIdentityErrors({});
    setFormError('');
  }

  function finishGoogleSignIn(googleIdentity) {
    const response = authenticateGoogleAccount(googleIdentity);
    if (!response.ok) setFormError(response.error);
  }

  async function submit(event) {
    event.preventDefault();
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
        setServerAssociation(association || null);
      }
      const saved = await commitSubmission(activeWorkspaceId, deliverable.id, values);
      if (saved.conflict) {
        setFormError('A newer version was saved from another session. Reload the form to continue editing.');
        return;
      }
      clearSubmissionDraft(activeWorkspaceId, deliverable.id).catch(() => {});
      refreshBackendData?.({ silent: true })?.catch?.(() => {});
      setResult({
        ok: true,
        updated: saved.changed && saved.revision > 1,
        unchanged: !saved.changed,
        attempt: { values, primaryStatus: 'Submitted', reviewStatus: 'PENDING_REVIEW' },
        student: { name: identity.studentName, studentNumber: identity.studentNumber, teamCode: identity.teamCode },
        deliverable: { title: deliverable.title || '', shortTitle: deliverable.shortTitle || deliverable.title || '' },
        trackerSync: null
      });
    } catch (error) {
      setFormError(describeSubmissionError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="wt-public-root">
      <WildTrackPublicHeader subtitle={state.classRecord.name} />
      <Container component="section" size="sm" py={{ base: 'lg', sm: 'xl' }}>
        {(workspaceStatus === 'loading' || (fetchingPublicForm && !deliverable)) ? <FormLoading /> : workspaceStatus === 'error' ? (
          <WorkspaceError message={workspaceError} />
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

                  {!activeAccount ? (
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
                  ) : (
                    <>
                      <Divider />
                      <StudentIdentityPanel
                        students={identityStudents}
                        identity={identity}
                        activeAccount={activeAccount}
                        errors={identityErrors}
                        mode="submission"
                        onChange={updateIdentity}
                      />

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
                        {formError ? (
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
                        <Button type="submit" size="md" loading={submitting} leftSection={<PaperPlaneTilt size={19} weight="bold" />}>
                          {ownedResponse ? 'Save response changes' : 'Submit response'}
                        </Button>
                      </Group>
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
