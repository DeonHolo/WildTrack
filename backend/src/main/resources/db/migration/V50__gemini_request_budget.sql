CREATE TABLE gemini_quota_state (
    scope VARCHAR(200) PRIMARY KEY,
    blocked_until TIMESTAMP WITH TIME ZONE,
    blocked_reason VARCHAR(60)
);
CREATE TABLE gemini_request_usage (
    id UUID PRIMARY KEY,
    scope VARCHAR(200) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    estimated_tokens INTEGER NOT NULL,
    actual_tokens INTEGER,
    http_status INTEGER
);
CREATE INDEX gemini_request_usage_window ON gemini_request_usage(scope, started_at);
CREATE TABLE gemini_token_counts (
    fingerprint VARCHAR(64) PRIMARY KEY,
    input_tokens INTEGER NOT NULL,
    counted_at TIMESTAMP WITH TIME ZONE NOT NULL
);
