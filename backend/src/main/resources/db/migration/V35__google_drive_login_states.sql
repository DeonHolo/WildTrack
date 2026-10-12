-- LOGIN has no pre-existing app identity. Keep its state separate from session-bound CONNECT.
CREATE TABLE drive_history_login_states (
    state_hash VARCHAR(64) PRIMARY KEY,
    nonce_hash VARCHAR(64) NOT NULL,
    return_path VARCHAR(500) NOT NULL,
    code_verifier VARCHAR(128) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_drive_history_login_states_expiry
    ON drive_history_login_states(expires_at);
