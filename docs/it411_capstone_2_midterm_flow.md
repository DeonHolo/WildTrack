# IT411 Capstone 2: Midterm Execution Flow & System Specifications

## Metadata & Execution Scope
* **Course Identifier:** IT411 | Capstone Project 2
* **Target Cohort:** Sections G1 – G8
* **Academic Term:** Semester 1 | Academic Year 2026–2027
* **Primary System Directive:** Transition system from Capstone 1 outcomes through:
  `MVP Validation` → `Design & Requirements Refactoring` → `Full Implementation` → `Deployment & System Testing`

---

## 1. High-Level Lifecycle & State Transitions

```
[Capstone 1 MVP]
       │
       ▼
[Phase 1: Weeks 1–2] ──► MVP Deployment, 30-User Validation & Early Planning
       │
       ▼
[Phase 2: Week 3]     ──► Requirements Refactoring & Architecture Design Sync
       │
       ▼
[Phase 3: Weeks 4–7]  ──► Full System Implementation, Hardening & Integration
       │
       ▼
[Phase 4: Weeks 8–9]  ──► Live Production/Pilot Deployment, STD & Multi-tier Testing
```

---

## 2. Midterm Phases & Weekly Execution Breakdown

### Phase 1: MVP Validation & Planning (Weeks 1–2)
* **Core Activities:**
  1. Review and evaluate baseline MVP built during Capstone 1.
  2. Deploy MVP to a publicly accessible server (pilot testing future production host).
  3. Formulate data collection instruments using a selected research framework.
  4. Conduct user/customer validation with a minimum of $N \ge 30$ participants across varied stakeholder roles.
  5. Analyze qualitative and quantitative findings; identify bugs, friction points, and gaps.
  6. Refine project scope, SMART objectives, and success metrics based on empirical findings.
* **Key Principles:**
  * Prioritize quality of qualitative insights over sheer number of responses (e.g., 15 rich feedback interviews > 30 empty survey completions).
  * Establish working relationships with respondents for longitudinal follow-up in final testing.
* **Deliverables:**
  * MVP Validation Package (Google Form, Framework PDF, Google Sheet, Highlights PDF, Evidence Folder)
  * Updated Software Project Management Plan (SPMP)

### Phase 2: Requirements & Design Refactoring (Week 3)
* **Core Activities:**
  1. Translate empirical validation findings into formal functional/non-functional requirements.
  2. Refactor system architecture, component structures, and database schemas.
  3. Establish bidirectionally linked traceability across goals, requirements, and design modules.
* **Deliverables:**
  * Refactored Software Requirements Specification (SRS) containing Requirements Traceability Matrix (RTM).
  * Refactored Software Design Description (SDD).
  * Updated Software Project Management Plan (SPMP).

### Phase 3: Full System Implementation (Weeks 4–7)
* **Core Activities:**
  1. Code and implement 100% of remaining system features and modules.
  2. Integrate disparate internal and external microservices/components.
  3. Systematically optimize for performance, security, data integrity, reliability, and horizontal/vertical scalability.
  4. Resolve all regressions and issues uncovered during Weeks 1–2 MVP validation.
* **Deliverables:**
  * Feature-complete, production-ready system codebase.
  * Implementation & Development Status Reports.
  * Synchronized technical system documentation.

### Phase 4: Deployment & System Testing (Weeks 8–9)
* **Core Activities:**
  1. Author the Software Test Documentation (STD) suite including structured test plans, test suites, and individual test cases.
  2. Deploy the integrated build into an official staging, pilot, or production cloud environment.
  3. Execute multi-tier testing: Functional, Integration, System, Acceptance (UAT), and Usability Testing.
  4. Ingest and address technical adviser evaluations and re-test alongside target beneficiaries.
* **Deliverables:**
  * Software Test Documents (STD): Test Plan, Test Cases, and Test Execution Reports.
  * Live Deployed System URL / Environment.
  * Usability Testing Results and Acceptance Verification Logs.

---

## 3. Submission Specifications & Deadlines (Weeks 1–6)

