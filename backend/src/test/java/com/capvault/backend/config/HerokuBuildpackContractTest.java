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
                "web: MALLOC_ARENA_MAX=${MALLOC_ARENA_MAX:-2} java "
                    + "${WILDTRACK_JAVA_MEMORY_OPTS:--Xms64m -Xmx256m -Xss512k -XX:ReservedCodeCacheSize=64m} "
                    + "-Dserver.port=$PORT -jar "
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
        while (current != null && (!Files.isRegularFile(current.resolve("pom.xml"))
                || !Files.isRegularFile(current.resolve("backend/pom.xml")))) {
            current = current.getParent();
        }
        assertThat(current).as("repository root").isNotNull();
        return current;
    }
}
