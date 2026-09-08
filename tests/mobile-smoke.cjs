const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const git = require("isomorphic-git");

const originalLoad = Module._load;
const originalBuffer = globalThis.Buffer;
delete globalThis.Buffer;
Module._load = function (id, parent, isMain) {
  if (id === "obsidian") {
    return {
      Plugin: class {},
      PluginSettingTab: class {},
      Setting: class {},
      Modal: class {},
      Menu: class {},
      Notice: class {},
      Platform: { isDesktop: false },
      requestUrl: async () => {
        throw new Error("network is not used in the smoke tests");
      },
    };
  }
  return originalLoad.call(this, id, parent, isMain);
};
const pluginModule = require("../dist/main.js");
const { ObsidianFsAdapter } = pluginModule;
const SimpleGitSyncPlugin = pluginModule.default;
Module._load = originalLoad;
assert.equal(typeof globalThis.Buffer, "function", "plugin must install Buffer on mobile");
globalThis.Buffer = originalBuffer;

class MockDataAdapter {
  constructor() {
    this.files = new Map();
    this.folders = new Set([""]);
  }

  normalize(path) {
    return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  }

  parent(path) {
    const normalized = this.normalize(path);
    const slash = normalized.lastIndexOf("/");
    return slash < 0 ? "" : normalized.slice(0, slash);
  }

  async exists(path) {
    const normalized = this.normalize(path);
    return this.files.has(normalized) || this.folders.has(normalized);
  }

  async mkdir(path) {
    const normalized = this.normalize(path);
    if (!this.folders.has(this.parent(normalized))) {
      const error = new Error("ENOENT");
      error.code = "ENOENT";
      throw error;
    }
    this.folders.add(normalized);
  }

  async write(path, data) {
    this.files.set(this.normalize(path), new TextEncoder().encode(data));
  }

  async writeBinary(path, data) {
    this.files.set(this.normalize(path), new Uint8Array(data).slice());
  }

  async read(path) {
    const bytes = await this.readBinary(path);
    return new TextDecoder().decode(bytes);
  }

  async readBinary(path) {
    const normalized = this.normalize(path);
    if (!this.files.has(normalized)) {
      const error = new Error("ENOENT");
      error.code = "ENOENT";
      throw error;
    }
    return this.files.get(normalized).slice().buffer;
  }

  async list(path) {
    const normalized = this.normalize(path);
    const prefix = normalized ? `${normalized}/` : "";
    const isDirectChild = (candidate) => {
      if (!candidate.startsWith(prefix)) return false;
      return !candidate.slice(prefix.length).includes("/");
    };
    return {
      files: [...this.files.keys()].filter(isDirectChild),
      folders: [...this.folders].filter((entry) => entry && isDirectChild(entry)),
    };
  }

  async stat(path) {
    const normalized = this.normalize(path);
    if (this.files.has(normalized)) {
      return { type: "file", ctime: 1, mtime: 1, size: this.files.get(normalized).byteLength };
    }
    if (this.folders.has(normalized)) {
      return { type: "folder", ctime: 1, mtime: 1, size: 0 };
    }
    return null;
  }

  async remove(path) {
    const normalized = this.normalize(path);
    if (!this.files.delete(normalized)) {
      const error = new Error("ENOENT");
      error.code = "ENOENT";
      throw error;
    }
  }

  async rmdir(path, recursive) {
    const normalized = this.normalize(path);
    const prefix = `${normalized}/`;
    const children = [...this.files.keys(), ...this.folders].filter((entry) => entry.startsWith(prefix));
    if (children.length && !recursive) {
      const error = new Error("ENOTEMPTY");
      error.code = "ENOTEMPTY";
      throw error;
    }
    if (recursive) {
      for (const entry of [...this.files.keys()]) {
        if (entry.startsWith(prefix)) this.files.delete(entry);
      }
      for (const entry of [...this.folders]) {
        if (entry.startsWith(prefix)) this.folders.delete(entry);
      }
    }
    this.folders.delete(normalized);
  }
}

test("mobile adapter returns Node-compatible directory entries and stats", async () => {
  const dataAdapter = new MockDataAdapter();
  await dataAdapter.mkdir("folder");
  await dataAdapter.write("empty.md", "");
  const fs = new ObsidianFsAdapter(dataAdapter);

  assert.deepEqual((await fs.promises.readdir("/")).sort(), ["empty.md", "folder"]);
  assert.equal((await fs.promises.stat("/empty.md")).isFile(), true);
  assert.equal((await fs.promises.stat("/folder")).isDirectory(), true);

  const source = new Uint8Array([9, 1, 2, 8]).subarray(1, 3);
  await fs.promises.writeFile("/slice.bin", source);
  assert.deepEqual([...new Uint8Array(await dataAdapter.readBinary("slice.bin"))], [1, 2]);
});

test("isomorphic-git can initialize, add, commit, and remove through the adapter", async () => {
  const dataAdapter = new MockDataAdapter();
  const fs = new ObsidianFsAdapter(dataAdapter);
  const dir = "/";

  await git.init({ fs, dir, defaultBranch: "main" });
  await dataAdapter.mkdir("notes");
  await dataAdapter.write("notes/a.md", "hello");

  let matrix = await git.statusMatrix({ fs, dir, filepaths: ["."] });
  assert.equal(matrix.some(([path, head, workdir]) => path === "notes/a.md" && head === 0 && workdir === 2), true);

  await git.add({ fs, dir, filepath: "notes/a.md" });
  await git.commit({
    fs,
    dir,
    message: "add note",
    author: { name: "test", email: "test@example.com" },
  });
  assert.deepEqual(await git.listFiles({ fs, dir }), ["notes/a.md"]);

  await dataAdapter.remove("notes/a.md");
  matrix = await git.statusMatrix({ fs, dir, filepaths: ["."] });
  assert.equal(matrix.some(([path, head, workdir]) => path === "notes/a.md" && head === 1 && workdir === 0), true);
  await git.remove({ fs, dir, filepath: "notes/a.md" });
  await git.commit({
    fs,
    dir,
    message: "remove note",
    author: { name: "test", email: "test@example.com" },
  });
  assert.deepEqual(await git.listFiles({ fs, dir }), []);
});

test("failed first pull removes partial Git metadata so it can be retried", async () => {
  const dataAdapter = new MockDataAdapter();
  const plugin = new SimpleGitSyncPlugin();
  plugin.app = { vault: { adapter: dataAdapter } };
  plugin.settings = {
    remoteUrl: "https://example.invalid/vault.git",
    username: "test",
    token: "token",
    autoPullOnOpen: false,
    autoPullInterval: 0,
    language: "en",
  };

  await assert.rejects(plugin.cloneIntoVault());
  assert.equal(await dataAdapter.exists(".git"), false);
});
