package com.capvault.backend.archive;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.Map;
import java.util.Objects;

import com.capvault.backend.archive.ArchiveFileStore.File;
import com.capvault.backend.archive.storage.ArchiveStorageRegistry;
import com.capvault.backend.drive.DriveFileMetadata;
import com.capvault.backend.drive.DriveFileReference;
import com.capvault.backend.drive.GoogleDriveGateway;
import com.capvault.backend.response.DomainEventRecorder;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.response.ResponseAcceptanceRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class ArchiveCaptureWorker {
    private final ArchiveFileStore files;
    private final ArchiveRecordRepository archives;
    private final ArchiveStorageRegistry storage;
    private final GoogleDriveGateway drive;
    private final FormResponseRepository responses;
    private final ResponseAcceptanceRepository acceptances;
    private final DomainEventRecorder events;
    private final TransactionTemplate tx;
    private final boolean enabled;
    public ArchiveCaptureWorker(ArchiveFileStore files, ArchiveRecordRepository archives,
        ArchiveStorageRegistry storage, GoogleDriveGateway drive, FormResponseRepository responses,
        ResponseAcceptanceRepository acceptances, DomainEventRecorder events,
        PlatformTransactionManager manager, @Value("${wildtrack.archive.worker-enabled:true}") boolean enabled) {
        this.files=files;this.archives=archives;this.storage=storage;this.drive=drive;
        this.responses=responses;this.acceptances=acceptances;this.events=events;
        this.tx=new TransactionTemplate(manager);this.enabled=enabled;
    }

    @Scheduled(fixedDelayString="${wildtrack.archive.worker-delay-ms:5000}", scheduler="archiveTaskScheduler")
    public void tick() { if (enabled) runOne(); }

    public boolean runOne() {
        File claimed=tx.execute(status -> files.claim());
        if (claimed==null) return false;
        tx.executeWithoutResult(status -> archives.findByIdForUpdate(claimed.archiveId()).ifPresent(record -> {
            record.setCaptureState("COPYING",null);archives.saveAndFlush(record);
        }));
        try {
            copy(claimed);
            finish(claimed,null);
        } catch (CaptureFailure failure) {
            finish(claimed,failure.getMessage());
        } catch (RuntimeException failure) {
            // Provider exceptions are untrusted; never expose credentials, URLs or response bodies.
            finish(claimed,"The archive copy could not be completed. Check storage and PDF access, then retry. No source files were changed.");
        }
        return true;
    }

    private void copy(File claimed) {
        var provider=storage.provider(claimed.providerId());
        if (claimed.objectId()==null) {
            String reserved=provider.reserve(claimed.captureKey());
            if (!Boolean.TRUE.equals(tx.execute(status -> files.reserve(claimed,reserved)))) throw new CaptureFailure("The archive was claimed by another worker. Check its current progress.");
        }
        File job=files.get(claimed.id());
        if (!Objects.equals(job.leaseToken(),claimed.leaseToken())) throw new CaptureFailure("The archive was claimed by another worker. Check its current progress.");
        // A previous process may have uploaded successfully before its database commit failed.
        if (job.sha256()!=null) {
            try {
                requireHash(provider.read(job.objectId()),job.sha256(),job.size());
                return;
            } catch (RuntimeException unavailable) {
                // The same reserved ID is reused below; an existing object is never overwritten.
            }
        }
        var reference=new DriveFileReference(job.sourceFileId(),job.resourceKey());
        var before=drive.getMetadata(reference);
        requireVersion(job,before);
        byte[] bytes=drive.download(reference);
        if (bytes==null || bytes.length!=job.size() || !job.md5().equalsIgnoreCase(hash("MD5",bytes))) {
            throw new CaptureFailure("The PDF changed after acceptance. Run Document Check and review the current file before accepting and archiving it again.");
        }
        if (bytes.length<5 || !new String(bytes,0,5,StandardCharsets.US_ASCII).equals("%PDF-")) throw new CaptureFailure("The accepted file could not be verified as a PDF.");
        requireVersion(job,drive.getMetadata(reference));
        String sha=hash("SHA-256",bytes);
        if (job.sha256()!=null && !job.sha256().equals(sha)) throw new CaptureFailure("The source no longer matches the PDF reserved for this archive.");
        if (!Boolean.TRUE.equals(tx.execute(status -> files.identify(claimed,sha,filename(before.name()))))) throw new CaptureFailure("The archive was claimed by another worker. Check its current progress.");
        var stored=provider.put(job.objectId(),job.captureKey(),bytes);
        if (!job.providerId().equals(stored.providerId()) || !job.objectId().equals(stored.objectId())
            || !sha.equals(stored.sha256()) || job.size()!=stored.size()) throw new CaptureFailure("The preserved file did not pass integrity verification. The source was not changed.");
    }

    private void finish(File job,String error) {
        tx.executeWithoutResult(status -> {
            var record=archives.findByIdForUpdate(job.archiveId()).orElseThrow();
            if (!files.finish(job,error)) return;
            var captured=files.files(record.getId());
            boolean complete=!captured.isEmpty() && captured.stream().allMatch(File::stored);
            String failure=captured.stream().filter(file -> "FAILED".equals(file.status())).map(File::error).findFirst().orElse(null);
            record.setCaptureState(complete?"COMPLETE":failure!=null?"FAILED":"COPYING",failure);
            if (complete) {
                var response=responses.findById(record.getResponseId()).orElse(null);
                var acceptance=acceptances.findByResponseIdAndRevokedAtIsNull(record.getResponseId()).orElse(null);
                if (response==null || acceptance==null || !record.getSourceResponseUpdatedAt().equals(response.getUpdatedAt())
                    || !Objects.equals(record.getActiveAcceptanceAt(),acceptance.getAcceptedAt())) record.deactivate();
            }
            archives.saveAndFlush(record);
            if (complete || error!=null) events.record(record.getWorkspaceId(),record.getId(),"archive-worker",
                complete?"ARCHIVE_COMPLETED":"ARCHIVE_COPY_FAILED",Map.of("fileId",job.id()));
        });
    }

    private static void requireVersion(File file,DriveFileMetadata metadata) {
        if (metadata==null || !metadata.canDownload() || !"application/pdf".equalsIgnoreCase(metadata.mimeType())
            || !file.sourceFileId().equals(metadata.id()) || metadata.size()==null || metadata.size()!=file.size()
            || metadata.md5Checksum()==null || !file.md5().equalsIgnoreCase(metadata.md5Checksum())
            || metadata.modifiedTime()==null || !OffsetDateTime.parse(file.modifiedTime()).toInstant().equals(metadata.modifiedTime().toInstant())) {
            throw new CaptureFailure("The PDF no longer matches the version recorded at acceptance. Run Document Check and review the current PDF before accepting and archiving it again.");
        }
    }
    static void requireHash(byte[] bytes,String expected,long size) {
        if (bytes==null || bytes.length!=size || expected==null || !expected.equals(hash("SHA-256",bytes))) throw new CaptureFailure("The preserved PDF did not pass integrity verification.");
    }
    static String hash(String algorithm,byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance(algorithm).digest(bytes)); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private static String filename(String name) {
        if (name==null || name.isBlank()) return "Archived.pdf";
        String safe=name.replaceAll("[\\\\/\\p{Cntrl}]","_");
        return safe.substring(0,Math.min(safe.length(),900));
    }
    private static final class CaptureFailure extends RuntimeException {
        CaptureFailure(String message) { super(message); }
    }
    @Configuration
    static class Scheduling {
        @Bean(name="archiveTaskScheduler")
        ThreadPoolTaskScheduler scheduler() {
            var scheduler=new ThreadPoolTaskScheduler();
            scheduler.setPoolSize(1);scheduler.setThreadNamePrefix("archive-capture-");
            scheduler.setWaitForTasksToCompleteOnShutdown(false);return scheduler;
        }
    }
}
