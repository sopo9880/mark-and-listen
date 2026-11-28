// Build channel. The release workflow stages this file with TEST_MODE = false; development runs and
// CI test builds keep test mode on. MARK_LISTEN_TEST_MODE=0 turns it off locally.
export const TEST_MODE = process.env.MARK_LISTEN_TEST_MODE !== "0";
