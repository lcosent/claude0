import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { readMode, writeMode, upgradeToExpert, downgradeToTurnkey, isExpertMode } from "./mode";

function testMode() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude0-mode-test-"));
  const claude0Dir = path.join(tmpDir, ".claude0");
  fs.mkdirSync(claude0Dir, { recursive: true });

  console.log("Testing mode utilities...\n");

  // Test 1: Default mode (backward-compat)
  const defaultMode = readMode(tmpDir);
  console.assert(defaultMode.mode === "turnkey", "Default mode should be turnkey");
  console.assert(defaultMode.upgraded_at === null, "Default upgraded_at should be null");
  console.log("✓ Default mode is turnkey");

  // Test 2: Write turnkey mode
  writeMode(tmpDir, { mode: "turnkey", upgraded_at: null });
  const turnkeyMode = readMode(tmpDir);
  console.assert(turnkeyMode.mode === "turnkey", "Written mode should be turnkey");
  console.log("✓ Write turnkey mode");

  // Test 3: Upgrade to expert
  upgradeToExpert(tmpDir);
  const expertMode = readMode(tmpDir);
  console.assert(expertMode.mode === "expert", "Mode should be expert after upgrade");
  console.assert(expertMode.upgraded_at !== null, "upgraded_at should be set");
  console.assert(isExpertMode(tmpDir), "isExpertMode should return true");
  console.log("✓ Upgrade to expert mode");

  // Test 4: Downgrade to turnkey
  downgradeToTurnkey(tmpDir);
  const backToTurnkey = readMode(tmpDir);
  console.assert(backToTurnkey.mode === "turnkey", "Mode should be turnkey after downgrade");
  console.assert(backToTurnkey.upgraded_at === null, "upgraded_at should be null after downgrade");
  console.assert(!isExpertMode(tmpDir), "isExpertMode should return false");
  console.log("✓ Downgrade to turnkey mode");

  // Test 5: Malformed mode.json falls back to turnkey
  fs.writeFileSync(path.join(claude0Dir, "mode.json"), "invalid json{");
  const fallbackMode = readMode(tmpDir);
  console.assert(fallbackMode.mode === "turnkey", "Malformed JSON should fall back to turnkey");
  console.log("✓ Malformed JSON falls back to turnkey");

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log("\n✅ All mode tests passed!");
}

testMode();
