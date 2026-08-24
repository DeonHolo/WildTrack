package com.capvault.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;

class HerokuBuildpackContractTest {

    @Test
    void repositoryRootDeclaresTheJavaBuildpackContract() throws IOException {
        Path root = repositoryRoot();

        assertThat(Files.readString(root.resolve("pom.xml")))
            .contains("<packaging>pom</packaging>")
            .contains("<module>backend</module>");

        assertThat(Files.readString(root.resolve("Procfile")).trim())
            .isEqualTo(
                "web: java -Dserver.port=$PORT -jar "
                    + "backend/target/backend-0.1.0-SNAPSHOT.jar "
                    + "--spring.profiles.active=production"
            );

        assertThat(Files.readString(root.resolve("system.properties")))
            .contains("java.runtime.version=21")
            .contains("maven.version=3.9.11");

        assertThat(Files.readString(root.resolve(".slugignore")))
            .contains("frontend/")
            .contains("backend/data/")
            .contains("backend/storage/");

        assertThat(root.resolve("heroku.yml")).doesNotExist();
    }

    private Path repositoryRoot() {
        Path current = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (current != null && !Files.exists(current.resolve(".git"))) {
            current = current.getParent();
        }
        assertThat(current).as("repository root").isNotNull();
        return current;
    }
}