```
                     SUBMISSION DEADLINE SCHEDULE
                     
  September 12, 2026 [11:59 PM]        September 19, 2026 [11:59 PM]
  ┌───────────────────────────┐        ┌───────────────────────────┐
  │  MVP Validation Package   │        │ Engineering Artifacts Sync │
  │  ├─ Google Form           │        │  ├─ Updated SRS (+ RTM)   │
  │  ├─ Framework PDF         │        │  ├─ Updated SDD           │
  │  ├─ Responses Sheet       │        │  └─ Updated SPMP          │
  │  ├─ Highlights PDF        │        │                           │
  │  └─ Evidence Drive Folder │        │                           │
  └───────────────────────────┘        └───────────────────────────┘
```

### Deadline 1: MVP Validation Deliverable Suite
* **Submission Cutoff:** **September 12, 2026 | 11:59 PM**
* **Required Artifact Components:**
  1. **Google Form (Validation Instrument):**
     * Structurally aligned with the designated research/evaluation framework.
     * Maps explicitly to project SMART objectives and measurable milestones.
     * Contains role-adapted question paths (Customers, End Users, SMEs, Decision-makers).
     * Includes mandatory open-ended qualitative prompts.
  2. **PDF (Validation Framework / Model Specification):**
     * Explicit identification and theoretical justification of the chosen evaluation model.
     * Formal mapping table: $\text{SMART Goals} \longrightarrow \text{Evaluation Constructs} \longrightarrow \text{Survey Items}$.
     * Clear role-to-item breakdown indicating target respondent assignments.
  3. **Google Sheet (Validation Response Stream):**
     * Live, uncorrupted response link to the active Google Form.
     * Formatted with identifiable participant roles, timestamps, and normalized fields for analysis.
  4. **PDF (MVP Validation Highlights & Analysis):**
     * Executive synthesis of quantitative survey output and post-test interview findings.
     * Distinct itemization of:
       * Identified user pain points and system defects.
       * Incomplete, altered, or missing functional requirements.
       * Feature recommendations and positive core elements to retain.
       * High-priority changes to incorporate before implementation.
  5. **Google Drive Folder (Validation Evidence Repository):**
     * Organized, unambiguously named repository containing proof of validation.
     * Accepted artifacts: Screenshots of deployed MVP, on-site/remote testing sessions, user invitation threads, consultation logs, and raw interview notes.

### Deadline 2: Synchronized Engineering & Project Management Suite
* **Submission Cutoff:** **September 19, 2026 | 11:59 PM**
* **Required Artifact Components:**
  1. **Updated Software Requirements Specification (SRS):**
     * Full specification of functional and non-functional requirements reflecting user validation feedback.
     * **Requirements Traceability Matrix (RTM):** Fully integrated into the SRS using the official LMS/Portal template, mapping:
       $$\text{Project Objectives} \longleftrightarrow \text{Requirements} \longleftrightarrow \text{System Modules / Features}$$
  2. **Updated Software Design Description (SDD):**
     * Complete architectural, component, database (ERD/relational schemas), interface (UI/UX wireframes), and data flow (DFD/UML sequence) updates aligned with the refactored SRS.
  3. **Updated Software Project Management Plan (SPMP):**
     * Revised work breakdown structure (WBS), resource allocation matrices, team responsibilities, milestone Gantt charts, and revised risk management/mitigation protocols.

---

## 4. Evaluation Frameworks Knowledge Base

To ensure rigorous validation, agents must select and align validation instruments with an approved evaluation model. Framework selection requires technical adviser endorsement.

### Category I: Generic Software Evaluation Frameworks

