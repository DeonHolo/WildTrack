CREATE TABLE deliverable_share_links (
    deliverable_id UUID PRIMARY KEY REFERENCES academic_deliverables(id),
    token VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
