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
import { GoogleIdentityAccess } from '../components/auth/GoogleIdentityAccess.jsx';
import { FormArtwork } from '../components/public/FormArtwork.jsx';
import { StudentIdentityPanel } from '../components/public/StudentIdentityPanel.jsx';
import { SubmissionResult } from '../components/public/SubmissionResult.jsx';
import { WildTrackPublicHeader } from '../components/public/WildTrackPublicHeader.jsx';
import {
  findStudent,
  findOwnedResponse,
  formatDate,
  formatTime,
  getDeliverable,
  getIdentityStudents,
  getWorkspacePublicKey,
  normalizeStudentNumber
} from '../lib/workflow.js';
import { ApiError, clearDraft, getDraft, getMyAssociation, getPublicSubmissionForm, saveDraft, submitResponse } from '../lib/api.js';

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
    activeWorkspace,
    activeWorkspaceId,
    authenticateGoogleAccount,
    switchWorkspace,
    submitPublicForm
  } = useWorkflow();
  const activeWorkspaceKey = getWorkspacePublicKey(activeWorkspace);
  const isSyncLoading = !state.backendSync?.lastLoadedAt && state.backendSync?.enabled !== false;
  const [workspaceStatus, setWorkspaceStatus] = useState(
    !workspaceKey || (workspaceKey === activeWorkspaceId || workspaceKey === activeWorkspaceKey) ? 'ready' : 'loading'
  );
  const [workspaceError, setWorkspaceError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [publicFormPayload, setPublicFormPayload] = useState(null);
  const stateDeliverable = getDeliverable(state, slug);
  const [fetchingPublicForm, setFetchingPublicForm] = useState(!stateDeliverable && Boolean(slug));
  const deliverable = stateDeliverable || (publicFormPayload?.deliverable && publicFormPayload.deliverable.slug === slug ? {
    id: publicFormPayload.deliverable.id,
    slug: publicFormPayload.deliverable.slug,
    title: publicFormPayload.deliverable.title,
    shortTitle: publicFormPayload.deliverable.trackerColumnKey,
    dueAt: publicFormPayload.deliverable.dueAt,
    trackerColumn: publicFormPayload.deliverable.trackerColumnKey,
    audience: 'Students',
    status: publicFormPayload.deliverable.status === 'PUBLISHED' ? 'Published' : 'Unpublished',
    instructions: publicFormPayload.deliverable.instructions || '',
    fields: publicFormPayload.deliverable.pdfRequired
      ? [{ id: 'documentPdf', label: 'PDF Drive Link', type: 'drive', required: true, pdfRequired: true }]
      : [{ id: 'primaryLink', label: 'Submission Link', type: 'url', required: true, pdfRequired: false }]
  } : null);
  const activeAccount = useMemo(
    () => state.studentAccounts.find((account) => (
      account.googleSubject && account.email.toLowerCase() === String(state.activeAccountEmail || '').toLowerCase()
    )) || null,
    [state.activeAccountEmail, state.studentAccounts]
  );
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
  const ownedResponse = useMemo(() => findOwnedResponse(state.attempts, {
    deliverableId: deliverable?.id,
    studentNumber: identity.studentNumber,
    googleSubject: activeAccount?.googleSubject,
    googleEmail: activeAccount?.email
  }), [activeAccount?.email, activeAccount?.googleSubject, deliverable?.id, identity.studentNumber, state.attempts]);
  const sameStudentResponseExists = useMemo(() => {
    if (!deliverable || !identity.studentNumber) return false;
    return state.attempts.some((response) => normalizeStudentNumber(response.studentNumber) === normalizeStudentNumber(identity.studentNumber) && response.deliverableId === deliverable.id);
  }, [deliverable, identity.studentNumber, state.attempts]);
  const identityStudents = useMemo(() => getIdentityStudents(state.students), [state.students]);
  const requiresPdf = Boolean(deliverable?.fields?.some((field) => field.pdfRequired));

  useEffect(() => {
    let active = true;
    if (!stateDeliverable && slug) {
      setFetchingPublicForm(true);
      const targetWorkspaceKey = workspaceKey || activeWorkspaceKey || 'default';
      getPublicSubmissionForm(targetWorkspaceKey, slug)
        .then((data) => {
          if (!active) return;
          if (data?.deliverable) {
            setPublicFormPayload(data);
          }
          setFetchingPublicForm(false);
        })
        .catch(() => {
          if (!active) return;
          setFetchingPublicForm(false);
        });
    } else {
      setFetchingPublicForm(false);
    }

    if (workspaceKey && (workspaceKey !== activeWorkspaceId && workspaceKey !== activeWorkspaceKey)) {
      setWorkspaceStatus('loading');
      setWorkspaceError('');
      switchWorkspace(workspaceKey)
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
    } else {
      setWorkspaceStatus('ready');
    }

    return () => { active = false; };
  }, [slug, workspaceKey, activeWorkspaceKey, activeWorkspaceId, switchWorkspace, stateDeliverable]);

  useEffect(() => {
    const targetStudentNumber = activeAccount?.studentNumber || queryStudent || state.activeStudentNumber;
    if (!targetStudentNumber) return;
    const matched = findStudent(identityStudents, targetStudentNumber);
    if (matched) {
      setIdentity((current) => ({
        studentNumber: matched.studentNumber || current.studentNumber,
        studentName: matched.name || current.studentName,
        teamCode: matched.teamCode || current.teamCode
      }));
    }
  }, [activeAccount?.studentNumber, identityStudents, queryStudent, state.activeStudentNumber]);

  // Ticket 03: restore the workspace-scoped association for returning sessions.
  useEffect(() => {
    let cancelled = false;
    if (!activeWorkspaceId || !activeAccount?.email) return undefined;
    getMyAssociation(activeWorkspaceId)
      .then((association) => {
        if (cancelled || !association || !association.studentNumber) return;
        const matched = findStudent(identityStudents, association.studentNumber);
        setIdentity({
          studentNumber: association.studentNumber,
          studentName: association.studentName || matched?.name || '',
          teamCode: association.teamCode || matched?.teamCode || ''
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeWorkspaceId, activeAccount?.email, identityStudents]);
  // Ticket 05: restore any saved draft once the deliverable is known.
  useEffect(() => {
    let cancelled = false;
    if (!activeWorkspaceId || !deliverable?.id || !activeAccount?.googleSubject) return undefined;
    getDraft(activeWorkspaceId, deliverable.id)
      .then((draft) => {
        if (cancelled || !draft?.present || !draft.values) return;
        setValues((current) => (Object.keys(current).length ? current : draft.values));
        draftRevisionRef.current = draft.revision;
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeWorkspaceId, deliverable?.id, activeAccount?.googleSubject]);

  // Ticket 05: debounced autosave on material field changes.
  useEffect(() => {
    if (!activeWorkspaceId || !deliverable?.id || !activeAccount?.googleSubject) return undefined;
    if (!Object.keys(values).length) return undefined;
    setDraftStatus('saving');
    const timer = setTimeout(() => {
      saveDraft(activeWorkspaceId, deliverable.id, values, draftRevisionRef.current)
        .then((saved) => {
          if (saved.conflict) {
            setDraftStatus('error');
            return;
          }
          draftRevisionRef.current = saved.revision;
          setDraftStatus('saved');
        })
        .catch(() => setDraftStatus('error'));
    }, 1200);
    return () => clearTimeout(timer);
  }, [values, activeWorkspaceId, deliverable?.id, activeAccount?.googleSubject]);

  useEffect(() => {
    setValues(ownedResponse?.values ? { ...ownedResponse.values } : {});
    setFieldErrors({});
  }, [deliverable?.id, identity.studentNumber, ownedResponse?.id]);

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
    setSubmitting(true);
    // Ticket 04: signed-in submissions persist server-side keyed by Google subject.
    if (activeWorkspaceId && activeAccount?.googleSubject) {
      try {
        const saved = await submitResponse(activeWorkspaceId, deliverable.id, values);
        setSubmitting(false);
        if (saved.conflict) {
          setFormError('A newer version was saved from another session. Reload the form to continue editing.');
          return;
        }
        setResult({
          ok: true,
          updated: saved.changed && saved.revision > 1,
          unchanged: !saved.changed,
          attempt: { values, primaryStatus: 'Submitted', reviewStatus: 'PENDING_REVIEW' },
          student: { name: identity.studentName, studentNumber: identity.studentNumber, teamCode: identity.teamCode },
          deliverable: { title: deliverable.title || '', shortTitle: deliverable.title || '' },
          trackerSync: null,
        });
        return;
      } catch (backendError) {
        // Backend unreachable or not configured: local persistence keeps dev flows working.
        // Backend unreachable: fall through to local persistence (dev mode).
      }
    }
    const response = await submitPublicForm(deliverable.slug, {
      ...identity,
      googleSubject: activeAccount?.googleSubject || '',
      googleEmail: activeAccount?.email || '',
      values
    });
    setSubmitting(false);
    if (!response.ok) {
      setFieldErrors(response.fieldErrors || {});
      setFormError(response.formError || 'The response could not be saved. Review the form and try again.');
      return;
    }
    setResult(response);
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
                    ) : activeAccount && sameStudentResponseExists ? (
                      <Alert color="blue" variant="light">
                        A response already exists for this Student Number. Existing submitted links stay private and are not filled into this form.
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
                        {formError ? <Alert color="red" variant="light" icon={<WarningCircle size={20} />} role="alert">{formError}</Alert> : null}
                      </Stack>

                      <Divider />
                      <Group justify="space-between" gap="md" wrap="wrap">
                        <Text c="dimmed" size="xs" maw={460}>Submitting records your Google account, selected class identity, and response time.</Text>
                  {draftStatus && (
                    <Text size="sm" c="dimmed" role="status">
                      {draftStatus === 'saving' ? 'Saving draft…' : draftStatus === 'saved' ? 'Draft saved' : draftStatus === 'error' ? 'Draft not saved' : ''
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