| # | Framework / Instrument | Core Constructs & Metrics | Primary Use-Case Scenario |
|---|---|---|---|
| 1 | **ISO 9241-11** | Effectiveness, Efficiency, Satisfaction | Standard metric baseline evaluating whether users execute tasks accurately, rapidly, and contentedly. |
| 2 | **System Usability Scale (SUS)** | 10-item standardized Likert questionnaire | Rapid, standardized quantitative baseline score of perceived ease of use. |
| 3 | **Technology Acceptance Model (TAM)** | Perceived Usefulness (PU), Perceived Ease of Use (PEOU), Behavioral Intention (BI) | Predicting whether users will adopt, integrate, and continuously utilize the system. |
| 4 | **Net Promoter Score (NPS)** | Likelihood to Recommend (0–10 scale) | Supplementary proxy metric for user satisfaction and brand loyalty (not to be used as sole usability measure). |
| 5 | **Cognitive Walkthrough** | Action execution, Goal clarity, Feedback evaluation | Expert-guided assessment of novice user navigation, learnability, and intuitive progression. |
| 6 | **User Experience Questionnaire (UEQ)** | Attractiveness, Perspicuity, Efficiency, Dependability, Stimulation, Novelty | Holistic assessment of hedonic and pragmatic UX dimensions. |
| 7 | **Goal–Question–Metric (GQM)** | $\text{Goal} \longrightarrow \text{Question} \longrightarrow \text{Metric}$ | Ensures research objectives strictly govern evaluation criteria (e.g., reduce time $\to$ track average completion duration). |
| 8 | **Heuristic Evaluation** | Nielsen’s 10 Usability Principles | Pre-user testing expert review to preemptively expose layout, feedback, and structural friction. |
| 9 | **PSSUQ** | System Usefulness, Information Quality, Interface Quality | Post-task standardized measurement measuring satisfaction following system interaction. |
| 10 | **A/B Testing** | Variant A vs. Variant B conversion/task performance | Direct quantitative comparison between alternate workflows, layouts, or feature mechanics. |
| 11 | **User Acceptance Testing (UAT)** | End-user acceptance checklist, Business process validation | Determining if the software solves operational business needs in realistic conditions. |
| 12 | **Task Success Rate & Time-on-Task** | Success $\%=(\frac{\text{Completed Tasks}}{\text{Total Attempts}})\times 100$, Duration ($t$) | Direct performance measurement demonstrating raw task efficiency and user execution barriers. |
| 13 | **Five-Second Test** | Visual recall, Information hierarchy, Immediate comprehension | Assessing first impressions, clarity of layout, and landing screen purpose. |
| 14 | **Startup Concept Validation (SBCVM)** | Problem, Customer, Solution, Market, Value Proposition, Business Model | Validating commercial viability, user demand, and economic sustainability for startup-oriented projects. |

---

### Category II: Teaching & Learning Software Evaluation Frameworks

| # | Framework / Instrument | Target Evaluation Focus | Core Questions Addressed |
|---|---|---|---|
| 1 | **SAMR Model** | Substitution, Augmentation, Modification, Redefinition | Does the tech merely digitize a task, or does it transform pedagogical capabilities? |
| 2 | **TPACK Framework** | Technological Pedagogical Content Knowledge | Is the software harmoniously integrated with content and instructional methods? |
| 3 | **Bloom's Taxonomy** | Remember $\to$ Understand $\to$ Apply $\to$ Analyze $\to$ Evaluate $\to$ Create | Which cognitive complexity tiers are facilitated by the interactive modules? |
| 4 | **ADDIE Model** | Analyze, Design, Develop, Implement, Evaluate | Process-oriented framework for instructional system design and delivery feedback. |
| 5 | **Kirkpatrick's Levels** | Level 1 (Reaction), Level 2 (Learning), Level 3 (Behavior), Level 4 (Results) | Measuring user training impact from immediate impressions to quantifiable skill application. |
| 6 | **Community of Inquiry (CoI)** | Cognitive Presence, Social Presence, Teaching Presence | Collaborative evaluation for blended/remote educational platforms. |
| 7 | **UPA Framework** | Usability, Pedagogy, Accessibility | Holistic 3-pillar evaluation for learning platforms catering to diverse learner cohorts. |
| 8 | **Learning Analytics Dashboards** | Logins, Task duration, Drop-off points, Assessment scores | Quantitative behavioural data extraction to observe learner progression patterns. |
| 9 | **ARCS Model** | Attention, Relevance, Confidence, Satisfaction | Evaluating instructional motivation and learner engagement mechanics. |
| 10 | **EEI Model** | Engagement, Ease of Use, Impact | Streamlined three-tier evaluation connecting interaction and UX to direct learning outcomes. |
| 11 | **SOLO Taxonomy** | Prestructural $\to$ Unistructural $\to$ Multistructural $\to$ Relational $\to$ Extended Abstract | Assessing sophistication and integration of learner outcomes over time. |
| 12 | **ISTE Standards** | Digital Citizenship, Computational Thinking, Global Collaboration | Validating student alignment with modern digital competency criteria. |
| 13 | **UEQ for EdTech** | Attractiveness, Perspicuity, Dependability, Stimulation | Specialized application of UEQ measuring learner interface reception. |
| 14 | **Educational Heuristics (HEET)** | Usability, Navigation, Feedback, Accessibility, Pedagogical Integrity | Domain-specific heuristic audit combining UX and learning design standards. |

