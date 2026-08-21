import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Combobox,
  Group,
  InputBase,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  useCombobox
} from '@mantine/core';
import {
  CaretDown,
  CheckCircle,
  GoogleLogo,
  IdentificationCard,
  MagnifyingGlass
} from '@phosphor-icons/react';
import { isUsableAdviserName } from '../../lib/workflow.js';

function SearchableIdentityField({ label, placeholder, value, options, onChange, onSelect, renderOption, emptyLabel, error }) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });
  const [query, setQuery] = useState(value || '');

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  const matches = useMemo(() => {
    const needle = query.toLowerCase().trim();
    return options
      .filter((option) => !needle || option.searchText.toLowerCase().includes(needle))
      .slice(0, 30);
  }, [options, query]);

  function selectOption(optionValue) {
    const selected = options.find((option) => option.value === optionValue) || null;
    if (!selected) return;
    setQuery(selected.inputValue);
    onSelect(selected);
    combobox.closeDropdown();
  }

  return (
    <Combobox store={combobox} onOptionSubmit={selectOption} withinPortal={false}>
      <Combobox.Target>
        <InputBase
          label={label}
          required
          value={query}
          leftSection={<MagnifyingGlass size={18} aria-hidden="true" />}
          rightSection={<CaretDown size={16} aria-hidden="true" />}
          placeholder={placeholder}
          error={error}
          role="combobox"
          aria-expanded={combobox.dropdownOpened}
          onFocus={() => combobox.openDropdown()}
          onClick={() => combobox.openDropdown()}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setQuery(nextValue);
            onChange(nextValue);
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options mah={280} style={{ overflowY: 'auto' }}>
          {matches.length ? matches.map((option) => (
            <Combobox.Option key={option.value} value={option.value}>
              {renderOption(option)}
            </Combobox.Option>
          )) : <Combobox.Empty>{emptyLabel}</Combobox.Empty>}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

function studentOptions(students, inputKey) {
  return students.map((student) => ({
    value: student.studentNumber,
    inputValue: inputKey === 'name' ? student.name : student.studentNumber,
    searchText: `${student.studentNumber} ${student.name} ${student.teamCode}`,
    student
  }));
}

function teamOptions(students) {
  return [...new Set(students.map((student) => student.teamCode).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }))
    .map((teamCode) => ({
      value: teamCode,
      inputValue: teamCode,
      searchText: teamCode,
      teamCode
    }));
}

function StudentOption({ option, primary }) {
  const student = option.student;
  return (
    <Group gap="md" wrap="nowrap" align="flex-start">
      <Text ff={primary === 'number' ? 'monospace' : undefined} fw={650} size="sm" className="wt-nowrap">
        {primary === 'number' ? student.studentNumber : student.name}
      </Text>
      <div>
        <Text fw={650} size="sm">{primary === 'number' ? student.name : student.studentNumber}</Text>
        <Text c="dimmed" size="xs">{student.teamCode}</Text>
      </div>
    </Group>
  );
}

function StudentNumberField({ students, value, onChange, onSelect }) {
  const options = useMemo(() => studentOptions(students, 'number'), [students]);
  return (
    <SearchableIdentityField
      label="Student Number"
      placeholder="Search Student Number"
      value={value}
      options={options}
      onChange={onChange}
      onSelect={(option) => onSelect(option.student)}
      renderOption={(option) => <StudentOption option={option} primary="number" />}
      emptyLabel="No matching Student Number"
    />
  );
}

function IdentitySummary({ student, email }) {
  if (!student) return null;
  return (
    <Paper className="wt-identity-summary" radius="sm" p="md" aria-label="Selected student record">
      <Group gap="md" align="flex-start" wrap="nowrap">
        <ThemeIcon color="wildtrackMaroon.7" variant="light" radius="sm" size={38}>
          <IdentificationCard size={21} weight="duotone" aria-hidden="true" />
        </ThemeIcon>
        <Stack gap={3} flex={1}>
          <Group gap="xs" wrap="wrap">
            <Text fw={750}>{student.name}</Text>
            <CheckCircle size={18} color="#267a59" weight="fill" aria-label="Class record matched" />
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing={4} verticalSpacing={2}>
            <Text size="sm"><Text component="span" c="dimmed">Team </Text>{student.teamCode}</Text>
            <Text size="sm"><Text component="span" c="dimmed">Member </Text>{student.memberNumber || 'Not listed'}</Text>
            <Text size="sm"><Text component="span" c="dimmed">Adviser </Text>{isUsableAdviserName(student.adviser) ? student.adviser : 'Unassigned'}</Text>
          </SimpleGrid>
          {email ? <AccountAttribution email={email} /> : null}
        </Stack>
      </Group>
    </Paper>
  );
}

