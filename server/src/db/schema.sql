-- Production schema for the reply pipeline. Apply with `psql -f schema.sql`.
-- Requires Postgres 15+ and the pgvector extension.

CREATE EXTENSION IF NOT EXISTS pgvector;

-- Inbound messages we've seen (one row per PB webhook event).
CREATE TABLE IF NOT EXISTS messages (
    id              text PRIMARY KEY,
    thread_id       text NOT NULL,
    client_id       text NOT NULL,
    client_name     text NOT NULL,
    body            text NOT NULL,
    received_at     timestamptz NOT NULL,
    raw_event       jsonb NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages(thread_id);
CREATE INDEX IF NOT EXISTS messages_client_idx ON messages(client_id);

-- Drafts produced by the pipeline. A draft is either auto-sent
-- (status -> auto_sent) or held for review (status -> pending_review).
CREATE TABLE IF NOT EXISTS drafts (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id          text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    category            text NOT NULL,
    confidence          numeric(4,3) NOT NULL,
    body                text NOT NULL,
    model               text NOT NULL,
    status              text NOT NULL CHECK (status IN (
        'pending_review','auto_send_scheduled','auto_sent','sent_after_review','rejected','blocked'
    )),
    auto_send_at        timestamptz,
    sent_at             timestamptz,
    sent_message_id     text,
    rejection_reason    text,
    guardrail_flags     text[] NOT NULL DEFAULT '{}',
    rationale           text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drafts_status_idx ON drafts(status);
CREATE INDEX IF NOT EXISTS drafts_message_idx ON drafts(message_id);

-- Append-only audit log of every pipeline action.
CREATE TABLE IF NOT EXISTS audit_events (
    id          bigserial PRIMARY KEY,
    ts          timestamptz NOT NULL DEFAULT now(),
    event       text NOT NULL,
    message_id  text,
    draft_id    uuid,
    data        jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_message_idx ON audit_events(message_id);
CREATE INDEX IF NOT EXISTS audit_event_idx ON audit_events(event, ts DESC);

-- RAG knowledge base chunks. embedding dim must match the model used.
CREATE TABLE IF NOT EXISTS kb_chunks (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source      text NOT NULL,
    section     text,
    body        text NOT NULL,
    embedding   vector(1536) NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kb_chunks_embedding_idx
    ON kb_chunks USING hnsw (embedding vector_cosine_ops);
