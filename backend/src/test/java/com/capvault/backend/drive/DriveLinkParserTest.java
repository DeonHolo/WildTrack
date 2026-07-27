package com.capvault.backend.drive;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class DriveLinkParserTest {

    @Test
    void parsesStandardDriveFileLinkAndResourceKey() {
        DriveFileReference reference = DriveLinkParser.parse(
            "https://drive.google.com/file/d/1AbC_def-234/view?usp=sharing&resourcekey=0-secret"
        );

        assertThat(reference.fileId()).isEqualTo("1AbC_def-234");
        assertThat(reference.resourceKey()).isEqualTo("0-secret");
    }

    @Test
    void parsesDriveOpenLink() {
        DriveFileReference reference = DriveLinkParser.parse(
            "https://drive.google.com/open?id=1AbC_def-234"
        );

        assertThat(reference.fileId()).isEqualTo("1AbC_def-234");
        assertThat(reference.resourceKey()).isNull();
    }

    @Test
    void rejectsNonDriveAndFolderLinks() {
        assertThatThrownBy(() -> DriveLinkParser.parse("https://example.com/file.pdf"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Use a Google Drive file link.");

        assertThatThrownBy(() -> DriveLinkParser.parse("https://drive.google.com/drive/folders/folder-id"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("file ID");
    }
}