function AccountAttribution({ email }) {
  return (
    <Group gap={6} wrap="nowrap" className="wt-account-attribution">
      <GoogleLogo size={16} weight="bold" aria-hidden="true" />
      <Text size="xs" c="dimmed">This response will be associated with {email}.</Text>
    </Group>
  );
}

function SubmissionIdentityFields({ students, identity, activeAccount, errors, onChange }) {
  const numberOptions = useMemo(() => studentOptions(students, 'number'), [students]);
  const nameOptions = useMemo(() => studentOptions(students, 'name'), [students]);
  const teams = useMemo(() => teamOptions(students), [students]);

  function selectStudent(student) {
    onChange({
      studentNumber: student.studentNumber,
      studentName: student.name,
      teamCode: student.teamCode
    });
  }

  return (
    <Stack gap="md">
      <div>
        <Text component="h2" className="wt-section-title">Student details</Text>
        <Text c="dimmed" size="sm">Select your Student Number or name to fill the matching class-record details.</Text>
      </div>
      <div className="wt-public-identity-grid">
        <SearchableIdentityField
          label="Student Number"
          placeholder="Search Student Number"
          value={identity.studentNumber}
          options={numberOptions}
          onChange={(studentNumber) => onChange({ ...identity, studentNumber })}
          onSelect={(option) => selectStudent(option.student)}
          renderOption={(option) => <StudentOption option={option} primary="number" />}
          emptyLabel="No matching Student Number"
          error={errors?.studentNumber}
        />
        <SearchableIdentityField
          label="Student Name"
          placeholder="Search student name"
          value={identity.studentName}
          options={nameOptions}
          onChange={(studentName) => onChange({ ...identity, studentName })}
          onSelect={(option) => selectStudent(option.student)}
          renderOption={(option) => <StudentOption option={option} primary="name" />}
          emptyLabel="No matching student name"
          error={errors?.studentName}
        />
        <SearchableIdentityField
          label="Team Code"
          placeholder="Search team code"
          value={identity.teamCode}
          options={teams}
          onChange={(teamCode) => onChange({ ...identity, teamCode })}
          onSelect={(option) => onChange({ ...identity, teamCode: option.teamCode })}
          renderOption={(option) => <Text size="sm" ff="monospace" fw={650}>{option.teamCode}</Text>}
          emptyLabel="No matching team code"
          error={errors?.teamCode}
        />
      </div>
      {activeAccount?.email ? <AccountAttribution email={activeAccount.email} /> : null}
      {identity.studentNumber && !students.some((student) => student.studentNumber === identity.studentNumber) ? (
        <Alert color="orange" variant="light" icon={<IdentificationCard size={19} />}>
          Choose a Student Number from this workspace's class record.
        </Alert>
      ) : null}
    </Stack>
  );
}

export function StudentIdentityPanel({
  students,
  student,
  value,
  identity,
  activeAccount,
  errors,
  mode = 'connection',
  onChange
}) {
  if (mode === 'submission') {
    return (
      <SubmissionIdentityFields
        students={students}
        identity={identity}
        activeAccount={activeAccount}
        errors={errors}
        onChange={onChange}
      />
    );
  }

  return (
    <Stack gap="md">
      <div>
        <Text component="h2" className="wt-section-title">Student record</Text>
        <Text c="dimmed" size="sm">Choose your Student Number. WildTrack fills in the matching team details.</Text>
      </div>
      <StudentNumberField
        students={students}
        value={value}
        onChange={(nextValue) => onChange(nextValue, null)}
        onSelect={(selected) => onChange(selected.studentNumber, selected)}
      />
      <IdentitySummary student={student} email={activeAccount?.email} />
      {value && !student ? (
        <Alert color="orange" variant="light" icon={<IdentificationCard size={19} />}>
          Choose a Student Number from this workspace's class record.
        </Alert>
      ) : null}
    </Stack>
  );
}
