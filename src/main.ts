import { App, Notice, Plugin, PluginSettingTab, Setting, DataWriteOptions } from "obsidian";
import git, { GitAuth, FsPlugin } from "isomorphic-git";
import http from "isomorphic-git/http/web";

class ObsidianFsAdapter implements FsPlugin {
  private adapter: any;
  private basePath: string;

  constructor(adapter: any, basePath: string) {
    this.adapter = adapter;
    this.basePath = basePath;
  }

  private toRelativePath(filepath: string): string {
    if (filepath.startsWith(this.basePath)) {
      return filepath.slice(this.basePath.length).replace(/^[/\\]/, "");
    }
    return filepath.replace(/^[/\\]/, "");
  }

  async readFile(filepath: string, options?: { encoding?: string }): Promise<string | Uint8Array> {
    const relativePath = this.toRelativePath(filepath);
    if (options?.encoding === "utf8" || options?.encoding === "utf-8") {
      return await this.adapter.read(relativePath);
    }
    const buffer = await this.adapter.readBinary(relativePath);
    return new Uint8Array(buffer);
  }

  async writeFile(filepath: string, data: string | Uint8Array | ArrayBuffer, options?: DataWriteOptions): Promise<void> {
    const relativePath = this.toRelativePath(filepath);
    if (typeof data === "string") {
      await this.adapter.write(relativePath, data);
    } else {
      await this.adapter.writeBinary(relativePath, data instanceof ArrayBuffer ? data : data.buffer);
    }
  }

  async readdir(filepath: string, options?: any): Promise<string[]> {
    const relativePath = this.toRelativePath(filepath);
    return await this.adapter.list(relativePath);
  }

  async mkdir(filepath: string, mode?: number, options?: any): Promise<void> {
    const relativePath = this.toRelativePath(filepath);
    await this.adapter.mkdir(relativePath);
  }

  async rmdir(filepath: string, options?: any): Promise<void> {
    const relativePath = this.toRelativePath(filepath);
    await this.adapter.rmdir(relativePath);
  }

  async stat(filepath: string, options?: any): Promise<{ type: string; mode: number; size: number; ino: number; mtimeMs: number }> {
    const relativePath = this.toRelativePath(filepath);
    const exists = await this.adapter.exists(relativePath);
    if (!exists) {
      throw new Error(`ENOENT: no such file or directory, stat '${filepath}'`);
    }
    const stats = await this.adapter.stat(relativePath);
    const isDir = await this.adapter.exists(relativePath + "/") || !relativePath.includes(".");
    return {
      type: isDir ? "dir" : "file",
      mode: 0o644,
      size: stats?.size || 0,
      ino: 0,
      mtimeMs: stats?.mtime || Date.now(),
    };
  }

  async lstat(filepath: string, options?: any): Promise<{ type: string; mode: number; size: number; ino: number; mtimeMs: number }> {
    return this.stat(filepath, options);
  }
}

interface SimpleGitSettings {
  remoteUrl: string;
  username: string;
  token: string;
  autoPullOnOpen: boolean;
  autoPullInterval: number;
}

const DEFAULT_SETTINGS: SimpleGitSettings = {
  remoteUrl: "",
  username: "",
  token: "",
  autoPullOnOpen: false,
  autoPullInterval: 0,
};

export default class SimpleGitSyncPlugin extends Plugin {
  settings: SimpleGitSettings;
  private autoPullTimer: number | null = null;

  async onload() {
    await this.loadSettings();

    this.addRibbonIcon("refresh-cw", "Git Pull", () => this.doPull());

    this.addCommand({
      id: "simple-git-pull",
      name: "Pull from remote",
      callback: () => this.doPull(),
    });

    this.addCommand({
      id: "simple-git-commit-push",
      name: "Commit all and push",
      callback: () => this.doCommitPush(),
    });

    this.addCommand({
      id: "simple-git-init",
      name: "Initialize git repository",
      callback: () => this.doInit(),
    });

    this.addSettingTab(new SimpleGitSettingTab(this.app, this));

    if (this.settings.autoPullOnOpen) {
      this.registerEvent(
        this.app.workspace.on("layout-change", () => {
          this.doPull();
        })
      );
    }

    if (this.settings.autoPullInterval > 0) {
      this.autoPullTimer = window.setInterval(
        () => this.doPull(),
        this.settings.autoPullInterval * 60 * 1000
      );
      this.registerInterval(this.autoPullTimer);
    }
  }

  onunload() {
    if (this.autoPullTimer !== null) {
      window.clearInterval(this.autoPullTimer);
    }
  }

