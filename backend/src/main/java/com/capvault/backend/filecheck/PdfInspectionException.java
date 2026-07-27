package com.capvault.backend.filecheck;

public class PdfInspectionException extends RuntimeException {

    private final String flag;

    public PdfInspectionException(String flag, String message) {
        super(message);
        this.flag = flag;
    }

    public String getFlag() {
        return flag;
    }
}
