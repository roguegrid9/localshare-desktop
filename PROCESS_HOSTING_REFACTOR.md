# Process Hosting Refactor - Summary

## ✅ What Was Changed

### Core Concept Shift
**Before:** Grid-level hosting (grids have states: hosted/orphaned/inactive)
**After:** Process-level hosting (each process has its own heartbeat)

This matches the actual use case: you want to share **processes** (like a Minecraft server), not "host a grid."

---

## 🔧 Changes Made to Client

### 1. ProcessManager - Added Heartbeat System
**File:** `src-tauri/src/process/manager.rs`

Added:
- `heartbeat_tasks` field to track running heartbeat tasks
- `start_process_heartbeat()` - spawns 30-second heartbeat task for a process
- `stop_process_heartbeat()` - stops heartbeat when process stops
- `resume_all_heartbeats()` - resumes heartbeats on app restart
- `send_process_heartbeat()` - sends heartbeat to backend API

**How it works:**
1. When process starts → register with backend → start heartbeat
2. Heartbeat runs every 30 seconds in background
3. When process stops → stop heartbeat → unregister from backend
4. On app restart → detect running processes → resume heartbeats

### 2. API Client - Process Heartbeat Endpoints
**File:** `src-tauri/src/api/client.rs`

Added:
- `send_process_heartbeat()` - POST to `/api/v1/grids/{grid_id}/processes/{process_id}/heartbeat`
- `unregister_grid_process()` - DELETE `/api/v1/grids/{grid_id}/processes/{process_id}`
- Implemented `register_grid_process()` (was a stub before)

### 3. Process Lifecycle Integration
**File:** `src-tauri/src/commands/process.rs`

- `initialize_process_manager()` now calls `resume_all_heartbeats()` on startup
- `start_process()` auto-starts heartbeat after registration
- `stop_process()` auto-stops heartbeat and unregisters

---

## 📝 Backend Changes Required

### Run This Migration
**File:** `BACKEND_MIGRATION.sql`

The migration:
1. ✅ Adds `last_heartbeat_at` column to `grid_processes`
2. ✅ Removes grid hosting columns (`session_state`, `current_host_id`, etc.)
3. ✅ Creates auto-cleanup function to mark stale processes offline after 60s
4. ✅ Sets up cron job to run cleanup every 30 seconds
5. ✅ Adds RLS policies for heartbeat endpoint

### Required Backend API Changes
You need to implement these endpoints:

```typescript
// New endpoint
POST /api/v1/grids/:gridId/processes/:processId/heartbeat
- Updates last_heartbeat_at to NOW()
- Returns 200 OK

// New endpoint
DELETE /api/v1/grids/:gridId/processes/:processId
- Marks process as stopped
- Returns 200 OK

// Updated endpoint (probably already exists)
POST /api/v1/grids/:gridId/processes
- Registers new process
- Sets initial last_heartbeat_at
- Returns 201 Created

// Remove these (no longer needed):
POST /api/v1/grids/:gridId/claim-host
POST /api/v1/grids/:gridId/release-host
POST /api/v1/grids/:gridId/heartbeat
```

---

## 🚀 Testing Instructions

### 1. Deploy Backend Changes
```bash
# In Supabase SQL Editor:
# 1. Open BACKEND_MIGRATION.sql
# 2. Run the entire migration
# 3. Deploy updated backend API with new endpoints
```

### 2. Rebuild Client
```bash
npm run tauri dev
```

### 3. Test Minecraft Server
1. Start Minecraft server on PC1
2. Check logs - you should see:
   ```
   ✅ Process {id} successfully registered with backend
   🫀 Starting process heartbeat for process {id}
   ✅ Heartbeat task started for process: {id}
   ```

3. On PC2 (laptop), process should show as "online" or "running"

4. Restart app on PC1
5. Check logs - should see:
   ```
   🔄 Resuming heartbeats for all running processes...
   🫀 Starting process heartbeat for process {id}
   ✅ Heartbeat resumption complete
   ```

6. Process should stay online (not orphaned!)

### 4. Expected Behavior
- ✅ Process stays online after app restart
- ✅ Process visible on other PCs in the grid
- ✅ Heartbeat logs every 10th beat (every 5 minutes)
- ✅ Process automatically marked offline if heartbeat stops for 60s
- ❌ No more "orphaned" grid status

---

## 📋 What's Left (Optional Cleanup)

These tasks are **not critical** for testing but clean up old code:

### 1. Remove Grid Hosting Code
**Files to clean:**
- `src-tauri/src/p2p/mod.rs` - Remove `claim_grid_host`, `release_grid_host`, `start_host_heartbeat`
- `src-tauri/src/commands/p2p.rs` - Remove grid hosting commands
- `src-tauri/src/api/types.rs` - Remove `GridSessionStatus`

### 2. Remove Old Commands
**File:** `src-tauri/src/commands/process.rs`
- Remove `start_grid_process()`
- Remove `stop_grid_process()`
- Remove `send_grid_process_data()`

**File:** `src-tauri/src/lib.rs`
- Remove these from command list

### 3. Frontend Updates
**Files:**
- `src/components/gridworkspace/ProcessListView.tsx` - Remove grid session status checks
- Any component checking `grid_status === 'orphaned'` or `'hosted'`

---

## 🐛 Debugging

### If heartbeat doesn't start:
Check logs for:
```
✅ Process {id} successfully registered with backend
🫀 Starting process heartbeat for process {id}
```

If you don't see these, the process wasn't registered properly.

### If process becomes "offline" even though it's running:
1. Check backend logs - is heartbeat endpoint being hit?
2. Check client logs - is heartbeat task sending?
3. Verify backend migration ran correctly:
   ```sql
   SELECT * FROM grid_processes WHERE status = 'running';
   -- Should see last_heartbeat_at updating
   ```

### If heartbeat logs are spamming:
That's normal! It logs every 10th heartbeat (every 5 minutes).
First heartbeat logs immediately, then silent for 5 min.

---

## 📊 Benefits

✅ **No more orphaned grids** - concept doesn't exist
✅ **Processes survive app restarts** - heartbeat resumes automatically
✅ **Multiple people can host different processes** in same grid
✅ **Simpler mental model** - process is either online or offline
✅ **Less code, fewer edge cases**
✅ **Matches actual use case** - sharing processes, not grids

---

## 🎯 Next Steps

1. **Run backend migration** in Supabase
2. **Deploy backend API** with new endpoints
3. **Rebuild client** with `npm run tauri dev`
4. **Test with Minecraft server**
5. **Report back** with logs!

If it works, we can clean up the remaining old code. If not, the logs will tell us what's wrong.

**Let's test it!** 🚀