  private getDir(): string {
    return this.app.vault.adapter.getBasePath();
  }

  private getAuth(): GitAuth {
    return {
      username: this.settings.username,
      password: this.settings.token,
    };
  }

  private async ensureRemote(): Promise<void> {
    if (!this.settings.remoteUrl) {
      throw new Error("Remote URL not set. Please configure in plugin settings.");
    }
    const remotes = await git.listRemotes({ fs: this.getFs(), dir: this.getDir() });
    const hasOrigin = remotes.some((r) => r.remote === "origin");
    if (!hasOrigin) {
      await git.addRemote({
        fs: this.getFs(),
        dir: this.getDir(),
        remote: "origin",
        url: this.settings.remoteUrl,
      });
    }
  }

  private getFs(): FsPlugin {
    return new ObsidianFsAdapter(this.app.vault.adapter, this.getDir());
  }

  async doInit() {
    try {
      await git.init({ fs: this.getFs(), dir: this.getDir() });
      new Notice("Simple Git: Repository initialized");
    } catch (e: any) {
      new Notice(`Simple Git: Init failed - ${e.message}`);
    }
  }

  async doPull() {
    try {
      await this.ensureRemote();
      await git.pull({
        fs: this.getFs(),
        http,
        dir: this.getDir(),
        auth: this.getAuth(),
        singleBranch: true,
        onAuth: () => this.getAuth(),
      });
      new Notice("Simple Git: Pull successful");
    } catch (e: any) {
      new Notice(`Simple Git: Pull failed - ${e.message}`);
    }
  }

  async doCommitPush() {
    try {
      await this.ensureRemote();

      const status = await git.statusMatrix({
        fs: this.getFs(),
        dir: this.getDir(),
        filepaths: await this.getTrackedFiles(),
      });

      const changedFiles: string[] = [];
      for (const [filepath, , workdir, stage] of status) {
        if (workdir !== stage) {
          changedFiles.push(filepath);
        }
      }

      if (changedFiles.length === 0) {
        new Notice("Simple Git: Nothing to commit");
        return;
      }

      for (const file of changedFiles) {
        await git.add({ fs: this.getFs(), dir: this.getDir(), filepath: file });
      }

      const now = new Date();
      const timestamp = now.toISOString().replace("T", " ").slice(0, 19);
      await git.commit({
        fs: this.getFs(),
        dir: this.getDir(),
        message: `vault backup: ${timestamp}`,
        author: {
          name: this.settings.username || "user",
          email: "user@local",
        },
      });

      await git.push({
        fs: this.getFs(),
        http,
        dir: this.getDir(),
        auth: this.getAuth(),
        onAuth: () => this.getAuth(),
      });

      new Notice(`Simple Git: Committed ${changedFiles.length} file(s) and pushed`);
    } catch (e: any) {
      new Notice(`Simple Git: Commit/Push failed - ${e.message}`);
    }
  }

  private async getTrackedFiles(): Promise<string[]> {
    try {
      return await git.listFiles({ fs: this.getFs(), dir: this.getDir() });
    } catch {
      return [];
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class SimpleGitSettingTab extends PluginSettingTab {
  plugin: SimpleGitSyncPlugin;

  constructor(app: App, plugin: SimpleGitSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Simple Git Sync Settings" });

    new Setting(containerEl)
      .setName("Remote URL")
      .setDesc("HTTPS URL of your GitHub repository")
      .addText((text) =>
        text
          .setPlaceholder("https://github.com/user/repo.git")
          .setValue(this.plugin.settings.remoteUrl)
          .onChange(async (value) => {
            this.plugin.settings.remoteUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Username")
      .setDesc("Your GitHub username")
      .addText((text) =>
        text
          .setPlaceholder("username")
          .setValue(this.plugin.settings.username)
          .onChange(async (value) => {
            this.plugin.settings.username = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Token / Password")
      .setDesc("GitHub Personal Access Token")
      .addText((text) =>
        text
          .setPlaceholder("ghp_xxxx or fine-grained token")
          .setValue(this.plugin.settings.token)
          .onChange(async (value) => {
            this.plugin.settings.token = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto pull on open")
      .setDesc("Automatically pull when vault opens")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoPullOnOpen)
          .onChange(async (value) => {
            this.plugin.settings.autoPullOnOpen = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto pull interval (minutes)")
      .setDesc("0 = disabled. Pull automatically at this interval.")
      .addText((text) =>
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.settings.autoPullInterval))
          .onChange(async (value) => {
            const num = parseInt(value) || 0;
            this.plugin.settings.autoPullInterval = num;
            await this.plugin.saveSettings();
          })
      );
  }
}
