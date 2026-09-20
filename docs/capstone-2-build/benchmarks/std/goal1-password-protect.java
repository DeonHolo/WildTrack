import java.nio.file.Files;
import java.nio.file.Path;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;

/** Invoked only by the NEW Goal-1 generator; no original/private PDF is an input. */
class Goal1PasswordProtect {
    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("Expected fresh synthetic input/output PDF paths");
        Path input = Path.of(args[0]);
        Path output = Path.of(args[1]);
        if (Files.exists(output)) throw new IllegalArgumentException("Refusing to overwrite " + output);
        try (PDDocument doc = Loader.loadPDF(input.toFile())) {
            // Fixed FICTIONAL fixture passwords: these are not live application secrets.
            StandardProtectionPolicy policy = new StandardProtectionPolicy(
                "goal1-synthetic-owner-only", "goal1-synthetic-open", new AccessPermission());
            policy.setEncryptionKeyLength(128);
            policy.setPermissions(new AccessPermission());
            doc.protect(policy);
            doc.save(output.toFile());
        }
        System.out.println("Created one controlled encrypted synthetic PDF; no original reference file accessed.");
    }
}