---

## 5. Framework Decision Matrix

When configuring system evaluation parameters, map research questions directly to candidate frameworks:

```
┌────────────────────────────────────────────────────────┬──────────────────────────────────────────┐
│ Primary Evaluation Question                            │ Candidate Frameworks & Methodologies     │
├────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
│ Is the system easy to use?                             │ SUS, ISO 9241-11, UEQ, PSSUQ             │
│ Can users complete tasks successfully?                 │ Task Success Rate, Time-on-Task, UAT     │
│ Is the system useful to users?                         │ TAM, ISO 9241-11, GQM                    │
│ Will users accept and continue using it?               │ TAM, UAT                                 │
│ Are users satisfied with the experience?               │ SUS, UEQ, PSSUQ, NPS                     │
│ Does the system improve efficiency?                    │ ISO 9241-11, GQM, Time-on-Task           │
│ Does the system solve the intended problem?            │ User Validation, GQM, UAT, Domain KPIs   │
│ Does the system improve learning?                      │ Bloom's, Kirkpatrick, CoI, Analytics     │
│ Is the educational system pedagogically appropriate?   │ TPACK, UPA, SAMR, HEET                   │
│ Is the startup/business concept viable?                │ SBCVM, Customer/Market Validation        │
└────────────────────────────────────────────────────────┴──────────────────────────────────────────┘
```

---

## 6. Recommended Multi-Method Combinations

* **Standard Software Systems:**
  $$\text{Primary: ISO 9241-11} \quad+\quad \text{Supporting: } [\text{Task Success Rate} + \text{Time-on-Task} + \text{SUS Survey}]$$
* **User Adoption-Centric Systems:**
  $$\text{Primary: TAM} \quad+\quad \text{Supporting: } [\text{Perceived Usefulness (PU)} + \text{Perceived Ease of Use (PEOU)} + \text{User Interviews}]$$
* **Educational / E-Learning Platforms:**
  $$\text{Primary: UPA} \quad+\quad \text{Supporting: } [\text{SUS} + \text{Assessed Learning Outcomes} + \text{Student/Instructor Feedback}]$$
* **Commercial / Startup MVPs:**
  $$\text{Primary: Problem–Solution Validation} \quad+\quad \text{Supporting: } [\text{Semi-structured Interviews} + \text{Usage Telemetry} + \text{Willingness-to-Pay / Intent}]$$

---

## 7. Mandatory Agent Execution Rules

1. **Alignment Invariant:** No validation instrument may be deployed without a declared, adviser-approved framework. Survey items must map $1:1$ to framework constructs and proposal SMART objectives.
2. **Qualitative Primacy:** A quantitative sample of $N=30$ is required, but qualitative depth (uncovering architectural defects, missing features, and workflow bottlenecks) takes precedence over passive metric collection.
3. **Traceability Rule:** Every requirement alteration in the refactored SRS must be traceable back to recorded stakeholder feedback from the validation responses and reflected in the SDD and SPMP.