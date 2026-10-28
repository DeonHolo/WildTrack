package com.capvault.backend.academic;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.student.StudentRecord;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.student.StudentRecordResponse;
import com.capvault.backend.project.ProjectMetadataResponse;
import com.capvault.backend.project.ProjectMetadata;
import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableResponse;
import com.capvault.backend.tracker.TrackerColumn;
import com.capvault.backend.tracker.TrackerColumnRepository;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workbook.WorkbookCodec;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WorkbookImportService {
    public record Field(String key, String name, String label, String before, String after, boolean conflict) {}
    public record Change(String key, String sheet, int rowNumber, String rowKey, String label, String kind, List<Field> fields) {}
    public record Preview(UUID previewId, String filename, LocalDateTime expiresAt, int addedRows, int changedRows,
                          int unchangedRows, List<Change> changes, List<WorkbookCodec.Issue> errors, List<String> warnings) {}
    public record Result(UUID previewId, LocalDateTime appliedAt, int addedRows, int changedRows, int unchangedRows) {}
    private record Existing(UUID id, LocalDateTime updatedAt, Map<String,String> values, Object source) {}
    private static final String STUDENTS = "Students", PROJECTS = "Teams and Projects", DELIVERABLES = "Deliverables";
    private static final Map<String,List<String>> FIELDS = Map.of(
        STUDENTS, List.of("studentNumber","studentName","teamCode","memberNumber","sectionName","adviserName","institutionalEmail"),
        PROJECTS, List.of("groupCode","projectTitle","softwareName","description","proposalRemarks","demoComments","adviserName","projectStatus","category"),
        DELIVERABLES, List.of("trackerColumnKey","title","dueAt"));
    private final EntityManager em;
    private final AcademicDataService academic;
    private final StudentRecordRepository students;
    private final TrackerColumnRepository columns;
    private final WorkbookCodec codec;
    private final ObjectMapper mapper;
    public WorkbookImportService(EntityManager em, AcademicDataService academic, StudentRecordRepository students,
                                 TrackerColumnRepository columns, WorkbookCodec codec, ObjectMapper mapper) {
        this.em=em; this.academic=academic; this.students=students; this.columns=columns; this.codec=codec; this.mapper=mapper;
    }
    @Transactional(readOnly=true)
    public void requireWorkspace(UUID id) {
        AcademicWorkspace workspace=em.find(AcademicWorkspace.class,id);
        if (workspace==null) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Workspace not found.");
        if (!workspace.isActive()) throw new ResponseStatusException(HttpStatus.CONFLICT,"Archived workspaces cannot be imported.");
    }
    @Transactional
    public Preview preview(UUID workspace, String actor, String filename, byte[] bytes) {
        AcademicWorkspace target=em.find(AcademicWorkspace.class,workspace,LockModeType.PESSIMISTIC_WRITE);
        if (target==null)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Workspace not found.");
        if (!target.isActive()) throw new ResponseStatusException(HttpStatus.CONFLICT,"Archived workspaces cannot be imported.");
        if (bytes == null || bytes.length == 0 || bytes.length > 5*1024*1024) throw new IllegalArgumentException("Choose a workbook no larger than 5 MiB.");
        WorkbookCodec.Parsed parsed=codec.parse(bytes);
        UUID id=UUID.randomUUID();
        LocalDateTime now=LocalDateTime.now(), expiry=now.plusMinutes(30);
        String name=filename==null || filename.isBlank() ? "workbook.xlsx" : filename.substring(0,Math.min(filename.length(),512));
        Preview preview=build(workspace,id,name,expiry,parsed);
        em.createNativeQuery("INSERT INTO academic_workbook_imports(id,workspace_id,actor_subject,filename,file_hash,state_hash,parsed_json,preview_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
            .setParameter(1,id).setParameter(2,workspace).setParameter(3,actor).setParameter(4,name)
            .setParameter(5,hash(bytes)).setParameter(6,stateHash(workspace)).setParameter(7,json(parsed))
            .setParameter(8,json(preview)).setParameter(9,now).setParameter(10,expiry).executeUpdate();
        return preview;
    }
    @Transactional
    public Result apply(UUID workspace, String actor, UUID id, Map<String,String> resolutions) {
        if (workspace==null || id==null) throw new IllegalArgumentException("Select a workbook preview.");
        AcademicWorkspace target=em.find(AcademicWorkspace.class,workspace,LockModeType.PESSIMISTIC_WRITE);
        if (target==null)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Workspace not found.");
        if (!target.isActive()) throw new ResponseStatusException(HttpStatus.CONFLICT,"Archived workspaces cannot be imported.");
        List<?> found=em.createNativeQuery("SELECT actor_subject,state_hash,parsed_json,preview_json,expires_at,applied_at,result_json FROM academic_workbook_imports WHERE id=? AND workspace_id=? FOR UPDATE")
            .setParameter(1,id).setParameter(2,workspace).getResultList();
        if(found.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Workbook preview not found.");
        Object[] saved=(Object[])found.get(0);
        if(!actor.equals(saved[0])) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Workbook preview not found.");
        if(saved[5]!=null) return read((String)saved[6],Result.class);
        LocalDateTime expires=((java.sql.Timestamp)saved[4]).toLocalDateTime();
        if(!LocalDateTime.now().isBefore(expires)) throw new ResponseStatusException(HttpStatus.CONFLICT,"Workbook preview expired. Upload it again.");
        // Lock students in deterministic order before checking their account bindings.
        students.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspace).stream()
            .map(StudentRecord::getId).sorted().forEach(studentId -> em.find(StudentRecord.class,studentId,LockModeType.PESSIMISTIC_WRITE));
        var lockSnapshot=academic.snapshot(workspace);
        lockSnapshot.projects().stream().map(ProjectMetadataResponse::id).sorted()
            .forEach(projectId -> em.find(ProjectMetadata.class,projectId,LockModeType.PESSIMISTIC_WRITE));
        lockSnapshot.deliverables().stream().map(DeliverableResponse::id).sorted()
            .forEach(formId -> em.find(Deliverable.class,formId,LockModeType.PESSIMISTIC_WRITE));
        if(!saved[1].equals(stateHash(workspace))) throw new ResponseStatusException(HttpStatus.CONFLICT,"Academic data changed. Preview the workbook again.");
        WorkbookCodec.Parsed parsed=read((String)saved[2],WorkbookCodec.Parsed.class);
        Preview p=read((String)saved[3],Preview.class);
        if(!p.errors().isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Fix workbook errors before applying.");
        Preview rechecked=build(workspace,id,p.filename(),p.expiresAt(),parsed);
        if(!rechecked.errors().isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT,"Workbook relationships changed. Preview it again.");
        Map<String,String> decisions=resolutions==null?Map.of():resolutions;
        Set<String> conflictKeys=p.changes().stream().flatMap(c->c.fields().stream()).filter(Field::conflict).map(Field::key).collect(Collectors.toSet());
        if(!conflictKeys.containsAll(decisions.keySet()) || decisions.values().stream().anyMatch(v -> v==null || !Set.of("SOURCE","LOCAL").contains(v)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid conflict choice.");
        for(Change change:p.changes()) for(Field field:change.fields()) if(field.conflict()
            && !Set.of("SOURCE","LOCAL").contains(decisions.getOrDefault(field.key(),"")))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Choose a value for every conflict.");
        Map<String,Existing> current=existing(workspace);
        List<AcademicDataService.StudentEdit> studentEdits=new ArrayList<>();
        List<AcademicDataService.ProjectEdit> projectEdits=new ArrayList<>();
        List<AcademicDataService.DeliverableEdit> deliverableEdits=new ArrayList<>();
        int actualAdds=0, actualChanges=0;
        for(Change change:p.changes()) {
            Existing old=current.get(change.key());
            Map<String,String> values=new HashMap<>(old==null?Map.of():old.values());
            for(Field f:change.fields()) if(!f.conflict() || "SOURCE".equals(decisions.get(f.key()))) values.put(f.name(),f.after());
            if(old==null || !values.equals(old.values())) {
                if(old==null) actualAdds++; else actualChanges++;
                UUID oldId=old==null?null:old.id(); LocalDateTime updated=old==null?null:old.updatedAt();
                switch(change.sheet()) {
                    case STUDENTS -> studentEdits.add(new AcademicDataService.StudentEdit(oldId,v(values,"studentNumber"),v(values,"studentName"),v(values,"teamCode"),v(values,"memberNumber"),v(values,"sectionName"),v(values,"adviserName"),v(values,"institutionalEmail"),updated));
                    case PROJECTS -> projectEdits.add(new AcademicDataService.ProjectEdit(oldId,v(values,"groupCode"),v(values,"projectTitle"),v(values,"softwareName"),v(values,"description"),v(values,"proposalRemarks"),v(values,"demoComments"),v(values,"adviserName"),v(values,"projectStatus"),v(values,"category"),updated));
                    case DELIVERABLES -> {
                        DeliverableStatus status=old==null?DeliverableStatus.UNPUBLISHED:((DeliverableResponse)old.source()).status();
                        deliverableEdits.add(new AcademicDataService.DeliverableEdit(oldId,v(values,"trackerColumnKey"),v(values,"title"),LocalDateTime.parse(v(values,"dueAt")),status,updated));
                    }
                }
            }
        }
        for(WorkbookCodec.Row row:parsed.rows()) {
            for(var entry:row.values().entrySet()) if(FIELDS.get(row.sheet()).contains(entry.getKey()) && !blank(entry.getValue())) {
                String sourceValue=normalizeField(entry.getKey(),entry.getValue());
                int updated=em.createNativeQuery("UPDATE academic_workbook_values SET source_value=? WHERE workspace_id=? AND sheet=? AND row_key=? AND field=?")
                    .setParameter(1,sourceValue).setParameter(2,workspace).setParameter(3,row.sheet())
                    .setParameter(4,norm(row.key())).setParameter(5,entry.getKey()).executeUpdate();
                if(updated==0) em.createNativeQuery("INSERT INTO academic_workbook_values(workspace_id,sheet,row_key,field,source_value) VALUES(?,?,?,?,?)")
                    .setParameter(1,workspace).setParameter(2,row.sheet()).setParameter(3,norm(row.key()))
                    .setParameter(4,entry.getKey()).setParameter(5,sourceValue).executeUpdate();
            }
        }
        academic.saveStudents(workspace,new AcademicDataService.StudentBatch(studentEdits));
        academic.saveProjects(workspace,new AcademicDataService.ProjectBatch(projectEdits));
        int order=columns.findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(workspace).stream().mapToInt(c->c.getDisplayOrder()).max().orElse(0);
        for(var edit:deliverableEdits) if(edit.id()==null && columns.findByWorkspaceIdAndColumnKeyIgnoreCase(workspace,edit.trackerColumnKey()).isEmpty()) {
            ++order;
            columns.saveAndFlush(new TrackerColumn(workspace,edit.trackerColumnKey(),edit.title(),edit.trackerColumnKey(),order,order,true,true));
        }
        academic.saveDeliverables(workspace,new AcademicDataService.DeliverableBatch(deliverableEdits));
        Result result=new Result(id,LocalDateTime.now(),actualAdds,actualChanges,parsed.rows().size()-actualAdds-actualChanges);
        em.createNativeQuery("UPDATE academic_workbook_imports SET applied_at=?,result_json=?,resolutions_json=? WHERE id=?")
            .setParameter(1,result.appliedAt()).setParameter(2,json(result)).setParameter(3,json(decisions)).setParameter(4,id).executeUpdate();
        return result;
    }
    private Preview build(UUID workspace, UUID id, String filename, LocalDateTime expiry, WorkbookCodec.Parsed parsed) {
        Map<String,Existing> current=existing(workspace);
        Map<String,String> baseline=baseline(workspace);
        List<WorkbookCodec.Issue> errors=new ArrayList<>(parsed.errors());
        List<Change> changes=new ArrayList<>(); int added=0, updated=0, unchanged=0;
        Set<String> seen=new HashSet<>(), teams=new HashSet<>();
        current.forEach((k,x)-> {if(k.startsWith(STUDENTS+"|") && ((StudentRecordResponse)x.source()).currentActive()) teams.add(norm(x.values().get("teamCode")));});
        for(var r:parsed.rows()) if(STUDENTS.equals(r.sheet()) && !blank(r.values().get("teamCode"))) teams.add(norm(r.values().get("teamCode")));
        if(current.keySet().stream().noneMatch(k->k.startsWith(STUDENTS+"|")) && parsed.rows().stream().noneMatch(r->STUDENTS.equals(r.sheet())))
            errors.add(new WorkbookCodec.Issue(STUDENTS,0,"Students are required for initial setup."));
        for(var r:parsed.rows()) {
            if(!FIELDS.containsKey(r.sheet())) { errors.add(new WorkbookCodec.Issue(r.sheet(),r.rowNumber(),"Unsupported sheet.")); continue; }
            String key=r.sheet()+"|"+norm(r.key());
            if(blank(r.key()) || !seen.add(key)) {errors.add(new WorkbookCodec.Issue(r.sheet(),r.rowNumber(),"Missing or duplicate identity.")); continue;}
            Existing old=current.get(key);
            if(old!=null && old.source() instanceof StudentRecordResponse sr && !sr.currentActive())
                errors.add(new WorkbookCodec.Issue(r.sheet(),r.rowNumber(),"This student number belongs to an inactive record."));
            List<String> required=switch(r.sheet()) {case STUDENTS -> List.of("studentNumber","studentName","teamCode"); case PROJECTS -> List.of("groupCode"); default -> old==null?List.of("trackerColumnKey","title","dueAt"):List.of("trackerColumnKey");};
            for(String field:required) if(blank(r.values().get(field))) errors.add(new WorkbookCodec.Issue(r.sheet(),r.rowNumber(),field+" is required."));
            for(var e:r.values().entrySet()) {
                int limit=switch(e.getKey()) {case "studentNumber" -> 80; case "studentName","title","institutionalEmail","projectStatus","category" -> 240; case "teamCode","groupCode","trackerColumnKey" -> 160; case "memberNumber" -> 40; case "sectionName" -> 120; case "adviserName" -> STUDENTS.equals(r.sheet())?200:240; case "projectTitle" -> 1000; case "softwareName" -> 500; default -> Integer.MAX_VALUE;};
                if(e.getValue()!=null && e.getValue().trim().length()>limit) errors.add(new WorkbookCodec.Issue(r.sheet(),r.rowNumber(),e.getKey()+" is too long."));
            }
            if(PROJECTS.equals(r.sheet()) && !teams.contains(norm(r.values().get("groupCode")))) errors.add(new WorkbookCodec.Issue(r.sheet(),r.rowNumber(),"Team code must belong to a current or imported student."));
            if(DELIVERABLES.equals(r.sheet()) && !blank(r.values().get("dueAt"))) try {LocalDateTime.parse(r.values().get("dueAt"));} catch(Exception ex) {errors.add(new WorkbookCodec.Issue(r.sheet(),r.rowNumber(),"Due date must be a valid date and time."));}
            if(STUDENTS.equals(r.sheet()) && old!=null && !blank(r.values().get("teamCode"))
                && !norm(old.values().get("teamCode")).equals(norm(r.values().get("teamCode"))) && protectedStudent(workspace,old.id(),r.key()))
                errors.add(new WorkbookCodec.Issue(r.sheet(),r.rowNumber(),"This student has saved work or an account binding and cannot be moved to another team."));
            List<Field> fields=new ArrayList<>(); boolean changed=false;
            for(String field:FIELDS.get(r.sheet())) {
                String after=r.values().get(field); if(blank(after)) continue; after=normalizeField(field,after);
                String before=old==null?null:old.values().get(field);
                boolean differs=!Objects.equals(nvl(before),after);
                String fkey=key+"|"+field;
                String last=baseline.get(fkey);
                boolean conflict=old!=null && differs && !blank(before) && (last==null || !Objects.equals(nvl(before),last));
                if(differs) changed=true;
                if(old==null || differs) fields.add(new Field(fkey,field,label(field),before,after,conflict));
            }
            String kind=old==null?"ADD":changed?"UPDATE":"UNCHANGED";
            if(old==null) added++; else if(changed) updated++; else unchanged++;
            if(!"UNCHANGED".equals(kind)) changes.add(new Change(key,r.sheet(),r.rowNumber(),r.key(),r.key(),kind,fields));
        }
        return new Preview(id,filename,expiry,added,updated,unchanged,changes,errors,List.of());
    }
    private boolean protectedStudent(UUID workspace,UUID id,String number) {
        for(String table:List.of("form_responses","workspace_student_associations","student_identity_conflicts","canonical_response_selections"))
            if(((Number)em.createNativeQuery("SELECT COUNT(*) FROM "+table+" WHERE workspace_id=? AND student_record_id=?").setParameter(1,workspace).setParameter(2,id).getSingleResult()).longValue()>0) return true;
        return ((Number)em.createNativeQuery("SELECT COUNT(*) FROM canonical_student_account_bindings WHERE student_number_key=? AND (google_subject IS NOT NULL OR blocked_google_subject IS NOT NULL)")
            .setParameter(1,norm(number)).getSingleResult()).longValue()>0;
    }
    private Map<String,Existing> existing(UUID workspace) {
        var snap=academic.snapshot(workspace); Map<String,Existing> result=new TreeMap<>();
        for(var s:students.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspace)) {
            var x=StudentRecordResponse.from(s);
            result.put(STUDENTS+"|"+norm(x.studentNumber()),new Existing(x.id(),x.updatedAt(),map("studentNumber",x.studentNumber(),"studentName",x.studentName(),"teamCode",x.teamCode(),"memberNumber",x.memberNumber(),"sectionName",x.sectionName(),"adviserName",x.adviserName(),"institutionalEmail",x.institutionalEmail()),x));
        }
        for(var x:snap.projects()) result.put(PROJECTS+"|"+norm(x.groupCode()),new Existing(x.id(),x.updatedAt(),map("groupCode",x.groupCode(),"projectTitle",x.projectTitle(),"softwareName",x.softwareName(),"description",x.description(),"proposalRemarks",x.proposalRemarks(),"demoComments",x.demoComments(),"adviserName",x.adviserName(),"projectStatus",x.projectStatus(),"category",x.category()),x));
        for(var x:snap.deliverables()) result.put(DELIVERABLES+"|"+norm(x.trackerColumnKey()),new Existing(x.id(),x.updatedAt(),map("trackerColumnKey",x.trackerColumnKey(),"title",x.title(),"dueAt",x.dueAt()==null?null:x.dueAt().toString()),x));
        return result;
    }
    private Map<String,String> baseline(UUID workspace) {
        Map<String,String> values=new TreeMap<>();
        for(Object o:em.createNativeQuery("SELECT sheet,row_key,field,source_value FROM academic_workbook_values WHERE workspace_id=?").setParameter(1,workspace).getResultList()) {
            Object[] a=(Object[])o; values.put(a[0]+"|"+a[1]+"|"+a[2],(String)a[3]);
        } return values;
    }
    private String stateHash(UUID workspace) {return hash(json(List.of(existing(workspace),baseline(workspace),academic.snapshot(workspace))).getBytes(StandardCharsets.UTF_8));}
    private static Map<String,String> map(String... pairs) {Map<String,String> m=new TreeMap<>(); for(int i=0;i<pairs.length;i+=2) m.put(pairs[i],pairs[i+1]); return m;}
    private static String norm(String s) {return s==null?"":s.trim().toLowerCase(Locale.ROOT);}
    private static String label(String field) {
        return switch(field) {
            case "studentNumber" -> "Student Number"; case "studentName" -> "Student Name"; case "teamCode", "groupCode" -> "Team Code";
            case "memberNumber" -> "Member #"; case "sectionName" -> "Section"; case "adviserName" -> "Adviser";
            case "institutionalEmail" -> "Institutional Email"; case "projectTitle" -> "Project Title"; case "softwareName" -> "Software Name";
            case "proposalRemarks" -> "Proposal Remarks"; case "demoComments" -> "Demo Comments"; case "projectStatus" -> "Status";
            case "trackerColumnKey" -> "Column Key"; case "dueAt" -> "Deadline"; case "title" -> "Title"; case "category" -> "Category";
            case "description" -> "Description"; default -> field;
        };
    }
    private static String normalizeField(String field,String value) {
        String trimmed=value.trim();
        if("dueAt".equals(field)) try { return LocalDateTime.parse(trimmed).toString(); } catch(Exception ignored) { }
        return trimmed;
    }
    private static boolean blank(String s) {return s==null || s.isBlank();}
    private static String nvl(String s) {return s==null?"":s;}
    private static String v(Map<String,String> m,String k) {return m.get(k);}
    private String json(Object value) {try{return mapper.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException(e);}}
    private <T>T read(String value,Class<T> type) {try{return mapper.readValue(value,type);}catch(Exception e){throw new IllegalStateException(e);}}
    private static String hash(byte[] value) {try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));}catch(Exception e){throw new IllegalStateException(e);}}
}
