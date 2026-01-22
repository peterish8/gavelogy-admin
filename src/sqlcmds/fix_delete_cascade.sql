-- Remove the restrictive foreign key constraint
ALTER TABLE user_completed_items
DROP CONSTRAINT IF EXISTS user_completed_items_item_id_fkey;

-- Re-add the constraint with ON DELETE CASCADE
-- This ensures that when a structure_item is deleted, 
-- proper user progress records are automatically removed.
ALTER TABLE user_completed_items
ADD CONSTRAINT user_completed_items_item_id_fkey
FOREIGN KEY (item_id)
REFERENCES structure_items(id)
ON DELETE CASCADE;
