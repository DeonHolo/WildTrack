ALTER TABLE deliverable_share_links ADD COLUMN short_token VARCHAR(12);
CREATE UNIQUE INDEX uk_deliverable_share_links_short_token ON deliverable_share_links(short_token);
