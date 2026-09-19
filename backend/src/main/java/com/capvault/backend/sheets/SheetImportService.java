package com.capvault.backend.sheets;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import com.capvault.backend.project.ProjectMetadata;
import com.capvault.backend.project.ProjectMetadataRepository;
import com.capvault.backend.student.StudentRecord;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.tracker.TrackerCell;
import com.capvault.backend.tracker.TrackerCellRepository;
import com.capvault.backend.tracker.TrackerColumn;
import com.capvault.backend.tracker.TrackerColumnRepository;
import com.capvault.backend.tracker.TrackerRow;
import com.capvault.backend.tracker.TrackerRowRepository;
import com.capvault.backend.workspace.WorkspaceSource;
import com.capvault.backend.workspace.WorkspaceSourceRepository;
import com.capvault.backend.workspace.WorkspaceSourceStatus;
import com.capvault.backend.workspace.WorkspaceSourceType;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SheetImportService {

    private static final DateTimeFormatter OUTPUT_DEADLINE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");
    private static final List<DateTimeFormatter> DATE_FORMATTERS = List.of(
        DateTimeFormatter.ofPattern("M/d/yyyy", Locale.ENGLISH),
        DateTimeFormatter.ofPattern("M/d/yy", Locale.ENGLISH),
        DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.ENGLISH),
        DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.ENGLISH),
        DateTimeFormatter.ISO_LOCAL_DATE
    );
    private static final List<DateTimeFormatter> DATE_TIME_FORMATTERS = List.of(
        DateTimeFormatter.ofPattern("M/d/yyyy H:mm:ss", Locale.ENGLISH),
        DateTimeFormatter.ofPattern("M/d/yyyy H:mm", Locale.ENGLISH),
        DateTimeFormatter.ofPattern("M/d/yy H:mm:ss", Locale.ENGLISH),
        DateTimeFormatter.ofPattern("M/d/yy H:mm", Locale.ENGLISH),
        DateTimeFormatter.ISO_LOCAL_DATE_TIME
    );

    private final WorkspaceSourceRepository workspaceSourceRepository;
    private final SheetImportRunRepository importRunRepository;
    private final SheetCsvClient sheetCsvClient;
    private final CsvParser csvParser;
    private final StudentRecordRepository studentRecordRepository;
    private final TrackerColumnRepository trackerColumnRepository;
    private final TrackerRowRepository trackerRowRepository;
    private final TrackerCellRepository trackerCellRepository;
    private final ProjectMetadataRepository projectMetadataRepository;
    private final ObjectMapper objectMapper;
    private final EntityManager entityManager;
    private final Map<UUID, PreviewSession> previewSessions = new ConcurrentHashMap<>();

    public SheetImportService(
        WorkspaceSourceRepository workspaceSourceRepository,
        SheetImportRunRepository importRunRepository,
        SheetCsvClient sheetCsvClient,
        CsvParser csvParser,
        StudentRecordRepository studentRecordRepository,
        TrackerColumnRepository trackerColumnRepository,
        TrackerRowRepository trackerRowRepository,
        TrackerCellRepository trackerCellRepository,
        ProjectMetadataRepository projectMetadataRepository,
        ObjectMapper objectMapper,
        EntityManager entityManager
    ) {
        this.workspaceSourceRepository = workspaceSourceRepository;
        this.importRunRepository = importRunRepository;
        this.sheetCsvClient = sheetCsvClient;
        this.csvParser = csvParser;
        this.studentRecordRepository = studentRecordRepository;
        this.trackerColumnRepository = trackerColumnRepository;
        this.trackerRowRepository = trackerRowRepository;
        this.trackerCellRepository = trackerCellRepository;
        this.projectMetadataRepository = projectMetadataRepository;
        this.objectMapper = objectMapper;
        this.entityManager = entityManager;
    }

    @Transactional
    public SheetImportResponse importSource(UUID workspaceId, WorkspaceSourceType sourceType, SheetImportRequest request) {
        workspaceSourceRepository.findByWorkspaceIdAndSourceType(workspaceId, sourceType).ifPresent(existing -> {
            if (existing.getLastImportedAt() != null || existing.getStatus() == WorkspaceSourceStatus.IMPORTED) {
                throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This source was already imported. Preview the re-import and resolve any conflicts before applying it."
                );
            }
        });
        WorkspaceSource source = resolveSource(workspaceId, sourceType, request);
        SheetImportRun run = importRunRepository.save(new SheetImportRun(workspaceId, sourceType, source));

        try {
            String csvText = sheetCsvClient.fetchCsv(source.getSheetUrl());
            List<List<String>> rows = csvParser.parse(csvText);
            if (rows.size() < 2) {
                throw new IllegalArgumentException("The Sheet did not contain a recognizable header row and data rows.");
            }

            Map<String, String> mappingOverrides = request == null || request.mappingOverrides() == null
                ? Map.of()
                : request.mappingOverrides();
            ImportResult result = switch (sourceType) {
                case TEAM_FORMATION -> importTeamFormation(workspaceId, rows, mappingOverrides);
                case TRACKER -> importTracker(workspaceId, rows, mappingOverrides);
                case PROJECT_MONITOR -> importProjectMonitor(workspaceId, rows, mappingOverrides);
            };

            source.setStatus(WorkspaceSourceStatus.IMPORTED);
            source.setLastImportedAt(LocalDateTime.now());
            workspaceSourceRepository.save(source);

            run.complete(
                SheetImportStatus.IMPORTED,
                result.rowsFound(),
                result.columnsFound(),
                String.join("\n", result.warnings()),
                toJson(result)
            );
            importRunRepository.save(run);

            return new SheetImportResponse(
                run.getId(),
                sourceType,
                SheetImportStatus.IMPORTED,
                result.rowsFound(),
                result.columnsFound(),
                result.studentsFound(),
                result.officialIdsFound(),
                result.groupsFound(),
                result.warnings(),
                result.deadlineSuggestions(),
                result.details(),
                run.getCompletedAt()
            );
        } catch (RuntimeException exception) {
            source.setStatus(WorkspaceSourceStatus.ERROR);
            workspaceSourceRepository.save(source);
            run.complete(
                SheetImportStatus.ERROR,
                0,
                0,
                exception.getMessage(),
                "{\"error\":\"" + escapeJson(exception.getMessage()) + "\"}"
            );
            importRunRepository.save(run);
            throw exception;
        }
    }

    @Transactional(readOnly = true)
    public SheetImportPreviewResponse previewSource(UUID workspaceId, WorkspaceSourceType sourceType, SheetImportRequest request) {
        SourceInput input = resolvePreviewSource(workspaceId, sourceType, request);
        ParsedSource parsed = fetchAndParsePreview(workspaceId, sourceType, input, request);
        DiffBundle diff = buildPreviewDiff(workspaceId, sourceType, parsed);
        String stateVersion = stateVersion(workspaceId, sourceType);
        String sourceVersion = sourceVersion(parsed);
        UUID previewId = UUID.randomUUID();
        previewSessions.put(previewId, new PreviewSession(
            previewId,
            workspaceId,
            sourceType,
            copyRequest(request, input),
            stateVersion,
            sourceVersion
        ));
        return new SheetImportPreviewResponse(
            previewId,
            sourceType,
            stateVersion,
            sourceVersion,
            diff.addedRows(),
            diff.changedRows(),
            diff.missingRows(),
            diff.changes(),
            parsed.warnings(),
            parsed.deadlineSuggestions(),
            parsed.details()
        );
    }

    @Transactional
    public SheetImportResponse applyPreview(
        UUID workspaceId,
        WorkspaceSourceType sourceType,
        SheetImportApplyRequest request
    ) {
        if (request == null || request.previewId() == null) {
            throw new IllegalArgumentException("Choose a re-import preview before applying changes.");
        }
        PreviewSession session = previewSessions.get(request.previewId());
        if (session == null || !workspaceId.equals(session.workspaceId()) || sourceType != session.sourceType()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This re-import preview is no longer available. Preview the Sheet again.");
        }

        SourceInput input = resolvePreviewSource(workspaceId, sourceType, session.request());
        ParsedSource parsed = fetchAndParsePreview(workspaceId, sourceType, input, session.request());
        if (!session.sourceVersion().equals(sourceVersion(parsed))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The Sheet changed after this preview. Preview it again before applying.");
        }

        AcademicWorkspace workspace = entityManager.find(AcademicWorkspace.class, workspaceId, LockModeType.PESSIMISTIC_WRITE);
        if (workspace == null) {
            throw new IllegalArgumentException("Academic workspace was not found.");
        }
        if (!session.stateVersion().equals(stateVersion(workspaceId, sourceType))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "WildTrack academic data changed after this preview. Preview the Sheet again before applying.");
        }

        DiffBundle diff = buildPreviewDiff(workspaceId, sourceType, parsed);
        Map<String, String> resolutions = request.resolutions() == null ? Map.of() : request.resolutions();
        requireConflictResolutions(diff, resolutions);

        ImportResult result = applyParsedSource(workspaceId, sourceType, parsed, resolutions);
        WorkspaceSource source = resolveSource(workspaceId, sourceType, session.request());
        SheetImportRun run = importRunRepository.save(new SheetImportRun(workspaceId, sourceType, source));
        source.setStatus(WorkspaceSourceStatus.IMPORTED);
        source.setLastImportedAt(LocalDateTime.now());
        workspaceSourceRepository.save(source);
        run.complete(
            SheetImportStatus.IMPORTED,
            result.rowsFound(),
            result.columnsFound(),
            String.join("\n", result.warnings()),
            toJson(result)
        );
        importRunRepository.save(run);
        previewSessions.remove(request.previewId());
        return new SheetImportResponse(
            run.getId(),
            sourceType,
            SheetImportStatus.IMPORTED,
            result.rowsFound(),
            result.columnsFound(),
            result.studentsFound(),
            result.officialIdsFound(),
            result.groupsFound(),
            result.warnings(),
            result.deadlineSuggestions(),
            result.details(),
            run.getCompletedAt()
        );
    }

    private SourceInput resolvePreviewSource(UUID workspaceId, WorkspaceSourceType sourceType, SheetImportRequest request) {
        String requestedUrl = request == null ? null : normalizeNullable(request.sheetUrl());
        String requestedName = request == null ? null : normalizeNullable(request.displayName());
        if (requestedUrl != null) {
            return new SourceInput(requestedUrl, requestedName);
        }
        WorkspaceSource source = workspaceSourceRepository.findByWorkspaceIdAndSourceType(workspaceId, sourceType)
            .orElseThrow(() -> new IllegalArgumentException("Connect a Sheet URL before previewing " + sourceType + "."));
        if (source.getSheetUrl() == null || source.getSheetUrl().isBlank()) {
            throw new IllegalArgumentException("Connect a Sheet URL before previewing " + sourceType + ".");
        }
        return new SourceInput(source.getSheetUrl(), source.getDisplayName());
    }

    private static SheetImportRequest copyRequest(SheetImportRequest request, SourceInput input) {
        return new SheetImportRequest(
            input.sheetUrl(),
            input.displayName(),
            request == null || request.mappingOverrides() == null ? Map.of() : Map.copyOf(request.mappingOverrides())
        );
    }

    private ParsedSource fetchAndParsePreview(
        UUID workspaceId,
        WorkspaceSourceType sourceType,
        SourceInput input,
        SheetImportRequest request
    ) {
        String csvText = sheetCsvClient.fetchCsv(input.sheetUrl());
        List<List<String>> rows = csvParser.parse(csvText);
        if (rows.size() < 2) {
            throw new IllegalArgumentException("The Sheet did not contain a recognizable header row and data rows.");
        }
        Map<String, String> overrides = request == null || request.mappingOverrides() == null
            ? Map.of()
            : request.mappingOverrides();
        return switch (sourceType) {
            case TEAM_FORMATION -> parseTeamFormationPreview(rows, overrides);
            case TRACKER -> parseTrackerPreview(workspaceId, rows, overrides);
            case PROJECT_MONITOR -> parseProjectPreview(workspaceId, rows, overrides);
        };
    }

    private ParsedSource parseTeamFormationPreview(List<List<String>> rows, Map<String, String> overrides) {
        HeaderRow headerRow = findBestHeaderRow(
            rows,
            headers -> applyIdentityOverrides(headers, inferIdentityColumns(headers), overrides),
            SheetImportService::scoreTeamFormationHeader
        );
        IdentityColumns identity = applyIdentityOverrides(headerRow.headers(), inferIdentityColumns(headerRow.headers()), overrides);
        List<String> missing = new ArrayList<>();
        if (identity.studentNumber() < 0) missing.add("Student Number");
        if (!hasStudentNameColumn(identity)) missing.add("Student name");
        if (identity.teamCode() < 0) missing.add("Team code");
        if (identity.memberNumber() < 0) missing.add("Member number");
        if (identity.email() < 0) missing.add("Institutional email");
        if (identity.studentNumber() < 0 || !hasStudentNameColumn(identity) || identity.teamCode() < 0) {
            throw new IllegalArgumentException("This does not look like a usable Team Formation Sheet. Missing required fields: "
                + String.join(", ", missing.stream().filter(field -> List.of("Student Number", "Student name", "Team code").contains(field)).toList()) + ".");
        }
        List<SourceStudent> students = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Set<String> identities = new LinkedHashSet<>();
        int skipped = 0;
        int memberNumbers = 0;
        int emails = 0;
        Set<String> teams = new LinkedHashSet<>();
        for (int index = headerRow.index() + 1; index < rows.size(); index += 1) {
            List<String> row = rows.get(index);
            String studentNumber = getCell(row, identity.studentNumber());
            String name = getStudentName(row, identity);
            String team = getCell(row, identity.teamCode());
            if (studentNumber.isBlank() || name.isBlank() || team.isBlank()) {
                skipped += 1;
                continue;
            }
            String identityKey = normalizeKey(studentNumber);
            if (!identities.add(identityKey)) {
                throw new IllegalArgumentException("Team Formation contains duplicate Student Number " + studentNumber + ". Resolve the duplicate before importing.");
            }
            String member = getCell(row, identity.memberNumber());
            String email = getCell(row, identity.email());
            students.add(new SourceStudent(studentNumber, name, team, member, getCell(row, identity.section()), getCell(row, identity.adviser()), email, "", index + 1));
            if (!member.isBlank()) memberNumbers += 1;
            if (!email.isBlank()) emails += 1;
            teams.add(normalizeKey(team));
        }
        if (identity.memberNumber() < 0) warnings.add("Member number column was not found.");
        if (identity.email() < 0) warnings.add("Institutional email column was not found.");
        if (skipped > 0) warnings.add("Skipped " + skipped + " Team Formation row" + plural(skipped) + " without Student Number, name, or team code.");
        SheetImportDetails details = new SheetImportDetails(
            true,
            headerRow.index() + 1,
            detectedIdentityFields(identity),
            missing,
            Map.of(
                "students", students.size(),
                "officialIds", students.size(),
                "teams", teams.size(),
                "memberNumbers", memberNumbers,
                "institutionalEmails", emails,
                "skippedRows", skipped
            ),
            0
        );
        return new ParsedSource(students, List.of(), List.of(), List.of(), warnings, List.of(), details,
            students.size(), headerRow.headers().size(), students.size(), students.size(), 0);
    }

    private ParsedSource parseProjectPreview(UUID workspaceId, List<List<String>> rows, Map<String, String> overrides) {
        HeaderRow headerRow = findBestHeaderRow(
            rows,
            headers -> applyProjectOverrides(headers, inferProjectColumns(headers), overrides),
            SheetImportService::scoreProjectHeader
        );
        ProjectColumns columns = applyProjectOverrides(headerRow.headers(), inferProjectColumns(headerRow.headers()), overrides);
        List<String> missing = new ArrayList<>();
        if (columns.groupCode() < 0) missing.add("Group code");
        if (columns.projectTitle() < 0) missing.add("Project title");
        if (columns.softwareName() < 0) missing.add("Software name");
        if (columns.description() < 0) missing.add("Description");
        if (columns.proposalRemarks() < 0) missing.add("Proposal remarks");
        if (columns.demoComments() < 0) missing.add("Demo comments");
        if (columns.statusAdviser() < 0) missing.add("Adviser/status");
        if (columns.category() < 0) missing.add("Category");
        if (columns.groupCode() < 0 || columns.projectTitle() < 0) {
            throw new IllegalArgumentException("This does not look like a usable Software Project Monitor Sheet. Missing required fields: "
                + String.join(", ", missing.stream().filter(field -> List.of("Group code", "Project title").contains(field)).toList()) + ".");
        }
        Set<String> knownFormationTeams = studentRecordRepository.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId)
            .stream().map(StudentRecord::getTeamFormationCode).filter(Objects::nonNull).map(SheetImportService::normalizeKey)
            .filter(value -> !value.isBlank()).collect(Collectors.toCollection(LinkedHashSet::new));
        List<SourceProject> projects = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Set<String> groups = new LinkedHashSet<>();
        int skipped = 0;
        int outside = 0;
        for (int index = headerRow.index() + 1; index < rows.size(); index += 1) {
            List<String> row = rows.get(index);
            String group = getCell(row, columns.groupCode());
            if (group.isBlank()) {
                skipped += 1;
                continue;
            }
            if (!knownFormationTeams.isEmpty() && !knownFormationTeams.contains(normalizeKey(group))) {
                outside += 1;
                continue;
            }
            if (!groups.add(normalizeKey(group))) {
                throw new IllegalArgumentException("Software Project Monitor contains duplicate group code " + group + ". Resolve the duplicate before importing.");
            }
            String statusAdviser = getCell(row, columns.statusAdviser());
            projects.add(new SourceProject(
                group,
                getCell(row, columns.projectTitle()),
                getCell(row, columns.softwareName()),
                getCell(row, columns.description()),
                getCell(row, columns.proposalRemarks()),
                getCell(row, columns.demoComments()),
                statusAdviser,
                statusAdviser,
                getCell(row, columns.category()),
                index + 1
            ));
        }
        if (skipped > 0) warnings.add("Skipped " + skipped + " Software Project Monitor row" + plural(skipped) + " without a group code.");
        if (outside > 0) warnings.add("Skipped " + outside + " Software Project Monitor row" + plural(outside) + " outside this workspace's Team Formation roster.");
        SheetImportDetails details = new SheetImportDetails(
            true, headerRow.index() + 1, detectedProjectFields(columns), missing,
            Map.of("groups", projects.size(), "skippedRows", skipped), 0
        );
        return new ParsedSource(List.of(), List.of(), projects, List.of(), warnings, List.of(), details,
            projects.size(), headerRow.headers().size(), 0, 0, projects.size());
    }

    private ParsedSource parseTrackerPreview(UUID workspaceId, List<List<String>> rows, Map<String, String> overrides) {
        HeaderRow headerRow = findBestHeaderRow(
            rows,
            headers -> applyIdentityOverrides(headers, inferIdentityColumns(headers), overrides),
            SheetImportService::scoreTrackerHeader
        );
        IdentityColumns identity = applyIdentityOverrides(headerRow.headers(), inferIdentityColumns(headerRow.headers()), overrides);
        int softwareIndex = findTrackerSoftwareTitleIndex(headerRow.headers());
        int rowNumberIndex = findTrackerRowNumberIndex(headerRow.headers());
        Set<Integer> metadata = identity.indexes();
        if (softwareIndex >= 0) metadata.add(softwareIndex);
        if (rowNumberIndex >= 0) metadata.add(rowNumberIndex);
        Set<Integer> columnIndexes = findTrackerColumnIndexes(workspaceId, rows, headerRow, identity, metadata);
        List<String> ignored = new ArrayList<>();
        for (int index = 0; index < headerRow.headers().size(); index += 1) {
            String header = headerRow.headers().get(index).trim();
            if (!header.isBlank() && !metadata.contains(index) && !columnIndexes.contains(index)) ignored.add(header);
        }
        List<SourceTrackerColumn> columns = columnIndexes.stream()
            .sorted()
            .map(index -> {
                String header = headerRow.headers().get(index).trim();
                TrackerColumn existing = trackerColumnRepository.findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(workspaceId).stream()
                    .filter(column -> normalizeHeader(column.getColumnKey()).equals(normalizeHeader(header)))
                    .findFirst().orElse(null);
                return new SourceTrackerColumn(
                    existing == null ? header : existing.getColumnKey(),
                    existing == null ? header : existing.getLabel(),
                    index,
                    existing == null ? isLikelyPdfDeliverable(header) : existing.getPdfRequired()
                );
            }).toList();
        List<String> missing = new ArrayList<>();
        if (!hasStudentNameColumn(identity)) missing.add("Student name");
        if (identity.teamCode() < 0) missing.add("Team code");
        if (identity.memberNumber() < 0) missing.add("Member number");
        if (columns.isEmpty()) missing.add("Tracker/deliverable columns");
        if (!hasStudentNameColumn(identity) || identity.teamCode() < 0 || columns.isEmpty()) {
            throw new IllegalArgumentException("This does not look like a usable Tracker Sheet. Missing required fields: "
                + String.join(", ", missing.stream().filter(field -> !field.equals("Member number")).toList()) + ".");
        }
        List<String> warnings = new ArrayList<>();
        if (!ignored.isEmpty()) warnings.add("Ignored Tracker header" + plural(ignored.size()) + " without deadline evidence or prior tracker-column history: " + String.join(", ", ignored) + ".");
        if (identity.studentNumber() < 0) warnings.add("Tracker has no Student Number column. Official IDs are preserved from Team Formation only.");
        if (identity.memberNumber() < 0) warnings.add("Tracker member number column was not found.");
        List<SourceTrackerRow> trackerRows = new ArrayList<>();
        List<DeadlineSuggestionResponse> deadlines = new ArrayList<>();
        Set<String> rowKeys = new LinkedHashSet<>();
        int skipped = 0;
        int officialIds = 0;
        int rawCells = 0;
        for (int index = headerRow.index() + 1; index < rows.size(); index += 1) {
            List<String> row = rows.get(index);
            String name = getStudentName(row, identity);
            String team = getCell(row, identity.teamCode());
            String member = getCell(row, identity.memberNumber());
            if (name.isBlank() || team.isBlank()) {
                for (SourceTrackerColumn column : columns) {
                    String raw = getCell(row, column.sourceColumnIndex());
                    String dueAt = coerceDueAt(raw);
                    if (!dueAt.isBlank()) deadlines.add(new DeadlineSuggestionResponse(column.key(), column.label() + " Submission", dueAt, column.pdfRequired(), raw, index + 1));
                }
                skipped += 1;
                continue;
            }
            String providedNumber = getCell(row, identity.studentNumber());
            Optional<StudentRecord> matched = findStudentRecord(workspaceId, providedNumber, team, member);
            String studentNumber = firstNonBlank(providedNumber, matched.map(StudentRecord::getStudentNumber).orElse(""));
            String stable = !studentNumber.isBlank() ? "student:" + normalizeKey(studentNumber) : "team-member:" + normalizeKey(team) + ":" + normalizeKey(member);
            if (!rowKeys.add(stable)) throw new IllegalArgumentException("Tracker contains duplicate student identity " + stable.substring(stable.indexOf(':') + 1) + ". Resolve the duplicate before importing.");
            Map<String, String> values = new LinkedHashMap<>();
            for (SourceTrackerColumn column : columns) {
                String raw = getCell(row, column.sourceColumnIndex());
                values.put(column.key(), raw);
                if (!raw.isBlank()) rawCells += 1;
            }
            trackerRows.add(new SourceTrackerRow(
                studentNumber,
                name,
                team,
                member,
                firstNonBlank(getCell(row, identity.section()), matched.map(StudentRecord::getSectionName).orElse("")),
                firstNonBlank(getCell(row, identity.adviser()), matched.map(StudentRecord::getAdviserName).orElse("")),
                getCell(row, softwareIndex),
                index + 1,
                Map.copyOf(values)
            ));
            if (!studentNumber.isBlank()) officialIds += 1;
        }
        if (skipped > 0) warnings.add("Skipped " + skipped + " non-student row" + plural(skipped) + " without a name and team code.");
        if (deadlines.isEmpty()) warnings.add("No deadline row was detected. Tracker data was imported without form suggestions.");
        else warnings.add("Detected " + deadlines.size() + " deadline value" + plural(deadlines.size()) + " from skipped tracker rows.");
        SheetImportDetails details = new SheetImportDetails(
            true,
            headerRow.index() + 1,
            detectedTrackerFields(identity, columns.stream().map(column -> new TrackerColumn(workspaceId, column.key(), column.label(), column.key(), column.sourceColumnIndex(), 0, true, column.pdfRequired())).toList()),
            missing,
            Map.of(
                "studentRows", trackerRows.size(),
                "trackerColumns", columns.size(),
                "rawProgressCells", rawCells,
                "skippedRows", skipped,
                "deadlineValues", deadlines.size()
            ),
            deadlines.isEmpty() ? 0 : 1
        );
        return new ParsedSource(List.of(), trackerRows, List.of(), columns, warnings, deadlines, details,
            trackerRows.size(), columns.size(), trackerRows.size(), officialIds, 0);
    }

    private DiffBundle buildPreviewDiff(UUID workspaceId, WorkspaceSourceType sourceType, ParsedSource parsed) {
        List<SheetImportPreviewResponse.Change> changes = new ArrayList<>();
        switch (sourceType) {
            case TEAM_FORMATION -> buildTeamFormationDiff(workspaceId, parsed.students(), changes);
            case PROJECT_MONITOR -> buildProjectDiff(workspaceId, parsed.projects(), changes);
            case TRACKER -> buildTrackerDiff(workspaceId, parsed, changes);
        }
        int added = (int) changes.stream().filter(change -> "ADDED".equals(change.kind())).count();
        int changed = (int) changes.stream().filter(change -> "CHANGED".equals(change.kind())).count();
        int missing = (int) changes.stream().filter(change -> "MISSING".equals(change.kind())).count();
        return new DiffBundle(added, changed, missing, List.copyOf(changes));
    }

    private void buildTeamFormationDiff(UUID workspaceId, List<SourceStudent> sourceRows, List<SheetImportPreviewResponse.Change> changes) {
        List<StudentRecord> current = studentRecordRepository.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId);
        Set<UUID> seen = new LinkedHashSet<>();
        for (SourceStudent source : sourceRows) {
            StudentRecord local = findStudentRecord(workspaceId, source.studentNumber(), source.teamCode(), source.memberNumber()).orElse(null);
            String rowKey = studentRowKey(local, source.studentNumber(), source.teamCode(), source.memberNumber());
            if (local == null) {
                changes.add(new SheetImportPreviewResponse.Change(changeKey("student", rowKey), "student", rowKey, source.studentName(), "ADDED", List.of(
                    fieldChange("student", rowKey, "studentNumber", "Student Number", source.studentNumber(), "", false),
                    fieldChange("student", rowKey, "studentName", "Student name", source.studentName(), "", false),
                    fieldChange("student", rowKey, "teamFormationCode", "Team code", source.teamCode(), "", false)
                )));
                continue;
            }
            seen.add(local.getId());
            List<SheetImportPreviewResponse.FieldChange> fields = new ArrayList<>();
            addChangedField(fields, "student", rowKey, "studentName", "Student name", source.studentName(), local.getStudentName(), true);
            addChangedField(fields, "student", rowKey, "teamFormationCode", "Team Formation code", source.teamCode(), local.getTeamFormationCode(), true);
            boolean formationStillCurrent = sameText(local.getTeamCode(), local.getTeamFormationCode());
            if (formationStillCurrent) {
                addChangedField(fields, "student", rowKey, "memberNumber", "Member number", source.memberNumber(), local.getMemberNumber(), true);
                addChangedField(fields, "student", rowKey, "sectionName", "Section", source.section(), local.getSectionName(), true);
                addChangedField(fields, "student", rowKey, "adviserName", "Adviser", source.adviser(), local.getAdviserName(), true);
            }
            addChangedField(fields, "student", rowKey, "institutionalEmail", "Institutional email", source.email(), local.getInstitutionalEmail(), true);
            if (!fields.isEmpty()) changes.add(new SheetImportPreviewResponse.Change(changeKey("student", rowKey), "student", rowKey, local.getStudentName(), "CHANGED", List.copyOf(fields)));
        }
        for (StudentRecord local : current) {
            if (local.getTeamFormationCode() != null && !seen.contains(local.getId())) {
                changes.add(new SheetImportPreviewResponse.Change(changeKey("student", local.getId().toString()), "student", local.getId().toString(), local.getStudentName(), "MISSING", List.of()));
            }
        }
    }

    private void buildProjectDiff(UUID workspaceId, List<SourceProject> sourceRows, List<SheetImportPreviewResponse.Change> changes) {
        List<ProjectMetadata> current = projectMetadataRepository.findAllByWorkspaceIdOrderByGroupCodeAsc(workspaceId);
        Set<UUID> seen = new LinkedHashSet<>();
        for (SourceProject source : sourceRows) {
            ProjectMetadata local = projectMetadataRepository.findByWorkspaceIdAndGroupCodeIgnoreCase(workspaceId, source.groupCode()).orElse(null);
            String rowKey = local == null ? "group:" + normalizeKey(source.groupCode()) : local.getId().toString();
            if (local == null) {
                changes.add(new SheetImportPreviewResponse.Change(changeKey("project", rowKey), "project", rowKey, source.groupCode(), "ADDED", List.of(
                    fieldChange("project", rowKey, "groupCode", "Group code", source.groupCode(), "", false),
                    fieldChange("project", rowKey, "projectTitle", "Project title", source.projectTitle(), "", false)
                )));
                continue;
            }
            seen.add(local.getId());
            List<SheetImportPreviewResponse.FieldChange> fields = new ArrayList<>();
            addChangedField(fields, "project", rowKey, "projectTitle", "Project title", source.projectTitle(), local.getProjectTitle(), true);
            addChangedField(fields, "project", rowKey, "softwareName", "Source software name", source.softwareName(), local.getSoftwareName(), true);
            addChangedField(fields, "project", rowKey, "description", "Description", source.description(), local.getDescription(), true);
            addChangedField(fields, "project", rowKey, "proposalRemarks", "Proposal remarks", source.proposalRemarks(), local.getProposalRemarks(), true);
            addChangedField(fields, "project", rowKey, "demoComments", "Demo comments", source.demoComments(), local.getDemoComments(), true);
            addChangedField(fields, "project", rowKey, "adviserName", "Source adviser/status", source.adviser(), local.getAdviserName(), true);
            addChangedField(fields, "project", rowKey, "projectStatus", "Project status", source.projectStatus(), local.getProjectStatus(), true);
            addChangedField(fields, "project", rowKey, "category", "Category", source.category(), local.getCategory(), true);
            if (!fields.isEmpty()) changes.add(new SheetImportPreviewResponse.Change(changeKey("project", rowKey), "project", rowKey, source.groupCode(), "CHANGED", List.copyOf(fields)));
        }
        for (ProjectMetadata local : current) {
            if (!seen.contains(local.getId())) changes.add(new SheetImportPreviewResponse.Change(changeKey("project", local.getId().toString()), "project", local.getId().toString(), local.getEffectiveGroupCode(), "MISSING", List.of()));
        }
    }

    private void buildTrackerDiff(UUID workspaceId, ParsedSource parsed, List<SheetImportPreviewResponse.Change> changes) {
        List<StudentRecord> students = studentRecordRepository.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId);
        Set<UUID> seenStudents = new LinkedHashSet<>();
        Set<UUID> seenProjects = new LinkedHashSet<>();
        Map<String, TrackerColumn> currentColumns = trackerColumnRepository.findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(workspaceId).stream()
            .collect(Collectors.toMap(column -> normalizeHeader(column.getColumnKey()), column -> column, (first, second) -> first, LinkedHashMap::new));
        Set<String> sourceColumnKeys = parsed.trackerColumns().stream().map(column -> normalizeHeader(column.key())).collect(Collectors.toCollection(LinkedHashSet::new));
        for (SourceTrackerColumn source : parsed.trackerColumns()) {
            if (!currentColumns.containsKey(normalizeHeader(source.key()))) {
                String rowKey = "column:" + normalizeHeader(source.key());
                changes.add(new SheetImportPreviewResponse.Change(changeKey("trackerColumn", rowKey), "trackerColumn", rowKey, source.label(), "ADDED", List.of(
                    fieldChange("trackerColumn", rowKey, "active", "Tracker column", source.label(), "", false)
                )));
            }
        }
        for (TrackerColumn local : currentColumns.values()) {
            if (Boolean.TRUE.equals(local.getActive()) && !sourceColumnKeys.contains(normalizeHeader(local.getColumnKey()))) {
                String rowKey = local.getId().toString();
                changes.add(new SheetImportPreviewResponse.Change(changeKey("trackerColumn", rowKey), "trackerColumn", rowKey, local.getLabel(), "MISSING", List.of(
                    fieldChange("trackerColumn", rowKey, "active", "Keep tracker column active", "false", "true", true)
                )));
            }
        }

        for (SourceTrackerRow source : parsed.trackerRows()) {
            StudentRecord local = findStudentRecord(workspaceId, source.studentNumber(), source.teamCode(), source.memberNumber()).orElse(null);
            String rowKey = studentRowKey(local, source.studentNumber(), source.teamCode(), source.memberNumber());
            List<SheetImportPreviewResponse.FieldChange> fields = new ArrayList<>();
            if (local == null) {
                fields.add(fieldChange("student", rowKey, "studentName", "Student name", source.studentName(), "", false));
                fields.add(fieldChange("student", rowKey, "teamCode", "Team code", source.teamCode(), "", false));
            } else {
                seenStudents.add(local.getId());
                addChangedField(fields, "student", rowKey, "studentNumber", "Student Number", source.studentNumber(), local.getStudentNumber(), true);
                addChangedField(fields, "student", rowKey, "studentName", "Student name", source.studentName(), local.getStudentName(), true);
                addChangedField(fields, "student", rowKey, "teamCode", "Team code", source.teamCode(), local.getTeamCode(), true);
                addChangedField(fields, "student", rowKey, "memberNumber", "Member number", source.memberNumber(), local.getMemberNumber(), true);
                addChangedField(fields, "student", rowKey, "sectionName", "Section", source.section(), local.getSectionName(), true);
                addChangedField(fields, "student", rowKey, "adviserName", "Adviser", source.adviser(), local.getAdviserName(), true);
                addChangedField(fields, "student", rowKey, "softwareTitle", "Software title", source.softwareTitle(), local.getSoftwareTitle(), true);
            }
            TrackerRow trackerRow = findTrackerRow(workspaceId, source.studentNumber(), source.teamCode(), source.memberNumber(), source.studentName()).orElse(null);
            if (trackerRow != null) {
                Map<String, TrackerCell> cells = trackerCellRepository.findAllByTrackerRowId(trackerRow.getId()).stream()
                    .collect(Collectors.toMap(cell -> normalizeHeader(cell.getTrackerColumn().getColumnKey()), cell -> cell, (first, second) -> first));
                for (SourceTrackerColumn column : parsed.trackerColumns()) {
                    TrackerCell cell = cells.get(normalizeHeader(column.key()));
                    String localValue = cell == null ? "" : cell.getRawValue();
                    addChangedField(fields, "student", rowKey, "tracker:" + column.key(), column.label(), source.values().getOrDefault(column.key(), ""), localValue, false);
                }
            } else if (local != null) {
                for (SourceTrackerColumn column : parsed.trackerColumns()) {
                    String value = source.values().getOrDefault(column.key(), "");
                    if (!value.isBlank()) fields.add(fieldChange("student", rowKey, "tracker:" + column.key(), column.label(), value, "", false));
                }
            }
            if (local == null || !fields.isEmpty()) {
                changes.add(new SheetImportPreviewResponse.Change(changeKey("student", rowKey), "student", rowKey, source.studentName(), local == null ? "ADDED" : "CHANGED", List.copyOf(fields)));
            }
            if (local != null) {
                findProjectForTrackerStudent(workspaceId, local, source.teamCode()).ifPresent(project -> {
                    if (!seenProjects.add(project.getId())) return;
                    String projectRowKey = project.getId().toString();
                    List<SheetImportPreviewResponse.FieldChange> projectFields = new ArrayList<>();
                    addTrackerProjectField(
                        projectFields, projectRowKey, "currentGroupCode", "Current team code",
                        source.teamCode(), project.getEffectiveGroupCode(), project.getCurrentGroupCode() != null
                    );
                    addTrackerProjectField(
                        projectFields, projectRowKey, "currentSoftwareName", "Current software name",
                        firstNonBlank(source.softwareTitle(), project.getSoftwareName()),
                        project.getEffectiveSoftwareName(), project.getCurrentSoftwareName() != null
                    );
                    addTrackerProjectField(
                        projectFields, projectRowKey, "currentAdviserName", "Current adviser",
                        firstNonBlank(source.adviser(), project.getAdviserName()),
                        project.getEffectiveAdviserName(), project.getCurrentAdviserName() != null
                    );
                    if (!projectFields.isEmpty()) {
                        changes.add(new SheetImportPreviewResponse.Change(
                            changeKey("project", projectRowKey), "project", projectRowKey,
                            firstNonBlank(project.getProjectTitle(), project.getEffectiveGroupCode()),
                            "CHANGED", List.copyOf(projectFields)
                        ));
                    }
                });
            }
        }
        for (StudentRecord local : students) {
            if (local.isCurrentActive() && !seenStudents.contains(local.getId())) {
                String rowKey = local.getId().toString();
                changes.add(new SheetImportPreviewResponse.Change(changeKey("student", rowKey), "student", rowKey, local.getStudentName(), "MISSING", List.of(
                    fieldChange("student", rowKey, "currentActive", "Current tracker membership", "inactive", "active", true)
                )));
            }
        }
    }

    private static void addTrackerProjectField(
        List<SheetImportPreviewResponse.FieldChange> fields,
        String rowKey,
        String field,
        String label,
        String source,
        String local,
        boolean hasExplicitCurrentOverride
    ) {
        if (!sameText(source, local)) {
            fields.add(fieldChange("project", rowKey, field, label, source, local, hasExplicitCurrentOverride));
        }
    }

    private static void addChangedField(
        List<SheetImportPreviewResponse.FieldChange> fields,
        String entityType,
        String rowKey,
        String field,
        String label,
        String source,
        String local,
        boolean conflict
    ) {
        if (!sameText(source, local)) fields.add(fieldChange(entityType, rowKey, field, label, source, local, conflict));
    }

    private static SheetImportPreviewResponse.FieldChange fieldChange(
        String entityType,
        String rowKey,
        String field,
        String label,
        String source,
        String local,
        boolean conflict
    ) {
        return new SheetImportPreviewResponse.FieldChange(
            fieldKey(entityType, rowKey, field), field, label, cleanText(source), cleanText(local), conflict
        );
    }

    private static String changeKey(String entityType, String rowKey) {
        return entityType + ":" + rowKey;
    }

    private static String fieldKey(String entityType, String rowKey, String field) {
        return entityType + ":" + rowKey + ":" + field;
    }

    private static String studentRowKey(StudentRecord local, String studentNumber, String teamCode, String memberNumber) {
        if (local != null) return local.getId().toString();
        if (studentNumber != null && !studentNumber.isBlank()) return "student:" + normalizeKey(studentNumber);
        return "team-member:" + normalizeKey(teamCode) + ":" + normalizeKey(memberNumber);
    }

    private static void requireConflictResolutions(DiffBundle diff, Map<String, String> resolutions) {
        List<String> unresolved = diff.changes().stream()
            .flatMap(change -> change.fields().stream())
            .filter(SheetImportPreviewResponse.FieldChange::conflict)
            .map(SheetImportPreviewResponse.FieldChange::key)
            .filter(key -> !isResolution(resolutions.get(key)))
            .toList();
        if (!unresolved.isEmpty()) {
            throw new IllegalArgumentException("Choose Source or Local for every re-import conflict before applying.");
        }
    }

    private static boolean isResolution(String value) {
        return "SOURCE".equalsIgnoreCase(value) || "LOCAL".equalsIgnoreCase(value);
    }

    private ImportResult applyParsedSource(UUID workspaceId, WorkspaceSourceType sourceType, ParsedSource parsed, Map<String, String> resolutions) {
        switch (sourceType) {
            case TEAM_FORMATION -> applyTeamFormationPreview(workspaceId, parsed.students(), resolutions);
            case PROJECT_MONITOR -> applyProjectPreview(workspaceId, parsed.projects(), resolutions);
            case TRACKER -> applyTrackerPreview(workspaceId, parsed, resolutions);
        }
        return new ImportResult(
            parsed.rowsFound(), parsed.columnsFound(), parsed.studentsFound(), parsed.officialIdsFound(), parsed.groupsFound(),
            parsed.warnings(), parsed.deadlineSuggestions(), parsed.details()
        );
    }

    private void applyTeamFormationPreview(UUID workspaceId, List<SourceStudent> sourceRows, Map<String, String> resolutions) {
        for (SourceStudent source : sourceRows) {
            StudentRecord local = findStudentRecord(workspaceId, source.studentNumber(), source.teamCode(), source.memberNumber()).orElse(null);
            if (local == null) {
                local = new StudentRecord(workspaceId, source.studentNumber(), source.studentName(), source.teamCode(), source.memberNumber(), source.section(), source.adviser(), source.email(), source.sourceRowNumber());
            } else {
                String rowKey = local.getId().toString();
                local.updateFromTeamFormation(
                    source.studentNumber(),
                    choose(resolutions, fieldKey("student", rowKey, "studentName"), source.studentName(), local.getStudentName()),
                    choose(resolutions, fieldKey("student", rowKey, "teamFormationCode"), source.teamCode(), local.getTeamFormationCode()),
                    choose(resolutions, fieldKey("student", rowKey, "memberNumber"), source.memberNumber(), local.getMemberNumber()),
                    choose(resolutions, fieldKey("student", rowKey, "sectionName"), source.section(), local.getSectionName()),
                    choose(resolutions, fieldKey("student", rowKey, "adviserName"), source.adviser(), local.getAdviserName()),
                    choose(resolutions, fieldKey("student", rowKey, "institutionalEmail"), source.email(), local.getInstitutionalEmail()),
                    source.sourceRowNumber()
                );
            }
            studentRecordRepository.save(local);
        }
    }

    private void applyProjectPreview(UUID workspaceId, List<SourceProject> sourceRows, Map<String, String> resolutions) {
        for (SourceProject source : sourceRows) {
            ProjectMetadata local = projectMetadataRepository.findByWorkspaceIdAndGroupCodeIgnoreCase(workspaceId, source.groupCode()).orElse(null);
            if (local == null) {
                local = new ProjectMetadata(workspaceId, source.groupCode(), source.projectTitle(), source.softwareName(), source.description(), source.proposalRemarks(), source.demoComments(), source.adviser(), source.projectStatus(), source.category(), source.sourceRowNumber());
                applyCurrentTrackerContextFromRoster(workspaceId, local, source.groupCode(), new ArrayList<>());
            } else {
                String rowKey = local.getId().toString();
                local.updateFrom(
                    local.getGroupCode(),
                    choose(resolutions, fieldKey("project", rowKey, "projectTitle"), source.projectTitle(), local.getProjectTitle()),
                    choose(resolutions, fieldKey("project", rowKey, "softwareName"), source.softwareName(), local.getSoftwareName()),
                    choose(resolutions, fieldKey("project", rowKey, "description"), source.description(), local.getDescription()),
                    choose(resolutions, fieldKey("project", rowKey, "proposalRemarks"), source.proposalRemarks(), local.getProposalRemarks()),
                    choose(resolutions, fieldKey("project", rowKey, "demoComments"), source.demoComments(), local.getDemoComments()),
                    choose(resolutions, fieldKey("project", rowKey, "adviserName"), source.adviser(), local.getAdviserName()),
                    choose(resolutions, fieldKey("project", rowKey, "projectStatus"), source.projectStatus(), local.getProjectStatus()),
                    choose(resolutions, fieldKey("project", rowKey, "category"), source.category(), local.getCategory()),
                    source.sourceRowNumber()
                );
            }
            projectMetadataRepository.save(local);
        }
    }

    private void applyTrackerPreview(UUID workspaceId, ParsedSource parsed, Map<String, String> resolutions) {
        Map<String, TrackerColumn> currentColumns = trackerColumnRepository.findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(workspaceId).stream()
            .collect(Collectors.toMap(column -> normalizeHeader(column.getColumnKey()), column -> column, (first, second) -> first, LinkedHashMap::new));
        Map<String, TrackerColumn> activeColumns = new LinkedHashMap<>();
        int displayOrder = 0;
        for (SourceTrackerColumn source : parsed.trackerColumns()) {
            String normalized = normalizeHeader(source.key());
            TrackerColumn column = currentColumns.get(normalized);
            if (column == null) {
                column = new TrackerColumn(workspaceId, source.key(), source.label(), source.label(), source.sourceColumnIndex(), displayOrder, true, source.pdfRequired());
            } else {
                column.updateFrom(column.getColumnKey(), column.getLabel(), source.label(), source.sourceColumnIndex(), displayOrder, true, column.getPdfRequired());
            }
            column = trackerColumnRepository.save(column);
            activeColumns.put(normalized, column);
            displayOrder += 1;
        }
        Set<String> importedKeys = activeColumns.keySet();
        for (TrackerColumn local : currentColumns.values()) {
            if (Boolean.TRUE.equals(local.getActive()) && !importedKeys.contains(normalizeHeader(local.getColumnKey()))) {
                String resolution = resolutions.get(fieldKey("trackerColumn", local.getId().toString(), "active"));
                if ("SOURCE".equalsIgnoreCase(resolution)) {
                    local.updateFrom(local.getColumnKey(), local.getLabel(), local.getSourceColumn(), local.getSourceColumnIndex(), local.getDisplayOrder(), false, local.getPdfRequired());
                    trackerColumnRepository.save(local);
                }
            }
        }

        Set<UUID> seenStudents = new LinkedHashSet<>();
        Set<UUID> updatedProjects = new LinkedHashSet<>();
        for (SourceTrackerRow source : parsed.trackerRows()) {
            StudentRecord local = findStudentRecord(workspaceId, source.studentNumber(), source.teamCode(), source.memberNumber()).orElse(null);
            if (local == null) {
                local = new StudentRecord(workspaceId, source.studentNumber(), source.studentName(), source.teamCode(), null, source.memberNumber(), source.section(), source.adviser(), null, source.softwareTitle(), source.sourceRowNumber());
            } else {
                String rowKey = local.getId().toString();
                local.updateFromTracker(
                    choose(resolutions, fieldKey("student", rowKey, "studentNumber"), source.studentNumber(), local.getStudentNumber()),
                    choose(resolutions, fieldKey("student", rowKey, "studentName"), source.studentName(), local.getStudentName()),
                    choose(resolutions, fieldKey("student", rowKey, "teamCode"), source.teamCode(), local.getTeamCode()),
                    choose(resolutions, fieldKey("student", rowKey, "memberNumber"), source.memberNumber(), local.getMemberNumber()),
                    choose(resolutions, fieldKey("student", rowKey, "sectionName"), source.section(), local.getSectionName()),
                    choose(resolutions, fieldKey("student", rowKey, "adviserName"), source.adviser(), local.getAdviserName()),
                    choose(resolutions, fieldKey("student", rowKey, "softwareTitle"), source.softwareTitle(), local.getSoftwareTitle()),
                    source.sourceRowNumber()
                );
            }
            local.setCurrentActive(true);
            local = studentRecordRepository.save(local);
            seenStudents.add(local.getId());
            StudentRecord savedStudent = local;
            findProjectForTrackerStudent(workspaceId, savedStudent, source.teamCode()).ifPresent(project -> {
                if (!updatedProjects.add(project.getId())) return;
                String projectRowKey = project.getId().toString();
                String currentTeam = choose(
                    resolutions,
                    fieldKey("project", projectRowKey, "currentGroupCode"),
                    source.teamCode(),
                    project.getEffectiveGroupCode()
                );
                String currentSoftware = choose(
                    resolutions,
                    fieldKey("project", projectRowKey, "currentSoftwareName"),
                    firstNonBlank(source.softwareTitle(), project.getSoftwareName()),
                    project.getEffectiveSoftwareName()
                );
                String currentAdviser = choose(
                    resolutions,
                    fieldKey("project", projectRowKey, "currentAdviserName"),
                    firstNonBlank(source.adviser(), project.getAdviserName()),
                    project.getEffectiveAdviserName()
                );
                project.applyCurrentTrackerContext(currentTeam, currentSoftware, currentAdviser);
                projectMetadataRepository.save(project);
            });
            TrackerRow trackerRow = findTrackerRow(workspaceId, savedStudent.getStudentNumber(), savedStudent.getTeamCode(), savedStudent.getMemberNumber(), savedStudent.getStudentName())
                .orElseGet(() -> new TrackerRow(workspaceId, savedStudent.getStudentNumber(), savedStudent.getStudentName(), savedStudent.getTeamCode(), savedStudent.getMemberNumber(), savedStudent.getSectionName(), savedStudent.getAdviserName(), source.sourceRowNumber()));
            trackerRow.updateFrom(savedStudent.getStudentNumber(), savedStudent.getStudentName(), savedStudent.getTeamCode(), savedStudent.getMemberNumber(), savedStudent.getSectionName(), savedStudent.getAdviserName(), source.sourceRowNumber());
            TrackerRow savedRow = trackerRowRepository.save(trackerRow);
            for (SourceTrackerColumn sourceColumn : parsed.trackerColumns()) {
                TrackerColumn column = activeColumns.get(normalizeHeader(sourceColumn.key()));
                String raw = source.values().getOrDefault(sourceColumn.key(), "");
                TrackerCell cell = trackerCellRepository.findByTrackerRowIdAndTrackerColumnId(savedRow.getId(), column.getId())
                    .orElseGet(() -> new TrackerCell(savedRow, column, raw, normalizeTrackerStatus(raw), source.sourceRowNumber(), sourceColumn.sourceColumnIndex()));
                cell.updateValue(raw, normalizeTrackerStatus(raw), source.sourceRowNumber(), sourceColumn.sourceColumnIndex());
                trackerCellRepository.save(cell);
            }
        }
        for (StudentRecord local : studentRecordRepository.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId)) {
            if (!local.isCurrentActive() || seenStudents.contains(local.getId())) continue;
            String resolution = resolutions.get(fieldKey("student", local.getId().toString(), "currentActive"));
            if ("SOURCE".equalsIgnoreCase(resolution)) {
                local.setCurrentActive(false);
                studentRecordRepository.save(local);
            }
        }
    }

    private static String choose(Map<String, String> resolutions, String key, String source, String local) {
        return "LOCAL".equalsIgnoreCase(resolutions.get(key)) ? cleanText(local) : cleanText(source);
    }

    private String stateVersion(UUID workspaceId, WorkspaceSourceType sourceType) {
        List<String> parts = new ArrayList<>();
        studentRecordRepository.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId).forEach(student -> parts.add(String.join("|",
            "student", student.getId().toString(), cleanText(student.getStudentNumber()), cleanText(student.getStudentName()), cleanText(student.getTeamCode()), cleanText(student.getTeamFormationCode()),
            cleanText(student.getMemberNumber()), cleanText(student.getSectionName()), cleanText(student.getAdviserName()), cleanText(student.getInstitutionalEmail()), cleanText(student.getSoftwareTitle()),
            String.valueOf(student.isCurrentActive()), String.valueOf(student.getSourceRowNumber()), String.valueOf(student.getUpdatedAt()))));
        projectMetadataRepository.findAllByWorkspaceIdOrderByGroupCodeAsc(workspaceId).forEach(project -> parts.add(String.join("|",
            "project", project.getId().toString(), cleanText(project.getGroupCode()), cleanText(project.getCurrentGroupCode()), cleanText(project.getProjectTitle()), cleanText(project.getSoftwareName()), cleanText(project.getCurrentSoftwareName()),
            cleanText(project.getDescription()), cleanText(project.getProposalRemarks()), cleanText(project.getDemoComments()), cleanText(project.getAdviserName()), cleanText(project.getCurrentAdviserName()), cleanText(project.getProjectStatus()), cleanText(project.getCategory()), String.valueOf(project.getUpdatedAt()))));
        trackerColumnRepository.findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(workspaceId).forEach(column -> parts.add(String.join("|",
            "column", column.getId().toString(), cleanText(column.getColumnKey()), cleanText(column.getLabel()), String.valueOf(column.getActive()), String.valueOf(column.getPdfRequired()), String.valueOf(column.getUpdatedAt()))));
        List<TrackerRow> trackerRows = trackerRowRepository.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId);
        trackerRows.forEach(row -> parts.add(String.join("|", "trackerRow", row.getId().toString(), cleanText(row.getStudentNumber()), cleanText(row.getStudentName()), cleanText(row.getTeamCode()), cleanText(row.getMemberNumber()), cleanText(row.getSectionName()), cleanText(row.getAdviserName()), String.valueOf(row.getUpdatedAt()))));
        trackerCellRepository.findAllByTrackerRowIdIn(trackerRows.stream().map(TrackerRow::getId).toList()).stream()
            .sorted(Comparator.comparing(cell -> cell.getId().toString()))
            .forEach(cell -> parts.add(String.join("|", "cell", cell.getId().toString(), cleanText(cell.getRawValue()), cleanText(cell.getNormalizedStatus()), String.valueOf(cell.getUpdatedAt()))));
        workspaceSourceRepository.findByWorkspaceIdAndSourceType(workspaceId, sourceType).ifPresent(source -> parts.add(String.join("|", "source", cleanText(source.getSheetUrl()), cleanText(source.getDisplayName()), String.valueOf(source.getLastImportedAt()))));
        return digest(parts.stream().sorted().collect(Collectors.joining("\n")));
    }

    private static String sourceVersion(ParsedSource parsed) {
        List<String> parts = new ArrayList<>();
        parsed.students().forEach(student -> parts.add(String.join("|", "student", normalizeKey(student.studentNumber()), cleanText(student.studentName()), cleanText(student.teamCode()), cleanText(student.memberNumber()), cleanText(student.section()), cleanText(student.adviser()), cleanText(student.email()))));
        parsed.projects().forEach(project -> parts.add(String.join("|", "project", normalizeKey(project.groupCode()), cleanText(project.projectTitle()), cleanText(project.softwareName()), cleanText(project.description()), cleanText(project.proposalRemarks()), cleanText(project.demoComments()), cleanText(project.adviser()), cleanText(project.projectStatus()), cleanText(project.category()))));
        parsed.trackerColumns().forEach(column -> parts.add(String.join("|", "column", normalizeHeader(column.key()), String.valueOf(column.pdfRequired()))));
        parsed.trackerRows().forEach(row -> {
            parts.add(String.join("|", "tracker", normalizeKey(row.studentNumber()), normalizeKey(row.teamCode()), normalizeKey(row.memberNumber()), cleanText(row.studentName()), cleanText(row.section()), cleanText(row.adviser()), cleanText(row.softwareTitle())));
            row.values().entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(entry -> parts.add("value|" + normalizeKey(row.studentNumber()) + "|" + normalizeHeader(entry.getKey()) + "|" + cleanText(entry.getValue())));
        });
        parsed.deadlineSuggestions().forEach(deadline -> parts.add(String.join("|",
            "deadline",
            normalizeHeader(deadline.trackerColumnKey()),
            cleanText(deadline.dueAt()),
            cleanText(deadline.sourceValue())
        )));
        return digest(parts.stream().sorted().collect(Collectors.joining("\n")));
    }

    private static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    private static String normalizeKey(String value) {
        return cleanText(value).toLowerCase(Locale.ROOT);
    }

    private static String cleanText(String value) {
        return value == null ? "" : value.trim();
    }

    private static boolean sameText(String first, String second) {
        return cleanText(first).equals(cleanText(second));
    }

    @Transactional(readOnly = true)
    public List<SheetImportRunResponse> listImportRuns(UUID workspaceId) {
        return importRunRepository.findTop20ByWorkspaceIdOrderByStartedAtDesc(workspaceId)
            .stream()
            .map(SheetImportRunResponse::from)
            .toList();
    }

    private WorkspaceSource resolveSource(UUID workspaceId, WorkspaceSourceType sourceType, SheetImportRequest request) {
        String requestedUrl = request == null ? null : normalizeNullable(request.sheetUrl());
        String requestedDisplayName = request == null ? null : normalizeNullable(request.displayName());

        WorkspaceSource source = workspaceSourceRepository.findByWorkspaceIdAndSourceType(workspaceId, sourceType)
            .orElse(null);

        if (requestedUrl != null) {
            String sheetId = extractSheetId(requestedUrl);
            if (source == null) {
                source = new WorkspaceSource(
                    workspaceId,
                    sourceType,
                    requestedUrl,
                    sheetId,
                    requestedDisplayName,
                    WorkspaceSourceStatus.CONNECTED,
                    LocalDateTime.now()
                );
            } else {
                source.setSheetUrl(requestedUrl);
                source.setSheetId(sheetId);
                source.setStatus(WorkspaceSourceStatus.CONNECTED);
                if (requestedDisplayName != null) {
                    source.setDisplayName(requestedDisplayName);
                }
            }
            return workspaceSourceRepository.save(source);
        }

        if (source == null || source.getSheetUrl() == null || source.getSheetUrl().isBlank()) {
            throw new IllegalArgumentException("Connect a Sheet URL before importing " + sourceType + ".");
        }

        return source;
    }

    private ImportResult importTeamFormation(UUID workspaceId, List<List<String>> rows, Map<String, String> mappingOverrides) {
        HeaderRow headerRow = findBestHeaderRow(
            rows,
            headers -> applyIdentityOverrides(headers, inferIdentityColumns(headers), mappingOverrides),
            SheetImportService::scoreTeamFormationHeader
        );
        IdentityColumns identity = applyIdentityOverrides(headerRow.headers(), inferIdentityColumns(headerRow.headers()), mappingOverrides);
        List<String> warnings = new ArrayList<>();
        int skippedRows = 0;
        int studentsFound = 0;
        int officialIdsFound = 0;
        int memberNumbersFound = 0;
        int emailsFound = 0;
        Set<String> teams = new LinkedHashSet<>();

        List<String> missingFields = new ArrayList<>();
        if (identity.studentNumber() < 0) missingFields.add("Student Number");
        if (!hasStudentNameColumn(identity)) missingFields.add("Student name");
        if (identity.teamCode() < 0) missingFields.add("Team code");
        if (identity.memberNumber() < 0) missingFields.add("Member number");
        if (identity.email() < 0) missingFields.add("Institutional email");

        if (identity.studentNumber() < 0 || !hasStudentNameColumn(identity) || identity.teamCode() < 0) {
            throw new IllegalArgumentException(
                "This does not look like a usable Team Formation Sheet. Missing required fields: "
                    + String.join(", ", missingFields.stream()
                        .filter(field -> List.of("Student Number", "Student name", "Team code").contains(field))
                        .toList())
                    + "."
            );
        }

        if (identity.memberNumber() < 0) warnings.add("Member number column was not found.");
        if (identity.email() < 0) warnings.add("Institutional email column was not found.");

        for (int index = headerRow.index() + 1; index < rows.size(); index += 1) {
            int sourceRowNumber = index + 1;
            List<String> row = rows.get(index);
            String studentNumber = getCell(row, identity.studentNumber());
            String name = getStudentName(row, identity);
            String teamCode = getCell(row, identity.teamCode());
            String memberNumber = getCell(row, identity.memberNumber());

            if (studentNumber.isBlank() || name.isBlank() || teamCode.isBlank()) {
                skippedRows += 1;
                continue;
            }

            StudentRecord record = findStudentRecord(workspaceId, studentNumber, teamCode, memberNumber)
                .orElseGet(() -> new StudentRecord(
                    workspaceId,
                    studentNumber,
                    name,
                    teamCode,
                    memberNumber,
                    getCell(row, identity.section()),
                    getCell(row, identity.adviser()),
                    getCell(row, identity.email()),
                    sourceRowNumber
                ));
            record.updateFromTeamFormation(
                studentNumber,
                name,
                teamCode,
                memberNumber,
                getCell(row, identity.section()),
                getCell(row, identity.adviser()),
                getCell(row, identity.email()),
                sourceRowNumber
            );
            studentRecordRepository.save(record);
            studentsFound += 1;
            officialIdsFound += studentNumber.isBlank() ? 0 : 1;
            memberNumbersFound += memberNumber.isBlank() ? 0 : 1;
            emailsFound += getCell(row, identity.email()).isBlank() ? 0 : 1;
            teams.add(teamCode.toLowerCase(Locale.ROOT));
        }

        if (skippedRows > 0) {
            warnings.add("Skipped " + skippedRows + " Team Formation row" + plural(skippedRows) + " without Student Number, name, or team code.");
        }

        return new ImportResult(
            studentsFound,
            headerRow.headers().size(),
            studentsFound,
            officialIdsFound,
            0,
            warnings,
            List.of(),
            new SheetImportDetails(
                true,
                headerRow.index() + 1,
                detectedIdentityFields(identity),
                missingFields,
                Map.of(
                    "students", studentsFound,
                    "officialIds", officialIdsFound,
                    "teams", teams.size(),
                    "memberNumbers", memberNumbersFound,
                    "institutionalEmails", emailsFound,
                    "skippedRows", skippedRows
                ),
                0
            )
        );
    }

    private ImportResult importTracker(UUID workspaceId, List<List<String>> rows, Map<String, String> mappingOverrides) {
        HeaderRow headerRow = findBestHeaderRow(
            rows,
            headers -> applyIdentityOverrides(headers, inferIdentityColumns(headers), mappingOverrides),
            SheetImportService::scoreTrackerHeader
        );
        IdentityColumns identity = applyIdentityOverrides(headerRow.headers(), inferIdentityColumns(headerRow.headers()), mappingOverrides);
        int softwareTitleIndex = findTrackerSoftwareTitleIndex(headerRow.headers());
        int rowNumberIndex = findTrackerRowNumberIndex(headerRow.headers());
        Set<Integer> metadataIndexes = identity.indexes();
        if (softwareTitleIndex >= 0) metadataIndexes.add(softwareTitleIndex);
        if (rowNumberIndex >= 0) metadataIndexes.add(rowNumberIndex);
        Set<Integer> trackerColumnIndexes = findTrackerColumnIndexes(
            workspaceId,
            rows,
            headerRow,
            identity,
            metadataIndexes
        );
        List<String> ignoredTrackerHeaders = new ArrayList<>();
        for (int index = 0; index < headerRow.headers().size(); index += 1) {
            String header = headerRow.headers().get(index).trim();
            if (!header.isBlank() && !metadataIndexes.contains(index) && !trackerColumnIndexes.contains(index)) {
                ignoredTrackerHeaders.add(header);
            }
        }
        List<TrackerColumn> trackerColumns = upsertTrackerColumns(workspaceId, headerRow.headers(), trackerColumnIndexes);
        List<String> warnings = new ArrayList<>();
        if (!ignoredTrackerHeaders.isEmpty()) {
            warnings.add(
                "Ignored Tracker header" + plural(ignoredTrackerHeaders.size())
                    + " without deadline evidence or prior tracker-column history: "
                    + String.join(", ", ignoredTrackerHeaders)
                    + "."
            );
        }
        List<DeadlineSuggestionResponse> deadlineSuggestions = new ArrayList<>();
        int trackerRowsFound = 0;
        int officialIdsFound = 0;
        int skippedRows = 0;
        int rawProgressCells = 0;
        int matchedRows = 0;
        int unmatchedRows = 0;
        Set<Integer> detectedDeadlineRows = new LinkedHashSet<>();
        Set<UUID> currentTrackerStudentIds = new LinkedHashSet<>();

        List<String> missingFields = new ArrayList<>();
        if (!hasStudentNameColumn(identity)) missingFields.add("Student name");
        if (identity.teamCode() < 0) missingFields.add("Team code");
        if (identity.memberNumber() < 0) missingFields.add("Member number");
        if (trackerColumns.isEmpty()) missingFields.add("Tracker/deliverable columns");

        if (!hasStudentNameColumn(identity) || identity.teamCode() < 0 || trackerColumns.isEmpty()) {
            throw new IllegalArgumentException(
                "This does not look like a usable Tracker Sheet. Missing required fields: "
                    + String.join(", ", missingFields.stream()
                        .filter(field -> !field.equals("Member number"))
                        .toList())
                    + "."
            );
        }

        if (identity.studentNumber() < 0) {
            warnings.add("Tracker has no Student Number column. Official IDs are preserved from Team Formation only.");
        }
        if (identity.memberNumber() < 0) warnings.add("Tracker member number column was not found.");

        for (int index = headerRow.index() + 1; index < rows.size(); index += 1) {
            int sourceRowNumber = index + 1;
            List<String> row = rows.get(index);
            String name = getStudentName(row, identity);
            String teamCode = getCell(row, identity.teamCode());
            String memberNumber = getCell(row, identity.memberNumber());
            String softwareTitle = getCell(row, softwareTitleIndex);

            if (name.isBlank() || teamCode.isBlank()) {
                List<DeadlineSuggestionResponse> detected = detectDeadlineSuggestions(row, trackerColumns, sourceRowNumber);
                deadlineSuggestions.addAll(detected);
                if (!detected.isEmpty()) detectedDeadlineRows.add(sourceRowNumber);
                skippedRows += 1;
                continue;
            }

            Optional<StudentRecord> matchedStudent = findStudentRecord(workspaceId, getCell(row, identity.studentNumber()), teamCode, memberNumber);
            if (matchedStudent.isPresent()) matchedRows += 1;
            else unmatchedRows += 1;
            String studentNumber = firstNonBlank(getCell(row, identity.studentNumber()), matchedStudent.map(StudentRecord::getStudentNumber).orElse(""));
            String section = firstNonBlank(getCell(row, identity.section()), matchedStudent.map(StudentRecord::getSectionName).orElse(""));
            String adviser = firstNonBlank(getCell(row, identity.adviser()), matchedStudent.map(StudentRecord::getAdviserName).orElse(""));

            StudentRecord currentStudent = matchedStudent.orElseGet(() -> new StudentRecord(
                workspaceId,
                studentNumber,
                name,
                teamCode,
                null,
                memberNumber,
                section,
                adviser,
                null,
                softwareTitle,
                sourceRowNumber
            ));
            currentStudent.updateFromTracker(
                studentNumber,
                name,
                teamCode,
                memberNumber,
                section,
                adviser,
                softwareTitle,
                sourceRowNumber
            );
            currentStudent.setCurrentActive(true);
            currentStudent = studentRecordRepository.save(currentStudent);
            currentTrackerStudentIds.add(currentStudent.getId());
            reconcileProjectWithCurrentTracker(workspaceId, currentStudent, teamCode, softwareTitle, adviser);

            TrackerRow trackerRow = findTrackerRow(workspaceId, studentNumber, teamCode, memberNumber, name)
                .orElseGet(() -> new TrackerRow(workspaceId, studentNumber, name, teamCode, memberNumber, section, adviser, sourceRowNumber));
            trackerRow.updateFrom(studentNumber, name, teamCode, memberNumber, section, adviser, sourceRowNumber);
            TrackerRow savedRow = trackerRowRepository.save(trackerRow);

            for (TrackerColumn column : trackerColumns) {
                String rawValue = getCell(row, column.getSourceColumnIndex());
                if (!rawValue.isBlank()) rawProgressCells += 1;
                String normalizedStatus = normalizeTrackerStatus(rawValue);
                TrackerCell cell = trackerCellRepository.findByTrackerRowIdAndTrackerColumnId(savedRow.getId(), column.getId())
                    .orElseGet(() -> new TrackerCell(
                        savedRow,
                        column,
                        rawValue,
                        normalizedStatus,
                        sourceRowNumber,
                        column.getSourceColumnIndex()
                    ));
                cell.updateValue(rawValue, normalizedStatus, sourceRowNumber, column.getSourceColumnIndex());
                trackerCellRepository.save(cell);
            }

            trackerRowsFound += 1;
            officialIdsFound += studentNumber.isBlank() ? 0 : 1;
        }

        for (StudentRecord student : studentRecordRepository.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId)) {
            boolean active = currentTrackerStudentIds.contains(student.getId());
            if (student.isCurrentActive() != active) {
                student.setCurrentActive(active);
                studentRecordRepository.save(student);
            }
        }

        if (skippedRows > 0) {
            warnings.add("Skipped " + skippedRows + " non-student row" + plural(skippedRows) + " without a name and team code.");
        }
        if (!deadlineSuggestions.isEmpty()) {
            warnings.add("Detected " + deadlineSuggestions.size() + " deadline value" + plural(deadlineSuggestions.size()) + " from skipped tracker rows.");
        } else {
            warnings.add("No deadline row was detected. Tracker data was imported without form suggestions.");
        }

        return new ImportResult(
            trackerRowsFound,
            trackerColumns.size(),
            trackerRowsFound,
            officialIdsFound,
            0,
            warnings,
            deadlineSuggestions,
            new SheetImportDetails(
                true,
                headerRow.index() + 1,
                detectedTrackerFields(identity, trackerColumns),
                missingFields,
                Map.of(
                    "studentRows", trackerRowsFound,
                    "trackerColumns", trackerColumns.size(),
                    "rawProgressCells", rawProgressCells,
                    "matchedRows", matchedRows,
                    "unmatchedRows", unmatchedRows,
                    "skippedRows", skippedRows,
                    "deadlineValues", deadlineSuggestions.size()
                ),
                detectedDeadlineRows.size()
            )
        );
    }

    private ImportResult importProjectMonitor(UUID workspaceId, List<List<String>> rows, Map<String, String> mappingOverrides) {
        HeaderRow headerRow = findBestHeaderRow(
            rows,
            headers -> applyProjectOverrides(headers, inferProjectColumns(headers), mappingOverrides),
            SheetImportService::scoreProjectHeader
        );
        ProjectColumns columns = applyProjectOverrides(headerRow.headers(), inferProjectColumns(headerRow.headers()), mappingOverrides);
        List<String> warnings = new ArrayList<>();
        int groupsFound = 0;
        int skippedRows = 0;
        int projectTitlesFound = 0;
        int softwareNamesFound = 0;
        int descriptionsFound = 0;
        int advisersFound = 0;
        int proposalRemarksFound = 0;
        int demoCommentsFound = 0;
        int categoriesFound = 0;
        int outsideWorkspaceRows = 0;
        Set<String> knownFormationTeams = studentRecordRepository
            .findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId)
            .stream()
            .map(StudentRecord::getTeamFormationCode)
            .filter(Objects::nonNull)
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .map(value -> value.toLowerCase(Locale.ROOT))
            .collect(Collectors.toCollection(LinkedHashSet::new));

        List<String> missingFields = new ArrayList<>();
        if (columns.groupCode() < 0) missingFields.add("Group code");
        if (columns.projectTitle() < 0) missingFields.add("Project title");
        if (columns.softwareName() < 0) missingFields.add("Software name");
        if (columns.description() < 0) missingFields.add("Description");
        if (columns.proposalRemarks() < 0) missingFields.add("Proposal remarks");
        if (columns.demoComments() < 0) missingFields.add("Demo comments");
        if (columns.statusAdviser() < 0) missingFields.add("Adviser/status");
        if (columns.category() < 0) missingFields.add("Category");

        if (columns.groupCode() < 0 || columns.projectTitle() < 0) {
            throw new IllegalArgumentException(
                "This does not look like a usable Software Project Monitor Sheet. Missing required fields: "
                    + String.join(", ", missingFields.stream()
                        .filter(field -> List.of("Group code", "Project title").contains(field))
                        .toList())
                    + "."
            );
        }

        for (int index = headerRow.index() + 1; index < rows.size(); index += 1) {
            int sourceRowNumber = index + 1;
            List<String> row = rows.get(index);
            String groupCode = getCell(row, columns.groupCode());
            if (groupCode.isBlank()) {
                skippedRows += 1;
                continue;
            }
            if (!knownFormationTeams.isEmpty() && !knownFormationTeams.contains(groupCode.toLowerCase(Locale.ROOT))) {
                outsideWorkspaceRows += 1;
                continue;
            }

            String statusAdviser = getCell(row, columns.statusAdviser());
            ProjectMetadata metadata = projectMetadataRepository.findByWorkspaceIdAndGroupCodeIgnoreCase(workspaceId, groupCode)
                .orElseGet(() -> new ProjectMetadata(
                    workspaceId,
                    groupCode,
                    getCell(row, columns.projectTitle()),
                    getCell(row, columns.softwareName()),
                    getCell(row, columns.description()),
                    getCell(row, columns.proposalRemarks()),
                    getCell(row, columns.demoComments()),
                    statusAdviser,
                    statusAdviser,
                    getCell(row, columns.category()),
                    sourceRowNumber
                ));
            metadata.updateFrom(
                groupCode,
                getCell(row, columns.projectTitle()),
                getCell(row, columns.softwareName()),
                getCell(row, columns.description()),
                getCell(row, columns.proposalRemarks()),
                getCell(row, columns.demoComments()),
                statusAdviser,
                statusAdviser,
                getCell(row, columns.category()),
                sourceRowNumber
            );
            applyCurrentTrackerContextFromRoster(workspaceId, metadata, groupCode, warnings);
            projectMetadataRepository.save(metadata);
            groupsFound += 1;
            projectTitlesFound += getCell(row, columns.projectTitle()).isBlank() ? 0 : 1;
            softwareNamesFound += getCell(row, columns.softwareName()).isBlank() ? 0 : 1;
            descriptionsFound += getCell(row, columns.description()).isBlank() ? 0 : 1;
            advisersFound += statusAdviser.isBlank() ? 0 : 1;
            proposalRemarksFound += getCell(row, columns.proposalRemarks()).isBlank() ? 0 : 1;
            demoCommentsFound += getCell(row, columns.demoComments()).isBlank() ? 0 : 1;
            categoriesFound += getCell(row, columns.category()).isBlank() ? 0 : 1;
        }

        if (skippedRows > 0) {
            warnings.add("Skipped " + skippedRows + " Software Project Monitor row" + plural(skippedRows) + " without a group code.");
        }
        if (outsideWorkspaceRows > 0) {
            warnings.add("Skipped " + outsideWorkspaceRows + " Software Project Monitor row" + plural(outsideWorkspaceRows) + " outside this workspace's Team Formation roster.");
        }

        return new ImportResult(
            groupsFound,
            headerRow.headers().size(),
            0,
            0,
            groupsFound,
            warnings,
            List.of(),
            new SheetImportDetails(
                true,
                headerRow.index() + 1,
                detectedProjectFields(columns),
                missingFields,
                Map.of(
                    "groups", groupsFound,
                    "projectTitles", projectTitlesFound,
                    "softwareNames", softwareNamesFound,
                    "descriptions", descriptionsFound,
                    "adviserAssignments", advisersFound,
                    "proposalRemarks", proposalRemarksFound,
                    "demoComments", demoCommentsFound,
                    "categories", categoriesFound,
                    "skippedRows", skippedRows
                ),
                0
            )
        );
    }

    private Set<Integer> findTrackerColumnIndexes(
        UUID workspaceId,
        List<List<String>> rows,
        HeaderRow headerRow,
        IdentityColumns identity,
        Set<Integer> metadataIndexes
    ) {
        Set<String> knownTrackerKeys = trackerColumnRepository.findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(workspaceId)
            .stream()
            .map(TrackerColumn::getColumnKey)
            .map(SheetImportService::normalizeHeader)
            .collect(Collectors.toCollection(LinkedHashSet::new));
        Set<Integer> indexes = new LinkedHashSet<>();
        for (int columnIndex = 0; columnIndex < headerRow.headers().size(); columnIndex += 1) {
            String header = headerRow.headers().get(columnIndex).trim();
            if (header.isBlank() || metadataIndexes.contains(columnIndex)) {
                continue;
            }
            if (knownTrackerKeys.contains(normalizeHeader(header))
                || hasDeadlineEvidence(rows, headerRow.index(), identity, columnIndex)) {
                indexes.add(columnIndex);
            }
        }
        return indexes;
    }

    private static boolean hasDeadlineEvidence(
        List<List<String>> rows,
        int headerRowIndex,
        IdentityColumns identity,
        int columnIndex
    ) {
        for (int rowIndex = headerRowIndex + 1; rowIndex < rows.size(); rowIndex += 1) {
            List<String> row = rows.get(rowIndex);
            String name = getStudentName(row, identity);
            String teamCode = getCell(row, identity.teamCode());
            if (!name.isBlank() && !teamCode.isBlank()) {
                continue;
            }
            if (!coerceDueAt(getCell(row, columnIndex)).isBlank()) {
                return true;
            }
        }
        return false;
    }

    private List<TrackerColumn> upsertTrackerColumns(UUID workspaceId, List<String> headers, Set<Integer> trackerColumnIndexes) {
        List<TrackerColumn> columns = new ArrayList<>();
        Set<String> importedKeys = new LinkedHashSet<>();
        int displayOrder = 0;
        for (int index = 0; index < headers.size(); index += 1) {
            String header = headers.get(index).trim();
            if (header.isBlank() || !trackerColumnIndexes.contains(index)) {
                continue;
            }
            importedKeys.add(normalizeHeader(header));
            int sourceColumnIndex = index;
            int columnDisplayOrder = displayOrder;
            TrackerColumn column = trackerColumnRepository.findByWorkspaceIdAndColumnKeyIgnoreCase(workspaceId, header)
                .orElseGet(() -> new TrackerColumn(
                    workspaceId,
                    header,
                    header,
                    header,
                    sourceColumnIndex,
                    columnDisplayOrder,
                    true,
                    isLikelyPdfDeliverable(header)
                ));
            column.updateFrom(header, header, header, sourceColumnIndex, columnDisplayOrder, true, isLikelyPdfDeliverable(header));
            columns.add(trackerColumnRepository.save(column));
            displayOrder += 1;
        }
        for (TrackerColumn previous : trackerColumnRepository.findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(workspaceId)) {
            if (Boolean.TRUE.equals(previous.getActive()) && !importedKeys.contains(normalizeHeader(previous.getColumnKey()))) {
                previous.updateFrom(
                    previous.getColumnKey(),
                    previous.getLabel(),
                    previous.getSourceColumn(),
                    previous.getSourceColumnIndex(),
                    previous.getDisplayOrder(),
                    false,
                    previous.getPdfRequired()
                );
                trackerColumnRepository.save(previous);
            }
        }
        return columns.stream()
            .sorted(Comparator.comparing(TrackerColumn::getDisplayOrder))
            .toList();
    }

    private void reconcileProjectWithCurrentTracker(
        UUID workspaceId,
        StudentRecord student,
        String currentTeamCode,
        String softwareTitle,
        String adviser
    ) {
        Optional<ProjectMetadata> project = findProjectForTrackerStudent(workspaceId, student, currentTeamCode);
        project.ifPresent(metadata -> {
            metadata.applyCurrentTrackerContext(currentTeamCode, softwareTitle, adviser);
            projectMetadataRepository.save(metadata);
        });
    }

    private Optional<ProjectMetadata> findProjectForTrackerStudent(
        UUID workspaceId,
        StudentRecord student,
        String currentTeamCode
    ) {
        String teamFormationCode = student.getTeamFormationCode();
        return teamFormationCode == null || teamFormationCode.isBlank()
            ? projectMetadataRepository.findForCurrentTeam(workspaceId, currentTeamCode)
            : projectMetadataRepository.findByWorkspaceIdAndGroupCodeIgnoreCase(workspaceId, teamFormationCode)
                .or(() -> projectMetadataRepository.findForCurrentTeam(workspaceId, currentTeamCode));
    }

    private void applyCurrentTrackerContextFromRoster(
        UUID workspaceId,
        ProjectMetadata metadata,
        String sourceGroupCode,
        List<String> warnings
    ) {
        List<StudentRecord> linked = studentRecordRepository.findAllByWorkspaceIdAndTeamFormationCodeIgnoreCase(workspaceId, sourceGroupCode);
        Set<String> currentTeams = linked.stream()
            .filter(StudentRecord::isCurrentActive)
            .map(StudentRecord::getTeamCode)
            .filter(Objects::nonNull)
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .collect(Collectors.toCollection(LinkedHashSet::new));
        if (currentTeams.size() == 1) {
            String currentTeam = currentTeams.iterator().next();
            StudentRecord representative = linked.stream()
                .filter(StudentRecord::isCurrentActive)
                .filter(student -> currentTeam.equalsIgnoreCase(student.getTeamCode()))
                .filter(student -> student.getSoftwareTitle() != null || student.getAdviserName() != null)
                .findFirst()
                .orElse(linked.getFirst());
            metadata.applyCurrentTrackerContext(currentTeam, representative.getSoftwareTitle(), representative.getAdviserName());
        } else if (currentTeams.size() > 1) {
            warnings.add("Project Monitor group " + sourceGroupCode + " maps to multiple current Tracker teams; current-team linkage was left unresolved.");
        }
    }

    private Optional<StudentRecord> findStudentRecord(UUID workspaceId, String studentNumber, String teamCode, String memberNumber) {
        if (!studentNumber.isBlank()) {
            return studentRecordRepository.findByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, studentNumber);
        }
        if (!teamCode.isBlank() && !memberNumber.isBlank()) {
            return studentRecordRepository.findFirstByWorkspaceIdAndTeamCodeIgnoreCaseAndMemberNumberIgnoreCase(workspaceId, teamCode, memberNumber);
        }
        return Optional.empty();
    }

    private Optional<TrackerRow> findTrackerRow(UUID workspaceId, String studentNumber, String teamCode, String memberNumber, String name) {
        if (studentNumber != null && !studentNumber.isBlank()) {
            Optional<TrackerRow> byNumber = trackerRowRepository.findByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, studentNumber);
            if (byNumber.isPresent()) {
                return byNumber;
            }
        }
        if (!teamCode.isBlank() && !memberNumber.isBlank()) {
            Optional<TrackerRow> byTeamMemberName = trackerRowRepository.findFirstByWorkspaceIdAndTeamCodeIgnoreCaseAndMemberNumberIgnoreCaseAndStudentNameIgnoreCase(
                workspaceId,
                teamCode,
                memberNumber,
                name
            );
            if (byTeamMemberName.isPresent()) {
                return byTeamMemberName;
            }
            return trackerRowRepository.findFirstByWorkspaceIdAndTeamCodeIgnoreCaseAndMemberNumberIgnoreCase(workspaceId, teamCode, memberNumber);
        }
        return Optional.empty();
    }

    private List<DeadlineSuggestionResponse> detectDeadlineSuggestions(List<String> row, List<TrackerColumn> columns, int sourceRowNumber) {
        return columns.stream()
            .map(column -> {
                String raw = getCell(row, column.getSourceColumnIndex());
                String dueAt = coerceDueAt(raw);
                if (dueAt.isBlank()) {
                    return null;
                }
                return new DeadlineSuggestionResponse(
                    column.getColumnKey(),
                    column.getLabel() + " Submission",
                    dueAt,
                    column.getPdfRequired(),
                    raw,
                    sourceRowNumber
                );
            })
            .filter(Objects::nonNull)
            .toList();
    }

    private static HeaderRow findBestHeaderRow(
        List<List<String>> rows,
        HeaderInference headerInference,
        HeaderScoring headerScoring
    ) {
        HeaderRow best = new HeaderRow(0, rows.getFirst(), -1);
        int limit = Math.min(20, rows.size());
        for (int index = 0; index < limit; index += 1) {
            List<String> headers = rows.get(index).stream().map(String::trim).toList();
            int score = headerScoring.score(headerInference.infer(headers), headers);
            if (score > best.score()) {
                best = new HeaderRow(index, headers, score);
            }
        }
        return best;
    }

    private static IdentityColumns inferIdentityColumns(List<String> headers) {
        List<String> normalized = headers.stream().map(SheetImportService::normalizeHeader).toList();
        return new IdentityColumns(
            findHeader(normalized, "studentno", "studentnumber", "studentid", "schoolid", "idnumber", "studno"),
            findExactHeader(normalized, "nameofstudent", "studentname", "name"),
            findHeader(normalized, "lastname", "surname", "familyname"),
            findHeader(normalized, "firstname", "givenname"),
            findHeader(normalized, "teamformation", "teamcode", "team"),
            findMemberNumberHeader(normalized),
            findHeader(normalized, "section", "classsection"),
            findExactHeader(normalized, "adviser", "advisor", "advisername", "advisorname", "facultyadviser", "capstoneadviser", "teacher", "instructor"),
            findHeader(normalized, "email", "gmail", "googleaccount", "citeduaccount", "institutionalemail", "citaccount")
        );
    }

    private static ProjectColumns inferProjectColumns(List<String> headers) {
        List<String> normalized = headers.stream().map(SheetImportService::normalizeHeader).toList();
        return new ProjectColumns(
            findHeader(normalized, "groupcode", "teamcode", "teamformation"),
            findHeader(normalized, "projecttitle", "title"),
            findHeader(normalized, "softwarename", "software"),
            findHeader(normalized, "description"),
            findHeader(normalized, "proposalremarks", "proposal"),
            findHeader(normalized, "democomments", "demo"),
            findHeader(normalized, "statusadviser", "adviser", "advisor", "status"),
            findHeader(normalized, "category")
        );
    }

    private static int findMemberNumberHeader(List<String> normalizedHeaders) {
        int exact = findExactHeader(
            normalizedHeaders,
            "member", "memberno", "membernumber", "memberid", "mid", "teamdetailsmember"
        );
        if (exact >= 0) {
            return exact;
        }
        for (int index = 0; index < normalizedHeaders.size(); index += 1) {
            String header = normalizedHeaders.get(index);
            if (header.contains("member") && !header.contains("teamcode") && !header.contains("teamlead")) {
                return index;
            }
        }
        return -1;
    }

    private static int findTrackerSoftwareTitleIndex(List<String> headers) {
        return findHeader(
            headers.stream().map(SheetImportService::normalizeHeader).toList(),
            "softwaretitle", "softwarename"
        );
    }

    private static int findTrackerRowNumberIndex(List<String> headers) {
        return findExactHeader(
            headers.stream().map(SheetImportService::normalizeHeader).toList(),
            "no", "number", "rowno", "rownumber"
        );
    }

    private static IdentityColumns applyIdentityOverrides(
        List<String> headers,
        IdentityColumns inferred,
        Map<String, String> overrides
    ) {
        return new IdentityColumns(
            overrideIndex(headers, overrides, "studentNumber", inferred.studentNumber()),
            overrideIndex(headers, overrides, "studentName", inferred.studentName()),
            overrideIndex(headers, overrides, "lastName", inferred.lastName()),
            overrideIndex(headers, overrides, "firstName", inferred.firstName()),
            overrideIndex(headers, overrides, "teamCode", inferred.teamCode()),
            overrideIndex(headers, overrides, "memberNumber", inferred.memberNumber()),
            overrideIndex(headers, overrides, "section", inferred.section()),
            overrideIndex(headers, overrides, "adviser", inferred.adviser()),
            overrideIndex(headers, overrides, "email", inferred.email())
        );
    }

    private static ProjectColumns applyProjectOverrides(
        List<String> headers,
        ProjectColumns inferred,
        Map<String, String> overrides
    ) {
        return new ProjectColumns(
            overrideIndex(headers, overrides, "groupCode", inferred.groupCode()),
            overrideIndex(headers, overrides, "projectTitle", inferred.projectTitle()),
            overrideIndex(headers, overrides, "softwareName", inferred.softwareName()),
            overrideIndex(headers, overrides, "description", inferred.description()),
            overrideIndex(headers, overrides, "proposalRemarks", inferred.proposalRemarks()),
            overrideIndex(headers, overrides, "demoComments", inferred.demoComments()),
            overrideIndex(headers, overrides, "statusAdviser", inferred.statusAdviser()),
            overrideIndex(headers, overrides, "category", inferred.category())
        );
    }

    private static int overrideIndex(
        List<String> headers,
        Map<String, String> overrides,
        String key,
        int inferredIndex
    ) {
        if (overrides == null || !overrides.containsKey(key)) {
            return inferredIndex;
        }
        String requestedHeader = normalizeNullable(overrides.get(key));
        if (requestedHeader == null) {
            return -1;
        }
        for (int index = 0; index < headers.size(); index += 1) {
            if (headers.get(index).trim().equalsIgnoreCase(requestedHeader)) {
                return index;
            }
        }
        return -1;
    }

    private static int scoreTeamFormationHeader(Object inferred, List<String> headers) {
        IdentityColumns identity = (IdentityColumns) inferred;
        int score = 0;
        if (identity.studentNumber() >= 0) {
            score += 3;
        }
        if (identity.teamCode() >= 0) {
            score += 3;
        }
        if (identity.memberNumber() >= 0) {
            score += 2;
        }
        if (identity.studentName() >= 0) {
            score += 2;
        }
        if (identity.lastName() >= 0) {
            score += 1;
        }
        if (identity.firstName() >= 0) {
            score += 1;
        }
        if (identity.email() >= 0) {
            score += 1;
        }
        return score;
    }

    private static int scoreTrackerHeader(Object inferred, List<String> headers) {
        int identityScore = scoreTeamFormationHeader(inferred, headers);
        List<String> trackerWords = List.of("prob", "convergence", "rrl", "proposal", "srs", "sdd", "spmp", "source", "demo", "peer", "mvpvalidation", "refactored", "std");
        long trackerScore = headers.stream()
            .map(SheetImportService::normalizeHeader)
            .filter(header -> trackerWords.stream().anyMatch(header::contains))
            .count();
        return identityScore + Math.toIntExact(trackerScore);
    }

    private static int scoreProjectHeader(Object inferred, List<String> headers) {
        ProjectColumns indexes = (ProjectColumns) inferred;
        int score = 0;
        if (indexes.groupCode() >= 0) {
            score += 3;
        }
        if (indexes.projectTitle() >= 0) {
            score += 2;
        }
        if (indexes.softwareName() >= 0) {
            score += 2;
        }
        if (indexes.description() >= 0) {
            score += 1;
        }
        if (indexes.proposalRemarks() >= 0) {
            score += 1;
        }
        if (indexes.demoComments() >= 0) {
            score += 1;
        }
        if (indexes.statusAdviser() >= 0) {
            score += 1;
        }
        return score;
    }

    private static String getStudentName(List<String> row, IdentityColumns identity) {
        String fullName = getCell(row, identity.studentName());
        if (!fullName.isBlank()) {
            return fullName;
        }
        String lastName = getCell(row, identity.lastName());
        String firstName = getCell(row, identity.firstName());
        if (!lastName.isBlank() && !firstName.isBlank()) {
            return lastName + ", " + firstName;
        }
        return firstNonBlank(lastName, firstName);
    }

    private static String normalizeTrackerStatus(String value) {
        String text = value == null ? "" : value.trim();
        if (text.isBlank()) {
            return "BLANK";
        }
        if (text.equalsIgnoreCase("#N/A")) {
            return "NOT_APPLICABLE";
        }
        if (text.equalsIgnoreCase("DONE")) {
            return "DONE";
        }
        if (text.matches("-?\\d+(\\.\\d+)?")) {
            double number = Double.parseDouble(text);
            if (number == 0) {
                return "ON_TIME";
            }
            if (number > 0) {
                return "LATE";
            }
        }
        if (!coerceDueAt(text).isBlank()) {
            return "DATE";
        }
        return "VALUE";
    }

    private static String coerceDueAt(String value) {
        String text = value == null ? "" : value.trim();
        if (text.isBlank() || text.equalsIgnoreCase("#N/A")) {
            return "";
        }

        String datePart = text.contains("|") ? text.substring(0, text.indexOf('|')).trim() : text;
        for (DateTimeFormatter formatter : DATE_TIME_FORMATTERS) {
            try {
                LocalDateTime dateTime = LocalDateTime.parse(datePart, formatter);
                return dateTime.format(OUTPUT_DEADLINE_FORMAT);
            } catch (DateTimeParseException ignored) {
            }
        }
        for (DateTimeFormatter formatter : DATE_FORMATTERS) {
            try {
                LocalDate date = LocalDate.parse(datePart, formatter);
                return LocalDateTime.of(date, LocalTime.of(23, 59)).format(OUTPUT_DEADLINE_FORMAT);
            } catch (DateTimeParseException ignored) {
            }
        }

        return "";
    }

    private static boolean hasStudentNameColumn(IdentityColumns identity) {
        return identity.studentName() >= 0
            || identity.lastName() >= 0
            || identity.firstName() >= 0;
    }

    private static List<String> detectedIdentityFields(IdentityColumns identity) {
        List<String> fields = new ArrayList<>();
        if (identity.studentNumber() >= 0) fields.add("Student Number");
        if (hasStudentNameColumn(identity)) fields.add("Student name");
        if (identity.teamCode() >= 0) fields.add("Team code");
        if (identity.memberNumber() >= 0) fields.add("Member number");
        if (identity.section() >= 0) fields.add("Section");
        if (identity.adviser() >= 0) fields.add("Adviser");
        if (identity.email() >= 0) fields.add("Institutional email");
        return fields;
    }

    private static List<String> detectedTrackerFields(IdentityColumns identity, List<TrackerColumn> trackerColumns) {
        List<String> fields = new ArrayList<>(detectedIdentityFields(identity));
        fields.addAll(trackerColumns.stream().map(TrackerColumn::getLabel).toList());
        return fields;
    }

    private static List<String> detectedProjectFields(ProjectColumns columns) {
        List<String> fields = new ArrayList<>();
        if (columns.groupCode() >= 0) fields.add("Group code");
        if (columns.projectTitle() >= 0) fields.add("Project title");
        if (columns.softwareName() >= 0) fields.add("Software name");
        if (columns.description() >= 0) fields.add("Description");
        if (columns.proposalRemarks() >= 0) fields.add("Proposal remarks");
        if (columns.demoComments() >= 0) fields.add("Demo comments");
        if (columns.statusAdviser() >= 0) fields.add("Adviser/status");
        if (columns.category() >= 0) fields.add("Category");
        return fields;
    }

    private static String getCell(List<String> row, int index) {
        if (index < 0 || index >= row.size()) {
            return "";
        }
        return row.get(index) == null ? "" : row.get(index).trim();
    }

    private static String normalizeHeader(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private static int findHeader(List<String> headers, String... candidates) {
        for (int index = 0; index < headers.size(); index += 1) {
            String header = headers.get(index);
            for (String candidate : candidates) {
                if (header.equals(candidate) || header.contains(candidate)) {
                    return index;
                }
            }
        }
        return -1;
    }

    private static int findExactHeader(List<String> headers, String... candidates) {
        Set<String> candidateSet = Set.of(candidates);
        for (int index = 0; index < headers.size(); index += 1) {
            if (candidateSet.contains(headers.get(index))) {
                return index;
            }
        }
        return -1;
    }

    private static boolean isLikelyPdfDeliverable(String header) {
        String key = normalizeHeader(header);
        return Set.of(
            "rrl",
            "projectproposal",
            "spmp",
            "srs",
            "sdd",
            "refactoredspmp",
            "refactoredsrs",
            "refactoredsdd",
            "adviserassessment"
        ).contains(key);
    }

    private static String extractSheetId(String value) {
        String text = value == null ? "" : value.trim();
        String marker = "/spreadsheets/d/";
        int start = text.indexOf(marker);
        if (start < 0) {
            return text;
        }
        String after = text.substring(start + marker.length());
        if (after.startsWith("e/")) {
            after = after.substring(2);
        }
        int end = after.indexOf('/');
        String idWithQuery = end >= 0 ? after.substring(0, end) : after;
        int query = idWithQuery.indexOf('?');
        return query >= 0 ? idWithQuery.substring(0, query) : idWithQuery;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private String toJson(ImportResult result) {
        try {
            return objectMapper.writeValueAsString(result);
        } catch (JsonProcessingException exception) {
            return "{}";
        }
    }

    private static String escapeJson(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String plural(int count) {
        return count == 1 ? "" : "s";
    }

    private record SourceInput(String sheetUrl, String displayName) {
    }

    private record PreviewSession(
        UUID previewId,
        UUID workspaceId,
        WorkspaceSourceType sourceType,
        SheetImportRequest request,
        String stateVersion,
        String sourceVersion
    ) {
    }

    private record SourceStudent(
        String studentNumber,
        String studentName,
        String teamCode,
        String memberNumber,
        String section,
        String adviser,
        String email,
        String softwareTitle,
        Integer sourceRowNumber
    ) {
    }

    private record SourceProject(
        String groupCode,
        String projectTitle,
        String softwareName,
        String description,
        String proposalRemarks,
        String demoComments,
        String adviser,
        String projectStatus,
        String category,
        Integer sourceRowNumber
    ) {
    }

    private record SourceTrackerColumn(
        String key,
        String label,
        Integer sourceColumnIndex,
        Boolean pdfRequired
    ) {
    }

    private record SourceTrackerRow(
        String studentNumber,
        String studentName,
        String teamCode,
        String memberNumber,
        String section,
        String adviser,
        String softwareTitle,
        Integer sourceRowNumber,
        Map<String, String> values
    ) {
    }

    private record ParsedSource(
        List<SourceStudent> students,
        List<SourceTrackerRow> trackerRows,
        List<SourceProject> projects,
        List<SourceTrackerColumn> trackerColumns,
        List<String> warnings,
        List<DeadlineSuggestionResponse> deadlineSuggestions,
        SheetImportDetails details,
        Integer rowsFound,
        Integer columnsFound,
        Integer studentsFound,
        Integer officialIdsFound,
        Integer groupsFound
    ) {
    }

    private record DiffBundle(
        int addedRows,
        int changedRows,
        int missingRows,
        List<SheetImportPreviewResponse.Change> changes
    ) {
    }

    private record HeaderRow(int index, List<String> headers, int score) {
    }

    private record IdentityColumns(
        int studentNumber,
        int studentName,
        int lastName,
        int firstName,
        int teamCode,
        int memberNumber,
        int section,
        int adviser,
        int email
    ) {

        Set<Integer> indexes() {
            return new LinkedHashSet<>(List.of(
                studentNumber,
                studentName,
                lastName,
                firstName,
                teamCode,
                memberNumber,
                section,
                adviser,
                email
            )).stream().filter(index -> index >= 0).collect(Collectors.toCollection(LinkedHashSet::new));
        }
    }

    private record ProjectColumns(
        int groupCode,
        int projectTitle,
        int softwareName,
        int description,
        int proposalRemarks,
        int demoComments,
        int statusAdviser,
        int category
    ) {
    }

    private record ImportResult(
        Integer rowsFound,
        Integer columnsFound,
        Integer studentsFound,
        Integer officialIdsFound,
        Integer groupsFound,
        List<String> warnings,
        List<DeadlineSuggestionResponse> deadlineSuggestions,
        SheetImportDetails details
    ) {
    }

    @FunctionalInterface
    private interface HeaderInference {
        Object infer(List<String> headers);
    }

    @FunctionalInterface
    private interface HeaderScoring {
        int score(Object inferred, List<String> headers);
    }
}
