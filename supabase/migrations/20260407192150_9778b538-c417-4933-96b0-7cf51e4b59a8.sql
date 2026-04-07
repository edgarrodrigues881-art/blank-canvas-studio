
-- Preserve chip conversation logs when conversation is deleted
ALTER TABLE chip_conversation_logs
  DROP CONSTRAINT chip_conversation_logs_conversation_id_fkey,
  ADD CONSTRAINT chip_conversation_logs_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES chip_conversations(id)
    ON DELETE SET NULL;

-- Make conversation_id nullable so SET NULL works
ALTER TABLE chip_conversation_logs
  ALTER COLUMN conversation_id DROP NOT NULL;

-- Preserve group interaction logs when interaction is deleted
ALTER TABLE group_interaction_logs
  DROP CONSTRAINT group_interaction_logs_interaction_id_fkey,
  ADD CONSTRAINT group_interaction_logs_interaction_id_fkey
    FOREIGN KEY (interaction_id) REFERENCES group_interactions(id)
    ON DELETE SET NULL;

-- Make interaction_id nullable so SET NULL works
ALTER TABLE group_interaction_logs
  ALTER COLUMN interaction_id DROP NOT NULL;

-- Keep group_interaction_media cascading (media config can be deleted with interaction)
-- No change needed there
