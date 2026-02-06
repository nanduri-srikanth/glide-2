# Offline/Online QA Checklist

1. Fresh install with network offline: launch app, confirm loading state shows “Waiting for connection to sync…”, and no crash.
2. Connect network after step 1: confirm hydration completes and main UI loads without manual restart.
3. With network online: create a new note, confirm it appears immediately in the list, then wait up to 1 minute and confirm it syncs (no pending indicator after reconnect).
4. With network offline: create a new note, confirm it appears in list and shows “Waiting to sync,” and note detail shows “Waiting for connection to sync.”
5. With network offline: edit an existing note, confirm edits are visible immediately in list and detail.
6. Reconnect network after step 4 or 5: confirm pending indicator disappears and note reflects latest local edits.
7. Pull-to-refresh in notes list while online: confirm sync runs and list updates (no error).
8. Background refresh: leave app open and idle for at least 60 seconds while online; confirm no UI regression and data stays current.
9. App foreground: send app to background for 10+ seconds and return while online; confirm sync runs and list updates.
10. Logout while offline: confirm local notes list still renders (read-only) without crashing.
11. Login on a different device with no local data: confirm loading view appears until hydration completes.
