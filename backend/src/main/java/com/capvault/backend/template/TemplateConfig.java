package com.capvault.backend.template;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(TemplateStorageProperties.class)
public class TemplateConfig {
}
