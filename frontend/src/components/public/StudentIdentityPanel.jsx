import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
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
  MagnifyingGlass,
  UserSwitch
} from '@phosphor-icons/react';
import { modals } from '@mantine/modals';
import { isUsableAdviserName } from '../../lib/workflow.js';

function StudentNumberCombobox({ students, value, onChange }) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });
  const [query, setQuery] = useState(value || '');

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  const matches = useMemo(() => {
    const needle = query.toLowerCase().trim();
    return students
      .filter((student) => !needle || `${student.studentNumber} ${student.name} ${student.teamCode}`.toLowerCase().includes(needle))
      .slice(0, 30);
  }, [query, students]);

  function selectStudent(studentNumber) {
    const selected = students.find((student) => student.studentNumber === studentNumber) || null;
    setQuery(studentNumber);
    onChange(studentNumber, selected);
    combobox.closeDropdown();
  }

  return (
    <Combobox store={combobox} onOptionSubmit={selectStudent} withinPortal={false}>
      <Combobox.Target>
        <InputBase
          label="Student Number"
          required
          value={query}
          leftSection={<MagnifyingGlass size={18} aria-hidden="true" />}
          rightSection={<CaretDown size={16} aria-hidden="true" />}
          placeholder="Search by Student Number or name"
          description={students.length
            ? `${students.length} class-record entries available in this workspace.`
            : 'Student records appear after the Team Formation sheet is connected.'}
          role="combobox"
          aria-expanded={combobox.dropdownOpened}
          aria-controls="student-number-options"
          onFocus={() => combobox.openDropdown()}
          onClick={() => combobox.openDropdown()}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setQuery(nextValue);
            onChange(nextValue, null);
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
        />
      </Combobox.Target>
      <Combobox.Dropdown id="student-number-options">
        <Combobox.Options mah={280} style={{ overflowY: 'auto' }}>
          {matches.length ? matches.map((student) => (
            <Combobox.Option key={student.studentNumber} value={student.studentNumber}>
              <Group gap="md" wrap="nowrap" align="flex-start">
                <Text ff="monospace" fw={650} size="sm" className="wt-nowrap">{student.studentNumber}</Text>
                <div>
                  <Text fw={650} size="sm">{student.name}</Text>
                  <Text c="dimmed" size="xs">{student.teamCode}</Text>
                </div>
              </Group>
            </Combobox.Option>
          )) : <Combobox.Empty>No matching student record</Combobox.Empty>}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
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
          {email ? (
            <Group gap={6} mt={4} wrap="nowrap">
              <GoogleLogo size={16} weight="bold" aria-hidden="true" />
              <Text size="xs" c="dimmed">This response will be associated with {email}.</Text>
            </Group>
          ) : null}
        </Stack>
      </Group>
    </Paper>
  );
}

export function StudentIdentityPanel({ students, student, value, activeAccount, returning, onChange, onUseDifferent }) {
  function confirmDifferentRecord() {
    modals.openConfirmModal({
      title: 'Use a different student record?',
      children: (
        <Text size="sm">
          Your current selection will be cleared. Submitted responses and their private links will not be shown for another record.
        </Text>
      ),
      labels: { confirm: 'Choose another record', cancel: 'Keep this record' },
      confirmProps: { color: 'wildtrackMaroon' },
      centered: true,
      onConfirm: onUseDifferent
    });
  }

  return (
    <Stack gap="md">
      <div>
        <Text component="h2" className="wt-section-title">Student record</Text>
        <Text c="dimmed" size="sm">Choose your record once. WildTrack fills in the matching team details.</Text>
      </div>

      {returning && student ? (
        <>
          <IdentitySummary student={student} email={activeAccount?.email} />
          <Group justify="flex-start" gap="md">
            <Button variant="subtle" color="wildtrackMaroon" size="compact-sm" leftSection={<UserSwitch size={17} />} onClick={confirmDifferentRecord}>
              Use a different student record
            </Button>
          </Group>
        </>
      ) : (
        <>
          <StudentNumberCombobox students={students} value={value} onChange={onChange} />
          <IdentitySummary student={student} email={activeAccount?.email} />
          {value && !student ? (
            <Alert color="orange" variant="light" icon={<IdentificationCard size={19} />}>
              Choose a Student Number from this workspace's class record.
            </Alert>
          ) : null}
        </>
      )}
    </Stack>
  );
}
