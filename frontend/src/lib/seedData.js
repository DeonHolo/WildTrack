export const trackerColumns = [
  'SRS',
  'SDD',
  'SourceCode'
];

export const seedTrackerColumns = trackerColumns.map((column, index) => ({
  id: `col-${index + 1}`,
  key: column,
  label: column,
  sourceColumn: column,
  active: true,
  pdfRequired: ['RRL', 'Project Proposal', 'SRS', 'SDD'].includes(column)
}));

export const seedWorkspaces = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'IT Capstone - IT332 - Semester 2 2025-26',
    program: 'IT',
    courseCode: 'IT332',
    semester: 'Semester 2',
    academicYear: '2025-26',
    active: true
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'CS Capstone - Semester 2 2025-26',
    program: 'CS',
    courseCode: 'CS Capstone',
    semester: 'Semester 2',
    academicYear: '2025-26',
    active: true
  }
];

export const seedProjectMetadata = [
  {
    groupCode: '2526-sem2-it332-11',
    projectTitle: 'StudyBuddy: A Collaborative Academic Task Manager',
    softwareName: 'StudyBuddy',
    description: 'A collaborative task manager for student groups to organize coursework, milestones, and academic progress.',
    proposalRemarks: 'Refine the group workflow and clarify the academic planning scope.',
    demoComments: 'Show the shared task view and the group progress workflow.',
    adviserName: 'Sir Roberto Villanueva',
    status: 'Active',
    category: 'Academic Capstone'
  },
  {
    groupCode: '2526-sem2-it332-22',
    projectTitle: 'QuickPark: A Campus Parking Slot Finder',
    softwareName: 'QuickPark',
    description: 'A campus parking assistant that helps drivers find available parking areas.',
    proposalRemarks: 'Add clearer parking availability rules and user flows.',
    demoComments: 'Demonstrate the parking search and occupancy update flow.',
    adviserName: 'Sir Roberto Villanueva',
    status: 'Active',
    category: 'Academic Capstone'
  }
];

export const seedStudents = [
  {
    studentNumber: '22-1001-001',
    name: 'DELA CRUZ, JUAN CARLOS M.',
    teamCode: '2526-sem2-it332-11',
    memberNumber: 1,
    section: 'IT332',
    adviser: 'Sir Roberto Villanueva',
    milestones: {
      ProbExploration: 0,
      Convergence: 0,
      RRL: 9,
      'Project Proposal': 12,
      SRS: '',
      SDD: '',
      'Adviser Assessment': '#N/A',
      SourceCode: '',
      DEMO: ''
    }
  },
  {
    studentNumber: '23-2002-002',
    name: 'SANTOS, MARIA ANGELA R.',
    teamCode: '2526-sem2-it332-22',
    memberNumber: 5,
    section: 'IT332',
    adviser: 'Sir Roberto Villanueva',
    milestones: {
      ProbExploration: 0,
      Convergence: 1,
      RRL: 79,
      'Project Proposal': 72,
      SRS: 51,
      SDD: 51,
      'Adviser Assessment': '#N/A',
      SourceCode: '#N/A',
      DEMO: ''
    }
  },
  {
    studentNumber: '21-3003-003',
    name: 'REYES, MIGUEL ANTONIO D.',
    teamCode: '2526-sem2-it332-33',
    memberNumber: 1,
    section: 'IT332',
    adviser: 'Sir Roberto Villanueva',
    milestones: {
      ProbExploration: 0,
      Convergence: 0,
      RRL: 0,
      'Project Proposal': 1,
      SRS: 21,
      SDD: 21,
      'Adviser Assessment': 0,
      SourceCode: 0,
      DEMO: '5/28/2026'
    }
  },
  {
    studentNumber: '22-4004-004',
    name: 'GARCIA, ANA PATRICIA L.',
    teamCode: '2526-sem2-it332-33',
    memberNumber: 2,
    section: 'IT332',
    adviser: 'Sir Roberto Villanueva',
    milestones: {
      ProbExploration: 1,
      Convergence: 10,
      RRL: 0,
      'Project Proposal': 1,
      SRS: 21,
      SDD: 21,
      'Adviser Assessment': 0,
      SourceCode: 0,
      DEMO: '5/28/2026'
    }
  },
  {
    studentNumber: '21-5005-005',
    name: 'BAUTISTA, JOSE RAFAEL P.',
    teamCode: '2526-sem2-it332-44',
    memberNumber: 5,
    section: 'IT332',
    adviser: 'Engr. Carmen Aquino',
    milestones: {
      ProbExploration: 4,
      Convergence: 0,
      RRL: 0,
      'Project Proposal': 68,
      SRS: 58,
      SDD: 51,
      'Adviser Assessment': 0,
      SourceCode: '#N/A',
      DEMO: ''
    }
  },
  {
    studentNumber: '20-6006-006',
    name: 'TORRES, RICA MAE S.',
    teamCode: '2526-sem2-it332-55',
    memberNumber: 1,
    section: 'IT332',
    adviser: 'Sir Roberto Villanueva',
    milestones: {
      ProbExploration: 0,
      Convergence: 0,
      RRL: 53,
      'Project Proposal': 46,
      SRS: 51,
      SDD: 48,
      'Adviser Assessment': 0,
      SourceCode: 0,
      DEMO: '5/26/2026'
    }
  }
];

