import { App, Menu, Modal, Notice, Plugin, PluginSettingTab, Setting, Platform, requestUrl } from "obsidian";
import git, { GitAuth } from "isomorphic-git";

type Lang = "en" | "zh";

interface Strings {
  menuPull: string;
  menuForcePull: string;
  menuCommitPush: string;
  menuInit: string;
  confirmForcePullTitle: string;
  confirmForcePullMessage: string;
  confirmCancel: string;
  confirmDiscardAndPull: string;
  noticePullOk: string;
  noticePullFail: (m: string) => string;
  noticeForcePullOk: (b: string) => string;
  noticeForcePullFail: (m: string) => string;
  noticeNothingToCommit: string;
  noticeCommitPushOk: (n: number) => string;
  noticeCommitPushFail: (m: string) => string;
  noticeInitOk: string;
  noticeInitFail: (m: string) => string;
  noticeNoRemote: string;
  noticeLoadFail: (m: string) => string;
  settingsTitle: string;
  settingLanguage: string;
  settingLanguageDesc: string;
  settingRemoteUrl: string;
  settingRemoteUrlDesc: string;
  settingUsername: string;
  settingUsernameDesc: string;
  settingToken: string;
  settingTokenDesc: string;
  settingAutoPullOnOpen: string;
  settingAutoPullOnOpenDesc: string;
  settingAutoPullInterval: string;
  settingAutoPullIntervalDesc: string;
}

const STRINGS: Record<Lang, Strings> = {
  en: {
    menuPull: "Pull",
    menuForcePull: "Force pull (discard local changes)",
    menuCommitPush: "Commit all and push",
    menuInit: "Initialize repository",
    confirmForcePullTitle: "Force pull",
    confirmForcePullMessage:
      "This will discard ALL local uncommitted changes and reset the vault to the remote state. Unsynced edits will be lost. Continue?",
    confirmCancel: "Cancel",
    confirmDiscardAndPull: "Discard & pull",
    noticePullOk: "Simple Git: Pull successful",
    noticePullFail: (m) => `Simple Git: Pull failed - ${m}`,
    noticeForcePullOk: (b) => `Simple Git: Force pulled (reset to origin/${b})`,
    noticeForcePullFail: (m) => `Simple Git: Force pull failed - ${m}`,
    noticeNothingToCommit: "Simple Git: Nothing to commit",
    noticeCommitPushOk: (n) => `Simple Git: Committed ${n} file(s) and pushed`,
    noticeCommitPushFail: (m) => `Simple Git: Commit/Push failed - ${m}`,
    noticeInitOk: "Simple Git: Repository initialized",
    noticeInitFail: (m) => `Simple Git: Init failed - ${m} (check console for details)`,
    noticeNoRemote: "Remote URL not set. Please configure in plugin settings.",
    noticeLoadFail: (m) => `Simple Git: Failed to load - ${m}`,
    settingsTitle: "Simple Git Sync Settings",
    settingLanguage: "Language / 语言",
    settingLanguageDesc: "UI language for this plugin",
    settingRemoteUrl: "Remote URL",
    settingRemoteUrlDesc: "HTTPS URL of your GitHub repository",
    settingUsername: "Username",
    settingUsernameDesc: "Your GitHub username",
    settingToken: "Token / Password",
    settingTokenDesc: "GitHub Personal Access Token",
    settingAutoPullOnOpen: "Auto pull on open",
    settingAutoPullOnOpenDesc: "Automatically pull when vault opens",
    settingAutoPullInterval: "Auto pull interval (minutes)",
    settingAutoPullIntervalDesc: "0 = disabled. Pull automatically at this interval.",
  },
  zh: {
    menuPull: "拉取",
    menuForcePull: "强制拉取（丢弃本地修改）",
    menuCommitPush: "提交全部并推送",
    menuInit: "初始化仓库",
    confirmForcePullTitle: "强制拉取",
    confirmForcePullMessage:
      "将丢弃所有未提交的本地修改，把仓库重置为远程状态。未同步的改动会丢失。确定继续吗？",
    confirmCancel: "取消",
    confirmDiscardAndPull: "丢弃并拉取",
    noticePullOk: "Simple Git：拉取成功",
    noticePullFail: (m) => `Simple Git：拉取失败 - ${m}`,
    noticeForcePullOk: (b) => `Simple Git：已强制拉取（重置到 origin/${b}）`,
    noticeForcePullFail: (m) => `Simple Git：强制拉取失败 - ${m}`,
    noticeNothingToCommit: "Simple Git：没有可提交的内容",
    noticeCommitPushOk: (n) => `Simple Git：已提交 ${n} 个文件并推送`,
    noticeCommitPushFail: (m) => `Simple Git：提交/推送失败 - ${m}`,
    noticeInitOk: "Simple Git：仓库初始化完成",
    noticeInitFail: (m) => `Simple Git：初始化失败 - ${m}（详情见控制台）`,
    noticeNoRemote: "尚未设置远程仓库地址，请在插件设置中配置。",
    noticeLoadFail: (m) => `Simple Git：加载失败 - ${m}`,
    settingsTitle: "Simple Git Sync 设置",
    settingLanguage: "语言 / Language",
    settingLanguageDesc: "插件界面显示语言",
    settingRemoteUrl: "远程仓库地址",
    settingRemoteUrlDesc: "GitHub 仓库的 HTTPS 地址",
    settingUsername: "用户名",
    settingUsernameDesc: "你的 GitHub 用户名",
    settingToken: "令牌 / 密码",
    settingTokenDesc: "GitHub 个人访问令牌（PAT）",
    settingAutoPullOnOpen: "打开时自动拉取",
    settingAutoPullOnOpenDesc: "打开仓库时自动执行拉取",
    settingAutoPullInterval: "自动拉取间隔（分钟）",
    settingAutoPullIntervalDesc: "0 = 关闭。按此间隔自动拉取。",
  },
};

