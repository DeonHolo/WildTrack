package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class AiReviewExecutionConsistencyPolicyTest {
    @Test void executionIdentityRetainsOnlyOneUnambiguousCanonicalCase() {
        assertThat(AiReviewExecutionConsistencyPolicy.executionIdentity("Test case TC-05 is marked PASS")).isEqualTo("tc-05");
        assertThat(AiReviewExecutionConsistencyPolicy.executionIdentity("TC-05 and tc-05 refer to the same case")).isEqualTo("tc-05");
        assertThat(AiReviewExecutionConsistencyPolicy.executionIdentity("Case X4 has a recorded outcome")).isEqualTo("x4");
        assertThat(AiReviewExecutionConsistencyPolicy.executionIdentity("Test ID: E2E-32")).isEqualTo("e2e-32");
        assertThat(AiReviewExecutionConsistencyPolicy.executionIdentity("TC-05 is compared with TC-06")).isNull();
        assertThat(AiReviewExecutionConsistencyPolicy.executionIdentity("Expected HTTP 200; actual HTTP 403; PASS")).isNull();
        assertThat(AiReviewExecutionConsistencyPolicy.executionIdentity(null)).isNull();
    }

    @ParameterizedTest
    @MethodSource("contradictoryExecutions")
    void recordsOnlySourceObservableContradictions(String text, String id) {
        var findings = AiReviewExecutionConsistencyPolicy.findings(text);
        assertThat(findings).hasSize(1);
        var finding = findings.get(0);
        assertThat(finding.source()).isEqualTo(AiReviewProvider.FindingSource.DOCUMENT);
        assertThat(finding.requirement()).isEmpty();
        assertThat(finding.issue()).contains(id, "marked PASS");
        assertThat(finding.evidence()).isNotBlank().hasSizeLessThanOrEqualTo(2_000);
        assertThat(text).contains(finding.evidence());
    }

    static Stream<Arguments> contradictoryExecutions() {
        return Stream.of(
            Arguments.of("TC-82 performs a coordinator lookup. Expected outcome: HTTP 201 and a new record. "
                + "Actual outcome: HTTP 409 and no record. Result: PASS.", "TC-82"),
            Arguments.of("Test case K7\nExpected response: HTTP 204\nActual response: HTTP 500\nVerdict: PASSED", "Test case K7"),
            Arguments.of("API-A71 Search documents\nExpected outcome:\nHTTP 200 and the matching entry.\n"
                + "Actual outcome:\nHTTP 404 and no entry returned.\nResult:\nPASS", "API-A71"),
            Arguments.of("tc-999\nExpected HTTP status: 202 Accepted\nActual HTTP status: 503 Unavailable\nStatus: PASS", "tc-999"),
            Arguments.of("Case X4\nExpected result: The record is saved successfully.\n"
                + "Actual result: The operation failed before saving.\nResult: PASS", "Case X4"),
            Arguments.of("Case X5\nExpected response: HTTP 200\nActual response: Request failed before completion.\nVerdict: PASS", "Case X5"),
            Arguments.of("Test ID | Expected outcome | Actual outcome | Result\n"
                + "API-44 | HTTP 200 | HTTP 502 | PASS", "API-44"),
            Arguments.of("Case\tExpected HTTP status\tActual HTTP status\tVerdict\n"
                + "E2E-32\t201 Created\t403 Forbidden\tPASS", "E2E-32"),
            Arguments.of("| Case | Expected result | Actual result | Status |\n"
                + "| --- | --- | --- | --- |\n| REG-7 | HTTP 204 | HTTP 500 | PASS |", "REG-7")
        );
    }

    @ParameterizedTest
    @MethodSource("nonContradictions")
    void abstainsWhenRecordIsValidOrCannotBeSafelyCompared(String text) {
        assertThat(AiReviewExecutionConsistencyPolicy.findings(text)).isEmpty();
    }

    static Stream<String> nonContradictions() {
        return Stream.of(
            "TC-1 Expected outcome: HTTP 403 and unchanged data. Actual outcome: HTTP 403 and unchanged data. Result: PASS",
            "TC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 403. Result: FAIL",
            "TC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 403. Result: NOT RUN",
            "TC-1 Expected outcome: HTTP 200 or HTTP 204. Actual outcome: HTTP 204. Result: PASS",
            "TC-1 Expected outcome: HTTP 200/201. Actual outcome: HTTP 201. Result: PASS",
            "TC-1 Expected outcome: HTTP 200 when cached, otherwise HTTP 304. Actual outcome: HTTP 304. Result: PASS",
            "TC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 403 or HTTP 200 depending on role. Result: PASS",
            "TC-1 Expected outcome: Login page visible. Actual outcome: Login screen displayed. Result: PASS",
            "TC-1 Expected outcome: The request is rejected. Actual outcome: Request failed validation. Result: PASS",
            "TC-1 Expected outcome: HTTP 403. Actual outcome: Request failed with HTTP 403. Result: PASS",
            "TC-1 Expected outcome: The operation is not allowed. Actual outcome: The operation failed. Result: PASS",
            "TC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 200 after HTTP 503 recovery. Result: PASS",
            "Example only\nTC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 403. Result: PASS",
            "TC-1 is a hypothetical demonstration. Expected outcome: HTTP 200. Actual outcome: HTTP 403. Result: PASS",
            "TC-1 Expected outcome: HTTP 200.\nTC-2 Actual outcome: HTTP 403. Result: PASS",
            "TC-1 Expected outcome: HTTP 200.\nRetest on a new build\nActual outcome: HTTP 403. Result: PASS",
            "TC-1 Expected outcome: HTTP 200.\nBuild: revision-2\nActual outcome: HTTP 403. Result: PASS",
            "TC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 403. Result: PASS/FAIL",
            "TC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 403. Result: PASS?",
            "TC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 403. Result: PASS if verified later",
            "TC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 403. Result: PASS only when the fix is applied",
            "TC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 403. Result: provisional PASS",
            "TC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 403. Result: PASS\nif the cache was warm",
            "TC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 403. Result: PASS (conditional)",
            "TC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 403. Result: PASS . if later verified",
            "TC-1 Expected outcome: Not HTTP 200. Actual outcome: HTTP 403. Result: PASS",
            "TC-1 Expected outcome: HTTP 200. Actual outcome: No HTTP 403 was returned. Result: PASS",
            "TC-7 Expected outcome: HTTP 200. Actual outcome: HTTP 403 was not returned; request succeeded. Result: PASS",
            "TC-7 Expected outcome: HTTP 200. Actual outcome: HTTP 403 did not occur; request succeeded. Result: PASS",
            "TC-7 Expected outcome: HTTP 200. Actual outcome: HTTP 403 didn't occur; request succeeded. Result: PASS",
            "TC-7 Expected outcome: HTTP 200. Actual outcome: HTTP 403 has not been returned; request succeeded. Result: PASS",
            "TC-7 Expected outcome: HTTP 200. Actual outcome: The request didn't return HTTP 403. Result: PASS",
            "TC-7 Expected HTTP status: 200 not expected. Actual HTTP status: 403. Result: PASS",
            "Example only\n\nTC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 403. Result: PASS",
            "3. Illustrative test examples\nTC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 403. Result: PASS\n"
                + "TC-2 Expected outcome: HTTP 200. Actual outcome: HTTP 500. Result: PASS",
            "TC-1 Expected outcome: HTTP 200.\nRun A\nActual outcome: HTTP 403. Result: PASS",
            "TC-1 Expected outcome: HTTP 200.\nEnvironment production\nActual outcome: HTTP 403. Result: PASS",
            "TC-1 Expected outcome: HTTP 200 in staging. Actual outcome: HTTP 403 in production. Result: PASS",
            "Expected outcome: HTTP 200. Actual outcome: HTTP 403. Result: PASS",
            "Test ID | Expected | Actual | Result\nTC-1 | HTTP 403 | HTTP 403 | PASS",
            "Test ID | Expected | Expected | Actual | Result\nTC-1 | HTTP 200 | HTTP 201 | HTTP 403 | PASS",
            "Test ID | Expected | Actual | Result\nTC-1 | HTTP 200 | HTTP 403 | FAIL",
            "Example table\nTest ID | Expected | Actual | Result\nTC-1 | HTTP 200 | HTTP 403 | PASS",
            "Test ID Expected Actual Result\nTC-1 HTTP 200 HTTP 403 PASS",
            "Table of Contents\n1. Execution results ... 3\nTC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 403. Result: PASS"
        );
    }

    @Test void separatelyBoundedCasesAndRetestsCannotSupplyEachOthersFields() {
        String text = "TC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 200. Result: PASS.\n"
            + "TC-1 Expected outcome: HTTP 403. Actual outcome: HTTP 403. Result: PASS.\n"
            + "TC-2 Expected outcome: HTTP 202. Actual outcome: HTTP 400. Result: PASS.";
        var findings = AiReviewExecutionConsistencyPolicy.findings(text);
        assertThat(findings).hasSize(1);
        assertThat(findings.get(0).issue()).contains("TC-2", "202", "400");
    }

    @Test void tableRowsKeepTheirOwnExpectedActualAssociation() {
        String text = "Case | Expected response | Actual response | Verdict\n"
            + "TC-1 | HTTP 403 | HTTP 403 | PASS\n"
            + "TC-2 | HTTP 200 | HTTP 403 | FAIL\n"
            + "TC-3 | HTTP 201 | HTTP 500 | PASS\n";
        var findings = AiReviewExecutionConsistencyPolicy.findings(text);
        assertThat(findings).hasSize(1);
        assertThat(findings.get(0).issue()).contains("TC-3", "201", "500");
        assertThat(text).contains(findings.get(0).evidence());
    }

    @Test void explicitExecutedResultsEndAnIllustrativeSection() {
        String text = "Examples only\nTC-1 Expected outcome: HTTP 200. Actual outcome: HTTP 403. Result: PASS.\n"
            + "5. Executed test results\n"
            + "TC-2 Expected outcome: HTTP 201. Actual outcome: HTTP 500. Result: PASS.";
        var findings = AiReviewExecutionConsistencyPolicy.findings(text);
        assertThat(findings).hasSize(1);
        assertThat(findings.get(0).issue()).contains("TC-2");
    }

    @Test void unrelatedExitAndRetestPolicyAfterTheVerdictCannotEraseTheExecution() {
        String record = "TC-19 Expected outcome: HTTP 201. Actual outcome: HTTP 409. Result: PASS";
        String text = "1. Execution results\n" + record + ".\n"
            + "2. Exit reporting\nRetest every failed case after a correction.\n"
            + "Expected outcome: a resolved incident. Actual outcome: retain the incident record.\n"
            + "The test manager preserves previous builds and the historical record. ".repeat(40);
        var findings = AiReviewExecutionConsistencyPolicy.findings(text);
        assertThat(findings).hasSize(1);
        assertThat(findings.get(0).evidence()).isEqualTo(record);
    }

    @Test void capsFindingsAndNeverTruncatesAmbiguousLargeRecords() {
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < 20; i++) text.append("TC-").append(i)
            .append(" Expected response: HTTP 200. Actual response: HTTP 403. Result: PASS.\n");
        assertThat(AiReviewExecutionConsistencyPolicy.findings(text.toString())).hasSize(8);
        assertThat(AiReviewExecutionConsistencyPolicy.findings("TC-3 " + "extra context ".repeat(200)
            + "Expected response: HTTP 200. Actual response: HTTP 403. Result: PASS.")).isEmpty();
    }
}