export const seedDeliverables = [
  {
    id: 'deliv-srs',
    slug: 'week-9-srs',
    title: 'Week 9: Software Requirements Specification',
    shortTitle: 'SRS',
    dueAt: '2026-04-18T23:59:00+08:00',
    trackerColumn: 'SRS',
    audience: 'IT332 students',
    status: 'Published',
    instructions: 'Submit your SRS as a PDF Drive file.',
    fields: [
      { id: 'documentPdf', label: 'PDF Drive Link', type: 'drive', required: true, pdfRequired: true }
    ]
  },
  {
    id: 'deliv-sdd',
    slug: 'week-10-sdd',
    title: 'Week 10: Software Design Description',
    shortTitle: 'SDD',
    dueAt: '2026-04-25T23:59:00+08:00',
    trackerColumn: 'SDD',
    audience: 'IT332 students',
    status: 'Published',
    instructions: 'Submit your SDD as a PDF Drive file.',
    fields: [
      { id: 'documentPdf', label: 'PDF Drive Link', type: 'drive', required: true, pdfRequired: true }
    ]
  },
  {
    id: 'deliv-docs',
    slug: 'software-project-documentation',
    title: 'Week 14: Software Project Documentation',
    shortTitle: 'Documentation',
    dueAt: '2026-05-30T23:59:00+08:00',
    trackerColumn: 'SourceCode',
    audience: 'IT332 students',
    status: 'Published',
    instructions: 'Submit repository links and your presentation link. Repository metadata checks are advisory.',
    fields: [
      { id: 'frontendRepo', label: 'Frontend repository link', type: 'url', required: true, pdfRequired: false },
      { id: 'backendRepo', label: 'Backend repository link', type: 'url', required: true, pdfRequired: false },
      { id: 'presentation', label: 'PPT or presentation Drive link', type: 'url', required: true, pdfRequired: false }
    ]
  }
];

export const seedAttempts = [
  {
    id: 'att-001',
    deliverableId: 'deliv-srs',
    studentNumber: '23-2002-002',
    studentName: 'SANTOS, MARIA ANGELA R.',
    teamCode: '2526-sem2-it332-22',
    matched: true,
    submittedAt: '2026-04-19T11:04:00+08:00',
    values: {
      documentPdf: 'https://drive.google.com/file/d/sample-srs-pdf/view'
    },
    flags: ['Received', 'Drive link format accepted'],
    primaryStatus: 'Received',
    checkSummary: '',
    reviewStatus: 'Received',
    archiveStatus: 'Not Archived',
    history: []
  },
  {
    id: 'att-002',
    deliverableId: 'deliv-sdd',
    studentNumber: '22-1001-001',
    studentName: 'DELA CRUZ, JUAN CARLOS M.',
    teamCode: '2526-sem2-it332-11',
    matched: true,
    submittedAt: '2026-04-25T22:14:00+08:00',
    values: {
      documentPdf: 'https://drive.google.com/file/d/template-like-sdd-pdf/view'
    },
    flags: ['Received', 'Drive link format accepted'],
    primaryStatus: 'Received',
    checkSummary: '',
    reviewStatus: 'Received',
    archiveStatus: 'Not Archived',
    history: []
  }
];

export const initialState = {
  classRecord: {
    name: 'ClassRec SEM2 2025-26 : IT332 Tracker',
    sheetUrl: '',
    connectedAt: '',
    trackerSheet: 'IT332 Tracker',
    status: 'Connected',
    importedColumns: ['NAME OF STUDENT', 'STUDENT NO', 'TEAM FORMATION', 'MEMBER#', ...trackerColumns],
    sources: {
      teamFormation: {
        name: 'Team Formation',
        sheetUrl: '',
        status: 'Starter data',
        connectedAt: '',
        csvUrl: ''
      },
      tracker: {
        name: 'Tracker',
        sheetUrl: '',
        status: 'Starter data',
        connectedAt: '',
        csvUrl: ''
      },
      projectMonitor: {
        name: 'Software Project Monitor',
        sheetUrl: '',
        status: 'Starter data',
        connectedAt: '',
        csvUrl: ''
      }
    },
    importSummary: null,
    importWarnings: []
  },
  trackerColumns: seedTrackerColumns,
  projectMetadata: seedProjectMetadata,
  templates: [
    {
      id: 'tpl-srs',
      deliverable: 'SRS',
      name: 'SRS official template',
      link: 'https://drive.google.com/file/d/srs-template/view',
      status: 'Active',
      extractedAt: '2026-06-18T00:00:00+08:00'
    },
    {
      id: 'tpl-sdd',
      deliverable: 'SDD',
      name: 'SDD official template',
      link: 'https://drive.google.com/file/d/sdd-template/view',
      status: 'Active',
      extractedAt: '2026-06-18T00:00:00+08:00'
    }
  ],
  students: seedStudents,
  deliverables: seedDeliverables,
  attempts: seedAttempts,
  archives: [],
  studentAccounts: [],
  activeAccountEmail: '',
  activeStudentNumber: '',
  activity: [
    { id: 'act-001', at: '2026-06-18T00:10:00+08:00', text: 'Loaded local starter records for testing.' },
    { id: 'act-002', at: '2026-06-18T00:15:00+08:00', text: 'Published SRS and SDD submission forms.' }
  ]
};