async function* bufferToAsyncGen(buffer: ArrayBuffer): AsyncGenerator<Uint8Array> {
  yield new Uint8Array(buffer);
}

async function collectBody(body: AsyncIterableIterator<Uint8Array> | undefined): Promise<ArrayBuffer | undefined> {
  if (!body) return undefined;
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) return undefined;
  const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

const http = {
  async request({ url, method = "GET", headers = {}, body }: any) {
    if (Platform.isDesktop) {
      const bodyBuffer = await collectBody(body);
      const response = await requestUrl({
        url,
        method,
        headers,
        body: bodyBuffer,
        throw: false,
      });
      return {
        url,
        method,
        statusCode: response.status,
        statusMessage: "",
        headers: response.headers,
        body: bufferToAsyncGen(response.arrayBuffer),
      };
    } else {
      const fetchBody = body ? await collectBody(body) : undefined;
      const response = await fetch(url, { method, headers, body: fetchBody });
      const buffer = await response.arrayBuffer();
      return {
        url: response.url,
        method: response.url ? method : undefined,
        statusCode: response.status,
        statusMessage: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: bufferToAsyncGen(buffer),
      };
    }
  },
};

class ObsidianFsAdapter {
  private adapter: any;
  private basePath: string;
  promises: any;

  constructor(adapter: any, basePath: string) {
    this.adapter = adapter;
    // Normalize basePath to use forward slashes and remove trailing slash
    this.basePath = basePath.replace(/\\/g, "/").replace(/\/$/, "");
    
    const toRelativePath = (filepath: string): string => {
      // Normalize to forward slashes
      const normalized = filepath.replace(/\\/g, "/");
      
      // If path starts with basePath, strip it
      if (normalized.startsWith(this.basePath + "/")) {
        return normalized.slice(this.basePath.length + 1);
      }
      if (normalized === this.basePath) {
        return "";
      }
      
      // If it's already relative or just a filename, return as-is
      return normalized.replace(/^\/+/, "");
    };

    this.promises = {
      readFile: async (filepath: string, options?: { encoding?: string }): Promise<string | Uint8Array> => {
        const relativePath = toRelativePath(filepath);
        if (options?.encoding === "utf8" || options?.encoding === "utf-8") {
          return await this.adapter.read(relativePath);
        }
        const buffer = await this.adapter.readBinary(relativePath);
        return new Uint8Array(buffer);
      },

      writeFile: async (filepath: string, data: string | Uint8Array | ArrayBuffer): Promise<void> => {
        const relativePath = toRelativePath(filepath);
        if (typeof data === "string") {
          await this.adapter.write(relativePath, data);
        } else {
          await this.adapter.writeBinary(relativePath, data instanceof ArrayBuffer ? data : data.buffer);
        }
      },

      readdir: async (filepath: string): Promise<string[]> => {
        const relativePath = toRelativePath(filepath);
        return await this.adapter.list(relativePath);
      },

      mkdir: async (filepath: string): Promise<void> => {
        const relativePath = toRelativePath(filepath);
        try {
          await this.adapter.mkdir(relativePath);
        } catch (e: any) {
          if (e.message?.includes("already exists")) return;
          throw e;
        }
      },

      rmdir: async (filepath: string): Promise<void> => {
        const relativePath = toRelativePath(filepath);
        await this.adapter.rmdir(relativePath);
      },

      stat: async (filepath: string): Promise<any> => {
        const relativePath = toRelativePath(filepath);
        const exists = await this.adapter.exists(relativePath);
        if (!exists) {
          const err: any = new Error(`ENOENT: no such file or directory, stat '${filepath}'`);
          err.code = "ENOENT";
          throw err;
        }
        const stats = await this.adapter.stat(relativePath);
        // Obsidian adapter stat returns { ctime, mtime, size } for files
        // For directories, it may return null or have different structure
        const isDir = !stats || !stats.size;
        const mtimeMs = stats?.mtime || Date.now();
        const ctimeMs = stats?.ctime || mtimeMs;
        return {
          isDirectory: () => isDir,
          isFile: () => !isDir,
          isSymbolicLink: () => false,
          size: stats?.size || 0,
          mtimeMs,
          ctimeMs,
          mtime: new Date(mtimeMs),
          ctime: new Date(ctimeMs),
          mode: 0o666,
          dev: 0,
          ino: 0,
          uid: 0,
          gid: 0,
          nlink: 1,
        };
      },

      lstat: async (filepath: string): Promise<any> => {
        return this.promises.stat(filepath);
      },

      readlink: async (filepath: string): Promise<string> => {
        throw new Error("readlink not supported");
      },

      symlink: async (target: string, path: string): Promise<void> => {
        throw new Error("symlink not supported");
      },

      unlink: async (filepath: string): Promise<void> => {
        const relativePath = toRelativePath(filepath);
        if (this.adapter.remove) {
          await this.adapter.remove(relativePath);
        } else if (this.adapter.unlink) {
          await this.adapter.unlink(relativePath);
        } else {
          throw new Error("No remove method available on adapter");
        }
      },

      rm: async (filepath: string): Promise<void> => {
        const relativePath = toRelativePath(filepath);
        if (this.adapter.remove) {
          await this.adapter.remove(relativePath);
        } else if (this.adapter.unlink) {
          await this.adapter.unlink(relativePath);
        } else {
          throw new Error("No remove method available on adapter");
        }
      },
    };
  }
}

