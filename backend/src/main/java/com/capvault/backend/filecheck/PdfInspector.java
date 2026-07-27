package com.capvault.backend.filecheck;

import java.io.IOException;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;

@Component
public class PdfInspector {

    public PdfInspection inspect(byte[] bytes) {
        if (bytes == null || bytes.length < 5
            || bytes[0] != '%'
            || bytes[1] != 'P'
            || bytes[2] != 'D'
            || bytes[3] != 'F'
            || bytes[4] != '-') {
            return new PdfInspection(false, false, 0, 0, "", "The downloaded file is not valid PDF data.");
        }

        try (PDDocument document = Loader.loadPDF(bytes)) {
            if (document.isEncrypted()) {
                return new PdfInspection(
                    false,
                    true,
                    document.getNumberOfPages(),
                    0,
                    "",
                    "The PDF is password-protected."
                );
            }
            String text = normalize(new PDFTextStripper().getText(document));
            return new PdfInspection(
                true,
                false,
                document.getNumberOfPages(),
                text.length(),
                text,
                ""
            );
        } catch (InvalidPasswordException exception) {
            return new PdfInspection(false, true, 0, 0, "", "The PDF is password-protected.");
        } catch (IOException | RuntimeException exception) {
            return new PdfInspection(false, false, 0, 0, "", "The PDF is corrupt or unreadable.");
        }
    }

    private static String normalize(String value) {
        return value == null ? "" : value
            .replace('\u00A0', ' ')
            .replaceAll("[\\t\\x0B\\f\\r ]+", " ")
            .replaceAll("\\n{3,}", "\n\n")
            .trim();
    }
}
