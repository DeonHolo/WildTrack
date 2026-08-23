package com.capvault.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class CapVaultBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(CapVaultBackendApplication.class, args);
    }
}
