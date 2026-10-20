package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

class AiReviewGlossaryPolicyTest {
    @Test void acceptsColonAndWrappedGlossaryDefinitions() {
        String definitions = """
            Definitions, Acronyms and Abbreviations
            MVP: Minimum Viable Product
            RDBMS
            Relational Database Management System
            """;
        assertThat(AiReviewGlossaryPolicy.acronymDefined("MVP", definitions, "")).isTrue();
        assertThat(AiReviewGlossaryPolicy.acronymDefined("RDBMS", definitions, "")).isTrue();
        assertThat(AiReviewGlossaryPolicy.acronymDefined("PKCE", "PKCE Proof Key for Code Exchange — security extension preventing code interception", "")).isTrue();
        assertThat(AiReviewGlossaryPolicy.acronymDefined("SSO", "SSO Single Sign-On — authentication mechanism allowing access to multiple systems", "")).isTrue();
        assertThat(AiReviewGlossaryPolicy.acronymDefined("JWT", "JWT JSON Web Token, used for authenticated user sessions", "")).isTrue();
        assertThat(AiReviewGlossaryPolicy.acronymDefined("SMART",
            "SMART Specific, Measurable, Achievable, Relevant, Time-bound", "")).isTrue();
        assertThat(AiReviewGlossaryPolicy.acronymDefined("SMART",
            "SMART Some, unrelated, prose, remains, here", "")).isFalse();
        assertThat(AiReviewGlossaryPolicy.acronymDefined("UCD", "",
            "User Management\nUse Case Diagram : UCD 1.1")).isTrue();
    }

    @Test void acceptsGroupedSlashRowsAndExpansionBeforeParentheses() {
        String definitions = "PKCE / SSO / RDBMS: security and database terms\n";
        assertThat(AiReviewGlossaryPolicy.acronymDefined("SSO", definitions, "")).isTrue();
        assertThat(AiReviewGlossaryPolicy.acronymDefined("JWT", "JWT JSON Web Token\n", "")).isTrue();
        assertThat(AiReviewGlossaryPolicy.acronymDefined("CSRF",
            "CSRF / GQM\nCross-Site Request Forgery / Goal Question Metric\n", "")).isTrue();
        assertThat(AiReviewGlossaryPolicy.acronymDefined("RPO", "", "Recovery Point Objective (RPO)"))
            .isTrue();
    }

    @Test void rejectsBareTermsAndDistantDefinitions() {
        String definitions = """
            MVP
            This section discusses other material.
            The project uses MVP during testing.
            """;
        assertThat(AiReviewGlossaryPolicy.acronymDefined("MVP", definitions, "")).isFalse();
        assertThat(AiReviewGlossaryPolicy.acronymDefined("MVP", "MVP: MVP", "")).isFalse();
        assertThat(AiReviewGlossaryPolicy.acronymDefined("MVP", "MVP is used during the pilot", "")).isFalse();
        assertThat(AiReviewGlossaryPolicy.acronymDefined("MVP", "MVP definition not provided", "")).isFalse();
        assertThat(AiReviewGlossaryPolicy.acronymDefined("MVP", "MVP: definition not provided", "")).isFalse();
    }

    @Test void aPresentExpansionDoesNotRefuteAnIncorrectExpansionFinding() {
        assertThat(AiReviewGlossaryPolicy.contradictedConcern(
            "The acronym MVP is incorrectly expanded as Most Valuable Player.",
            "MVP: Most Valuable Player", "MVP: Most Valuable Player", "")).isFalse();
        assertThat(AiReviewGlossaryPolicy.contradictedConcern(
            "The acronym MVP is not defined in the glossary.",
            "The MVP is evaluated after the pilot.", "MVP Minimum Viable Product", "")).isTrue();
    }

    @Test void acceptsWrappedGroupHeadersAndMixedCaseTokensInTableRows() {
        String definitions = "GQM / SRS / SDD /\nSPMP / STD / RTM\n"
            + "Goal-Question-Metric / requirements / design / project management / test documentation\n"
            + "SHA-256 / CSRF / MiB Cryptographic identity / protection for cookie-authenticated writes / bytes";
        assertThat(AiReviewGlossaryPolicy.acronymDefined("GQM", definitions, "")).isTrue();
        assertThat(AiReviewGlossaryPolicy.acronymDefined("CSRF", definitions, "")).isTrue();
        assertThat(use("MINIMAL", "Current default is MINIMAL with an 8,192-token cap.")).isFalse();
        assertThat(use("NET", "The service uses ASP.NET Core for its backend.")).isFalse();
        assertThat(use("FIRST", "The task uses priority tags like \"DO FIRST\".")).isFalse();
        assertThat(use("GET", "The browser sends GET /api/forms for the active workspace.")).isFalse();
        assertThat(use("PASS", "7 PASS locally on 18 Oct; see QA evidence.")).isFalse();
        assertThat(use("PASS", "eTest: 7 PASS. Revised")).isFalse();
    }

    @Test void preservesRealMissingAcronymCandidates() {
        assertThat(use("MVP", "The MVP is evaluated after the pilot.")).isTrue();
        assertThat(use("LTS", "The LTS release is supported.")).isTrue();
        assertThat(use("REST", "The REST endpoint is documented.")).isTrue();
        assertThat(use("DOCX", "The DOCX export is available.")).isTrue();
    }

    @Test void rejectsDatesVersionsSettingsAndNamedTechnologyLabels() {
        assertThat(use("MAY", "Publication date: MAY 2024.")).isFalse();
        assertThat(use("MMMM", "Date format: DD/MMMM/YYYY.")).isFalse();
        assertThat(use("V39", "Migration V39 is applied.")).isFalse();
        assertThat(use("MINIMAL", "The thinking setting is MINIMAL.")).isFalse();
        assertThat(use("ASP", "The service uses ASP.NET Core.")).isFalse();
        assertThat(use("PHP", "Programming language: PHP.")).isFalse();
    }

    private static boolean use(String token, String line) {
        Matcher matcher = Pattern.compile("\\b" + Pattern.quote(token) + "\\b").matcher(line);
        return matcher.find() && AiReviewGlossaryPolicy.terminologyUse(token, line, matcher.start(), matcher.end());
    }
}
