CREATE TABLE drive_history_oauth_grants (
    google_subject VARCHAR(255) PRIMARY KEY,
    encrypted_refresh_token VARCHAR(2048),
    granted_scopes VARCHAR(2048) NOT NULL,
    connected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE drive_history_oauth_states (
    state_hash VARCHAR(64) PRIMARY KEY,
    nonce_hash VARCHAR(64) NOT NULL,
    session_hash VARCHAR(64) NOT NULL,
    google_subject VARCHAR(255) NOT NULL,
    return_path VARCHAR(500) NOT NULL,
    code_verifier VARCHAR(128) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_drive_history_oauth_states_expiry
    ON drive_history_oauth_states(expires_at);