interface SimpleGitSettings {
  remoteUrl: string;
  username: string;
  token: string;
  autoPullOnOpen: boolean;
  autoPullInterval: number;
  language: Lang;
}

const DEFAULT_SETTINGS: SimpleGitSettings = {
  remoteUrl: "",
  username: "",
  token: "",
  autoPullOnOpen: false,
  autoPullInterval: 0,
  language: "en",
};

export default class SimpleGitSyncPlugin extends Plugin {
  settings: SimpleGitSettings;
  private autoPullTimer: number | null = null;

  get strings(): Strings {
    return STRINGS[this.settings.language] || STRINGS.en;
  }

  async onload() {
    try {
      await this.loadSettings();

      this.addRibbonIcon("git-branch", "Simple Git Sync", (evt) => this.showSyncMenu(evt));

    this.addCommand({
      id: "simple-git-pull",
      name: "Pull from remote",
      callback: () => this.doPull(),
    });

    this.addCommand({
      id: "simple-git-force-pull",
      name: "Force pull (discard local changes)",
      callback: () => this.doForcePull(),
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
    } catch (e) {
      console.error("Simple Git Sync: Failed to load plugin", e);
      new Notice(STRINGS.en.noticeLoadFail((e as Error).message));
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
      throw new Error(this.strings.noticeNoRemote);
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

  private getFs(): ObsidianFsAdapter {
    return new ObsidianFsAdapter(this.app.vault.adapter, this.getDir());
  }

  async doInit() {
    try {
      const fs = this.getFs();
      const dir = this.getDir();
      console.log("Simple Git: Initializing...", { dir, hasFs: !!fs, hasPromises: !!fs.promises });
      await git.init({ fs, dir });
      
      // Set default git config
      const username = this.settings.username || "user";
      await git.setConfig({ fs, dir, path: "user.name", value: username });
      await git.setConfig({ fs, dir, path: "user.email", value: `${username}@local` });
      
      new Notice(this.strings.noticeInitOk);
    } catch (e: any) {
      console.error("Simple Git Init Error:", e);
      new Notice(this.strings.noticeInitFail(e.message));
    }
  }

  private showSyncMenu(evt: MouseEvent) {
    const s = this.strings;
    const menu = new Menu();
    menu.addItem((item) =>
      item.setTitle(s.menuPull).setIcon("download").onClick(() => this.doPull())
    );
    menu.addItem((item) =>
      item
        .setTitle(s.menuForcePull)
        .setIcon("rotate-ccw")
        .onClick(() => this.doForcePull())
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle(s.menuCommitPush)
        .setIcon("upload")
        .onClick(() => this.doCommitPush())
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle(s.menuInit)
        .setIcon("git-branch")
        .onClick(() => this.doInit())
    );
    menu.showAtMouseEvent(evt);
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
      new Notice(this.strings.noticePullOk);
    } catch (e: any) {
      console.error("Simple Git Pull Error:", e);
      new Notice(this.strings.noticePullFail(e.message));
    }
  }

  doForcePull() {
    const s = this.strings;
    new ConfirmModal(
      this.app,
      s.confirmForcePullTitle,
      s.confirmForcePullMessage,
      s.confirmCancel,
      s.confirmDiscardAndPull,
      () => this.runForcePull()
    ).open();
  }

  private async runForcePull() {
    try {
      await this.ensureRemote();
      const fs = this.getFs();
      const dir = this.getDir();
      await git.fetch({
        fs,
        http,
        dir,
        remote: "origin",
        auth: this.getAuth(),
        onAuth: () => this.getAuth(),
        singleBranch: true,
      });
      const branch = (await git.currentBranch({ fs, dir })) || "master";
      const oid = await git.resolveRef({ fs, dir, ref: `origin/${branch}` });
      await git.branch({ fs, dir, ref: branch, object: oid, force: true });
      await git.checkout({ fs, dir, ref: branch, force: true });
      new Notice(this.strings.noticeForcePullOk(branch));
    } catch (e: any) {
      console.error("Simple Git Force Pull Error:", e);
      new Notice(this.strings.noticeForcePullFail(e.message));
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
        new Notice(this.strings.noticeNothingToCommit);
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

      new Notice(this.strings.noticeCommitPushOk(changedFiles.length));
    } catch (e: any) {
      console.error("Simple Git Commit/Push Error:", e);
      new Notice(this.strings.noticeCommitPushFail(e.message));
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

class ConfirmModal extends Modal {
  constructor(
    app: App,
    private titleText: string,
    private message: string,
    private cancelText: string,
    private confirmText: string,
    private onConfirm: () => void
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.titleText });
    contentEl.createEl("p", { text: this.message });
    const footer = contentEl.createDiv();
    footer.style.display = "flex";
    footer.style.justifyContent = "flex-end";
    footer.style.gap = "8px";
    footer.style.marginTop = "16px";
    const cancelBtn = footer.createEl("button", { text: this.cancelText });
    cancelBtn.onclick = () => this.close();
    const okBtn = footer.createEl("button", {
      text: this.confirmText,
      cls: "mod-warning",
    });
    okBtn.onclick = () => {
      this.close();
      this.onConfirm();
    };
  }

  onClose() {
    this.contentEl.empty();
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
    const s = this.plugin.strings;

    containerEl.createEl("h2", { text: s.settingsTitle });

    new Setting(containerEl)
      .setName(s.settingLanguage)
      .setDesc(s.settingLanguageDesc)
      .addDropdown((drop) => {
        drop.addOption("en", "English");
        drop.addOption("zh", "中文");
        drop.setValue(this.plugin.settings.language);
        drop.onChange(async (value) => {
          this.plugin.settings.language = value as Lang;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName(s.settingRemoteUrl)
      .setDesc(s.settingRemoteUrlDesc)
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
      .setName(s.settingUsername)
      .setDesc(s.settingUsernameDesc)
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
      .setName(s.settingToken)
      .setDesc(s.settingTokenDesc)
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
      .setName(s.settingAutoPullOnOpen)
      .setDesc(s.settingAutoPullOnOpenDesc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoPullOnOpen)
          .onChange(async (value) => {
            this.plugin.settings.autoPullOnOpen = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(s.settingAutoPullInterval)
      .setDesc(s.settingAutoPullIntervalDesc)
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
