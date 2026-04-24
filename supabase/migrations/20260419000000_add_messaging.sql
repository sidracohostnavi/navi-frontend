-- Migration: Add Messaging System
-- Created: 2026-04-19
-- Description: Adds cohost_conversations, cohost_messages, and cohost_ai_drafts tables
--              for the guest messaging system. Also adds thread_id + message_type columns
--              to gmail_messages so relay emails can be grouped and filtered efficiently.
--
-- NOTE: Tables use the cohost_ prefix to avoid collisions with other apps in the
--       naviverse monorepo (a plain 'messages' table already exists).
--
-- SAFE TO RE-RUN: DROP IF EXISTS at the top clears any partial state from failed runs.

-------------------------------------------------------------------------------
-- 0. Clean up any partial state from previous failed runs
-------------------------------------------------------------------------------

DROP TABLE IF EXISTS public.cohost_ai_drafts   CASCADE;
DROP TABLE IF EXISTS public.cohost_messages     CASCADE;
DROP TABLE IF EXISTS public.cohost_conversations CASCADE;
-- Also clean up old name from very first failed attempt
DROP TABLE IF EXISTS public.conversations        CASCADE;

-------------------------------------------------------------------------------
-- 1. Extend gmail_messages with thread_id and message_type
-------------------------------------------------------------------------------

ALTER TABLE public.gmail_messages
  ADD COLUMN IF NOT EXISTS thread_id TEXT,
  ADD COLUMN IF NOT EXISTS message_type TEXT;

CREATE INDEX IF NOT EXISTS gmail_messages_thread_id_idx
  ON public.gmail_messages (thread_id);

CREATE INDEX IF NOT EXISTS gmail_messages_message_type_idx
  ON public.gmail_messages (message_type);

-------------------------------------------------------------------------------
-- 2. cohost_conversations — one thread per booking per channel
--    channel = 'gmail_relay'  → iCal guests messaging via Airbnb/VRBO relay
--    channel = 'direct_email' → direct booking guests (real email address)
-------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cohost_conversations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       UUID        NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  workspace_id     UUID        NOT NULL REFERENCES public.cohost_workspaces(id) ON DELETE CASCADE,
  property_id      UUID        NOT NULL REFERENCES public.cohost_properties(id) ON DELETE CASCADE,
  channel          TEXT        NOT NULL DEFAULT 'gmail_relay'
                               CHECK (channel IN ('gmail_relay', 'direct_email')),
  gmail_thread_id  TEXT,       -- Gmail threadId for grouping relay email replies
  last_message_at  TIMESTAMPTZ,
  unread_count     INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, channel)
);

CREATE INDEX IF NOT EXISTS cohost_conversations_workspace_id_idx
  ON public.cohost_conversations (workspace_id);

CREATE INDEX IF NOT EXISTS cohost_conversations_booking_id_idx
  ON public.cohost_conversations (booking_id);

CREATE INDEX IF NOT EXISTS cohost_conversations_last_message_at_idx
  ON public.cohost_conversations (last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS cohost_conversations_gmail_thread_id_idx
  ON public.cohost_conversations (gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;

-------------------------------------------------------------------------------
-- 3. cohost_messages — individual messages within a conversation
--    direction = 'inbound'  → guest → host
--    direction = 'outbound' → host → guest (manual or Navi-sent)
--    sent_by_user_id NULL   → sent by Navi autonomously
-------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cohost_messages (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID        NOT NULL REFERENCES public.cohost_conversations(id) ON DELETE CASCADE,
  direction         TEXT        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body              TEXT        NOT NULL,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by_user_id   UUID        REFERENCES auth.users(id),
  gmail_message_id  TEXT,
  is_read           BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cohost_messages_conversation_id_idx
  ON public.cohost_messages (conversation_id);

CREATE INDEX IF NOT EXISTS cohost_messages_sent_at_idx
  ON public.cohost_messages (sent_at DESC);

CREATE INDEX IF NOT EXISTS cohost_messages_gmail_message_id_idx
  ON public.cohost_messages (gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;

-------------------------------------------------------------------------------
-- 4. cohost_ai_drafts — Navi's suggested replies + what host actually sent
--    This table is the learning loop:
--    - draft_body  = what Navi suggested
--    - edited_body = what the host actually sent (if they changed it)
--    - Every row where edited_body != draft_body teaches Navi the host's voice
-------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cohost_ai_drafts (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id           UUID        NOT NULL REFERENCES public.cohost_conversations(id) ON DELETE CASCADE,
  triggered_by_message_id   UUID        REFERENCES public.cohost_messages(id),
  draft_body                TEXT        NOT NULL,
  status                    TEXT        NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending', 'approved', 'edited', 'dismissed')),
  edited_body               TEXT,       -- populated when host edits before sending
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cohost_ai_drafts_conversation_id_idx
  ON public.cohost_ai_drafts (conversation_id);

CREATE INDEX IF NOT EXISTS cohost_ai_drafts_status_idx
  ON public.cohost_ai_drafts (status);

-------------------------------------------------------------------------------
-- 5. Row Level Security
-------------------------------------------------------------------------------

ALTER TABLE public.cohost_conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohost_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohost_ai_drafts      ENABLE ROW LEVEL SECURITY;

-- cohost_conversations: visible to active workspace members
CREATE POLICY "cohost_conversations_workspace_access" ON public.cohost_conversations
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.cohost_workspace_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- cohost_messages: visible via conversation → workspace membership
CREATE POLICY "cohost_messages_workspace_access" ON public.cohost_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM public.cohost_conversations
      WHERE workspace_id IN (
        SELECT workspace_id
        FROM public.cohost_workspace_members
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

-- cohost_ai_drafts: same path as messages
CREATE POLICY "cohost_ai_drafts_workspace_access" ON public.cohost_ai_drafts
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM public.cohost_conversations
      WHERE workspace_id IN (
        SELECT workspace_id
        FROM public.cohost_workspace_members
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );
