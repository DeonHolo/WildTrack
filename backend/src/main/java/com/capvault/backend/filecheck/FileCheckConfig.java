package com.capvault.backend.filecheck;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(FileCheckProperties.class)
public class FileCheckConfig {
}
