-- ====================================================================================
-- RogueGrid9 Backend Migration: Process-Based Hosting
-- ====================================================================================
-- This migration removes grid-level hosting and implements per-process heartbeats
--
-- IMPORTANT: Run this migration in your Supabase SQL editor
-- After running, deploy the updated backend API endpoints
-- ====================================================================================

-- 1. Add process heartbeat column to grid_processes table
-- ---------------------------------------------------------------------------------
ALTER TABLE grid_processes
ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ DEFAULT NOW();

-- Add index for faster heartbeat queries
CREATE INDEX IF NOT EXISTS idx_grid_processes_heartbeat
ON grid_processes(last_heartbeat_at)
WHERE status = 'running';

-- 2. Remove grid hosting columns (if they exist)
-- ---------------------------------------------------------------------------------
-- These columns are no longer needed since we're doing process-level hosting
ALTER TABLE grids DROP COLUMN IF EXISTS session_state;
ALTER TABLE grids DROP COLUMN IF EXISTS current_host_id;
ALTER TABLE grids DROP COLUMN IF EXISTS host_last_seen;
ALTER TABLE grids DROP COLUMN IF EXISTS last_heartbeat_at;

-- Drop grid session/hosting related indexes
DROP INDEX IF EXISTS idx_grids_session_state;
DROP INDEX IF EXISTS idx_grids_current_host;

-- 3. Update grid_processes status to be more specific
-- ---------------------------------------------------------------------------------
-- Ensure status column exists and has correct type
ALTER TABLE grid_processes
ALTER COLUMN status TYPE VARCHAR(50);

-- Add check constraint for valid statuses
ALTER TABLE grid_processes DROP CONSTRAINT IF EXISTS check_process_status;
ALTER TABLE grid_processes ADD CONSTRAINT check_process_status
CHECK (status IN ('running', 'stopped', 'failed', 'starting'));

-- 4. Create function to automatically mark processes as offline
-- ---------------------------------------------------------------------------------
-- This function marks processes as offline if no heartbeat for 60 seconds
CREATE OR REPLACE FUNCTION mark_stale_processes_offline()
RETURNS void AS $$
BEGIN
    UPDATE grid_processes
    SET status = 'stopped',
        updated_at = NOW()
    WHERE status = 'running'
      AND last_heartbeat_at < NOW() - INTERVAL '60 seconds';
END;
$$ LANGUAGE plpgsql;

-- 5. Create scheduled job to run the stale process cleanup
-- ---------------------------------------------------------------------------------
-- This will run every 30 seconds to mark stale processes as offline
-- Note: pg_cron may not be available on all Supabase plans

-- First, try to enable pg_cron (may require superuser privileges)
-- If this fails, the cleanup will still work but needs manual triggering
DO $$
BEGIN
    -- Try to create the extension
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    RAISE NOTICE '✅ pg_cron extension enabled';
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE '⚠️ Could not enable pg_cron (requires superuser). Cleanup function created but not scheduled.';
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ pg_cron not available. Cleanup function created but not scheduled.';
END $$;

-- Try to schedule the job (will fail silently if pg_cron not available)
DO $$
BEGIN
    PERFORM cron.schedule(
        'cleanup-stale-processes',
        '*/30 * * * * *',  -- Every 30 seconds
        $$SELECT mark_stale_processes_offline()$$
    );
    RAISE NOTICE '✅ Scheduled automatic cleanup job';
EXCEPTION
    WHEN undefined_table OR invalid_schema_name THEN
        RAISE NOTICE '⚠️ pg_cron not available. You can manually run: SELECT mark_stale_processes_offline();';
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ Could not schedule cleanup job: %', SQLERRM;
END $$;

-- 6. Add RLS policies for process heartbeat endpoint
-- ---------------------------------------------------------------------------------
-- Allow users to update heartbeat for their own processes
-- Drop policy if it exists first, then recreate
DROP POLICY IF EXISTS "Users can update heartbeat for their own processes" ON grid_processes;

CREATE POLICY "Users can update heartbeat for their own processes"
ON grid_processes
FOR UPDATE
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

-- 7. Create helper view for active processes per grid
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE VIEW grid_active_processes AS
SELECT
    g.id as grid_id,
    g.name as grid_name,
    gp.id as process_id,
    gp.process_type,
    gp.status,
    gp.port,
    gp.owner_id,
    gp.owner_display_name,
    gp.last_heartbeat_at,
    gp.started_at,
    EXTRACT(EPOCH FROM (NOW() - gp.last_heartbeat_at)) as seconds_since_heartbeat
FROM grids g
JOIN grid_processes gp ON g.id = gp.grid_id
WHERE gp.status = 'running'
ORDER BY g.id, gp.started_at DESC;

-- 8. Add comments for documentation
-- ---------------------------------------------------------------------------------
COMMENT ON COLUMN grid_processes.last_heartbeat_at IS
'Timestamp of last heartbeat from the client. Processes are marked offline after 60 seconds without heartbeat.';

COMMENT ON FUNCTION mark_stale_processes_offline IS
'Automatically marks processes as stopped if they haven''t sent a heartbeat in 60 seconds.';

-- ====================================================================================
-- VERIFICATION QUERIES
-- ====================================================================================
-- Run these after migration to verify everything is set up correctly:
--
-- 1. Check that last_heartbeat_at column exists:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'grid_processes' AND column_name = 'last_heartbeat_at';
--
-- 2. Check scheduled job is running:
--    SELECT * FROM cron.job WHERE jobname = 'cleanup-stale-processes';
--
-- 3. View active processes:
--    SELECT * FROM grid_active_processes;
--
-- ====================================================================================

-- Print success message
DO $$
BEGIN
    RAISE NOTICE '✅ Migration completed successfully!';
    RAISE NOTICE '📝 Next steps:';
    RAISE NOTICE '  1. Deploy updated backend API with new endpoints:';
    RAISE NOTICE '     - POST /api/v1/grids/{grid_id}/processes/{process_id}/heartbeat';
    RAISE NOTICE '     - DELETE /api/v1/grids/{grid_id}/processes/{process_id}';
    RAISE NOTICE '  2. Remove old grid hosting endpoints';
    RAISE NOTICE '  3. Test with a Minecraft server!';
END $$;
