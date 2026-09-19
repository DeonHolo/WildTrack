import {
  Checkbox,
  Divider,
  Radio,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea
} from '@mantine/core';
import { FilePdf } from '@phosphor-icons/react';
import { StudentIdentityPanel } from './StudentIdentityPanel.jsx';
import { findStudent } from '../../lib/workflow.js';
import { ACADEMIC_FIELD_TYPES } from '../../lib/forms.js';

export function hasAcademicDefinitions(fields = []) {
  return fields.some((field) => field.active !== false && ACADEMIC_FIELD_TYPES.has(field.type));
}

export function SubmissionFields({
  fields = [],
  values = {},
  errors = {},
  onValueChange,
  students = [],
  identity = { studentNumber: '', studentName: '', teamCode: '' },
  identityErrors = {},
  onIdentityChange,
  activeAccount = null,
  disabled = false
}) {
  const activeFields = fields.filter((field) => field.active !== false);
  const configuredIdentity = hasAcademicDefinitions(activeFields);
  const renderedFields = configuredIdentity ? ensureStudentNumberAnchor(activeFields) : activeFields;

  function changeAcademicIdentity(nextIdentity) {
    if (nextIdentity.studentNumber !== identity.studentNumber) {
      const selected = findStudent(students, nextIdentity.studentNumber);
      renderedFields.filter((field) => field.type === 'academicSection').forEach((field) => {
        const section = selected?.section || '';
        if (section || Object.hasOwn(values, field.id)) onValueChange?.(field.id, section);
      });
    }
    onIdentityChange?.(nextIdentity);
  }

  if (!configuredIdentity) {
    return (
      <Stack gap="xl">
        <StudentIdentityPanel
          students={students}
          identity={identity}
          activeAccount={activeAccount}
          errors={identityErrors}
          mode="submission"
          onChange={onIdentityChange}
        />
        <Divider />
        <Stack gap="md" aria-label="Submission questions">
          {renderedFields.map((field) => (
            <ResponseField
              key={field.id}
              field={field}
              value={values[field.id]}
              error={errors[field.id]}
              disabled={disabled}
              onChange={(value) => onValueChange?.(field.id, value)}
            />
          ))}
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack gap="md" aria-label="Submission questions">
      {renderedFields.map((field) => ACADEMIC_FIELD_TYPES.has(field.type) ? (
        <AcademicField
          key={field.id}
          field={field}
          value={values[field.id]}
          valueError={errors[field.id]}
          students={students}
          identity={identity}
          errors={identityErrors}
          disabled={disabled}
          onChange={changeAcademicIdentity}
          onValueChange={(value) => onValueChange?.(field.id, value)}
        />
      ) : (
        <ResponseField
          key={field.id}
          field={field}
          value={values[field.id]}
          error={errors[field.id]}
          disabled={disabled}
          onChange={(value) => onValueChange?.(field.id, value)}
        />
      ))}
    </Stack>
  );
}

function AcademicField({ field, value, valueError, students, identity, errors, disabled, onChange, onValueChange }) {
  const matched = findStudent(students, identity.studentNumber);
  const scopedStudents = identity.teamCode
    ? students.filter((student) => student.teamCode === identity.teamCode)
    : students;
  const studentOptions = scopedStudents
    .filter((student) => student.studentNumber)
    .map((student) => ({ value: student.studentNumber, label: student.studentNumber }));
  const nameOptions = scopedStudents
    .filter((student) => student.studentNumber && student.name)
    .map((student) => ({ value: student.studentNumber, label: student.name }));
  const teamOptions = [...new Set(students.map((student) => student.teamCode).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
  const required = field.type === 'academicStudentNumber' ? true : field.required !== false;
  const description = field.helpText || undefined;

  if (field.type === 'academicStudentNumber') {
    return <Select searchable label={field.label} description={description} required={required} disabled={disabled}
      data={studentOptions} value={identity.studentNumber || null} error={errors.studentNumber}
      placeholder="Search Student Number" onChange={(value) => value && selectStudent(students, value, identity, onChange)} />;
  }
  if (field.type === 'academicStudentName') {
    return <Select searchable label={field.label} description={description} required={required} disabled={disabled}
      data={nameOptions} value={matched?.studentNumber || null} error={errors.studentName}
      placeholder="Search student name" onChange={(value) => value && selectStudent(students, value, identity, onChange)} />;
  }
  if (field.type === 'academicTeamCode') {
    return <Select searchable label={field.label} description={description || 'Linked to the selected Student Number.'}
      required={required} disabled={disabled} data={teamOptions}
      value={identity.teamCode || null} error={errors.teamCode} clearable={!required}
      placeholder="Search team code"
      onChange={(teamCode) => selectTeam(matched, teamCode || '', identity, onChange)} />;
  }
  return (
    <TextInput
      label={field.label}
      description={description || 'Enter your section. The class-record value is used as the starting value when available.'}
      value={value !== undefined ? value : matched?.section || ''}
      placeholder="Enter section"
      disabled={disabled}
      required={required}
      error={valueError || errors.section}
      onChange={(event) => onValueChange?.(event.currentTarget.value)}
    />
  );
}

function selectTeam(matched, teamCode, identity, onChange) {
  if (matched && matched.teamCode !== teamCode) {
    onChange?.({ studentNumber: '', studentName: '', teamCode });
    return;
  }
  onChange?.({ ...identity, teamCode });
}

function selectStudent(students, studentNumber, identity, onChange) {
  const student = findStudent(students, studentNumber);
  if (!student) {
    onChange?.({ ...identity, studentNumber });
    return;
  }
  onChange?.({
    ...identity,
    studentNumber: student.studentNumber,
    studentName: student.name,
    teamCode: student.teamCode
  });
}

function ResponseField({ field, value, error, disabled, onChange }) {
  const description = field.helpText || submissionFieldDescription(field);
  if (field.type === 'textarea') {
    return <Textarea label={field.label} description={description} required={field.required} value={value || ''}
      error={error} disabled={disabled} minRows={4} autosize onChange={(event) => onChange(event.currentTarget.value)} />;
  }
  if (field.type === 'dropdown') {
    return <Select label={field.label} description={description} required={field.required} value={value || null}
      error={error} disabled={disabled} data={choiceData(field)} clearable={!field.required}
      onChange={(next) => onChange(next || '')} />;
  }
  if (field.type === 'multipleChoice') {
    return (
      <Radio.Group label={field.label} description={description} required={field.required} value={value || ''}
        error={error} onChange={onChange}>
        <Stack gap="xs" mt="xs">{choiceData(field).map((option) => (
          <Radio key={option.value} value={option.value} label={option.label} disabled={disabled} />
        ))}</Stack>
      </Radio.Group>
    );
  }
  if (field.type === 'checkboxes') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <Checkbox.Group label={field.label} description={description} required={field.required} value={selected}
        error={error} onChange={onChange}>
        <Stack gap="xs" mt="xs">{choiceData(field).map((option) => (
          <Checkbox key={option.value} value={option.value} label={option.label} disabled={disabled} />
        ))}</Stack>
      </Checkbox.Group>
    );
  }
  return (
    <TextInput
      label={field.label}
      description={description}
      required={field.required}
      value={value || ''}
      error={error}
      disabled={disabled}
      placeholder={submissionFieldPlaceholder(field)}
      leftSection={field.pdfRequired ? <FilePdf size={18} aria-hidden="true" /> : null}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function choiceData(field) {
  return (field.options || [])
    .filter((option) => (option.id || option._localKey) && String(option.label || '').trim())
    .map((option) => ({ value: option.id || option._localKey, label: option.label }));
}

function ensureStudentNumberAnchor(fields) {
  if (fields.some((field) => field.type === 'academicStudentNumber')) return fields;
  return [{
    id: '__academicStudentNumberAnchor',
    label: 'Student Number',
    type: 'academicStudentNumber',
    required: true,
    active: true,
    helpText: 'Required to connect this response to your class record.'
  }, ...fields];
}

function submissionFieldDescription(field) {
  if (field.pdfRequired || field.type === 'drive') return 'Share a Google Drive file link that opens to the final PDF.';
  if (field.type === 'googleForm') return 'Paste the shareable Google Form link.';
  if (field.type === 'googleSheet') return 'Paste the shareable Google Sheet link.';
  if (field.type === 'driveFolder') return 'Paste the shareable Google Drive folder link.';
  return undefined;
}

function submissionFieldPlaceholder(field) {
  if (field.type === 'shortText') return '';
  if (field.pdfRequired || field.type === 'drive') return 'https://drive.google.com/file/d/...';
  if (field.type === 'googleForm') return 'https://docs.google.com/forms/d/...';
  if (field.type === 'googleSheet') return 'https://docs.google.com/spreadsheets/d/...';
  if (field.type === 'driveFolder') return 'https://drive.google.com/drive/folders/...';
  return 'https://';
}
