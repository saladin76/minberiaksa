import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("VPS deploy activates a Node and npm toolchain in a non-interactive shell", () => {
  const script = readFileSync("scripts/deploy-vps.sh", "utf8");
  const resolver = script.slice(script.indexOf("ensure_node_toolchain()"), script.indexOf("APP=\"${PM2_APP"));
  assert.match(resolver, /command -v node/);
  assert.match(resolver, /command -v npm/);
  assert.match(resolver, /\. "\$NVM_DIR\/nvm\.sh"/);
  assert.match(resolver, /nvm use --silent default/);
  assert.match(resolver, /sort -V/);
  assert.match(script, /ensure_node_toolchain\n\nAPP=/);
});

test("VPS deploy installs and selects the package-required Node major from NVM", () => {
  const script = readFileSync("scripts/deploy-vps.sh", "utf8");
  const resolver = script.slice(script.indexOf("ensure_node_toolchain()"), script.indexOf("APP=\"${PM2_APP"));
  const root = mkdtempSync(join(tmpdir(), "deploy-node-test-"));
  try {
    const emptyPath = join(root, "empty-path");
    const nvmHome = join(root, ".nvm");
    const oldNodeBin = join(nvmHome, "versions/node/v22.23.3/bin");
    mkdirSync(emptyPath, { recursive: true });
    mkdirSync(oldNodeBin, { recursive: true });
    writeFileSync(join(nvmHome, "nvm.sh"), [
      "nvm() {",
      "  case \"$1\" in",
      "    use)",
      "      case \"$3\" in",
      "        default|v22.23.3) PATH=\"$NVM_DIR/versions/node/v22.23.3/bin:/usr/bin:/bin:$PATH\" ;;",
      "        v24.22.1) PATH=\"$NVM_DIR/versions/node/v24.22.1/bin:/usr/bin:/bin:$PATH\" ;;",
      "        *) return 1 ;;",
      "      esac",
      "      export PATH",
      "      ;;",
      "    install)",
      "      [[ \"$2\" == 24 ]] || return 1",
      "      local bin=\"$NVM_DIR/versions/node/v24.22.1/bin\"",
      "      /bin/mkdir -p \"$bin\"",
      "      /bin/cat >\"$bin/node\" <<'NODE'",
      "#!/bin/sh",
      "case \"$1\" in",
      "  -e) printf '24.x' ;;",
      "  -p) printf '24' ;;",
      "  -v) printf 'v24.22.1' ;;",
      "esac",
      "NODE",
      "      /bin/cat >\"$bin/npm\" <<'NPM'",
      "#!/bin/sh",
      "exit 0",
      "NPM",
      "      /bin/chmod 755 \"$bin/node\" \"$bin/npm\"",
      "      ;;",
      "    version) printf 'v24.22.1' ;;",
      "    *) return 1 ;;",
      "  esac",
      "}",
    ].join("\n"));
    const oldNode = join(oldNodeBin, "node");
    writeFileSync(oldNode, [
      "#!/bin/sh",
      "case \"$1\" in",
      "  -e) printf '24.x' ;;",
      "  -p) printf '22' ;;",
      "  -v) printf 'v22.23.3' ;;",
      "esac",
    ].join("\n"));
    chmodSync(oldNode, 0o755);
    const oldNpm = join(oldNodeBin, "npm");
    writeFileSync(oldNpm, "#!/bin/sh\nexit 0\n");
    chmodSync(oldNpm, 0o755);

    const result = spawnSync("/bin/bash", ["-c", `${resolver}\nensure_node_toolchain\nprintf '%s\\n%s\\n' \"$(command -v node)\" \"$(command -v npm)\"`], {
      env: { PATH: emptyPath, NVM_DIR: nvmHome, NODE_ENV: "test" },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const requiredNodeBin = join(nvmHome, "versions/node/v24.22.1/bin");
    assert.deepEqual(result.stdout.trim().split("\n").slice(-2), [join(requiredNodeBin, "node"), join(requiredNodeBin, "npm")]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
