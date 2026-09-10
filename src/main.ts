import { App, ItemView, Menu, Modal, Notice, Plugin, PluginSettingTab, Setting, Platform, WorkspaceLeaf, requestUrl } from "obsidian";
import { Buffer as BufferPolyfill } from "buffer";
import git, { GitAuth } from "isomorphic-git";

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = BufferPolyfill;
}

const VIEW_TYPE = "simple-git-view";

type Lang = "en" | "zh";

interface Strings {
  menuPull: string;
  menuForcePull: string;
  menuCommitPush: string;
  menuSourceControl: string;
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
  noticeCloneOk: string;
  noticeRepoMissing: string;
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
  viewTitle: string;
  viewRefresh: string;
  viewCommit: string;
  viewCommitPush: string;
  viewNoChanges: string;
  viewCommitPlaceholder: string;
  viewModified: string;
  viewAdded: string;
  viewDeleted: string;
  viewScanning: string;
  viewCommitting: string;
  viewRebuildIndex: string;
  viewIndexCorrupt: string;
  viewUnstagedChanges: string;
  viewStagedChanges: string;
  viewSelectAll: string;
  viewStageSelected: string;
  viewUnstageSelected: string;
  viewStage: string;
  viewUnstage: string;
  viewNothingStaged: string;
  noticeRebuildIndexOk: string;
  noticeRebuildIndexFail: (m: string) => string;
  noticeNothingStaged: string;
  menuRebuildIndex: string;
  settingDefaultCommitMessage: string;
  settingDefaultCommitMessageDesc: string;
}

const STRINGS: Record<Lang, Strings> = {
  en: {
    menuPull: "Pull",
    menuForcePull: "Force pull (discard local changes)",
    menuCommitPush: "Commit all and push",
    menuSourceControl: "Source Control",
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
    noticeCloneOk: "Simple Git: Repository initialized and pulled. Restart Obsidian to refresh the vault.",
    noticeRepoMissing: "This vault is not initialized. Run Pull first.",
    noticeNoRemote: "Remote URL not set. Please configure in plugin settings.",
    noticeLoadFail: (m) => `Simple Git: Failed to load - ${m}`,
    settingsTitle: "Simple Git Sync Settings",
    settingLanguage: "Language",
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
    viewTitle: "Source Control",
    viewRefresh: "Refresh",
    viewCommit: "Commit",
    viewCommitPush: "Commit & Push",
    viewNoChanges: "No changes detected",
    viewCommitPlaceholder: "Commit message (optional)",
    viewModified: "Modified",
    viewAdded: "Added",
    viewDeleted: "Deleted",
    viewScanning: "Scanning for changes...",
    viewCommitting: "Committing and pushing...",
    viewRebuildIndex: "Rebuild index",
    viewIndexCorrupt: "Git index is corrupted. Click below to rebuild.",
    viewUnstagedChanges: "Unstaged Changes",
    viewStagedChanges: "Staged Changes",
    viewSelectAll: "Select All",
    viewStageSelected: "Stage",
    viewUnstageSelected: "Unstage",
    viewStage: "Stage",
    viewUnstage: "Unstage",
    viewNothingStaged: "No files staged",
    noticeRebuildIndexOk: "Simple Git: Index rebuilt successfully",
    noticeRebuildIndexFail: (m) => `Simple Git: Rebuild index failed - ${m}`,
    noticeNothingStaged: "Simple Git: No files staged. Stage files first.",
    menuRebuildIndex: "Rebuild git index",
    settingDefaultCommitMessage: "Default commit message",
    settingDefaultCommitMessageDesc: "Default message used when committing. Can be overridden in the sidebar.",
  },
  zh: {
    menuPull: "\u62c9\u53d6",
    menuForcePull: "\u5f3a\u5236\u62c9\u53d6\uff08\u4e22\u5f03\u672c\u5730\u4fee\u6539\uff09",
    menuCommitPush: "\u63d0\u4ea4\u5168\u90e8\u5e76\u63a8\u9001",
    menuSourceControl: "\u6e90\u4ee3\u7801\u7ba1\u7406",
    confirmForcePullTitle: "\u5f3a\u5236\u62c9\u53d6",
    confirmForcePullMessage:
      "\u5c06\u4e22\u5f03\u6240\u6709\u672a\u63d0\u4ea4\u7684\u672c\u5730\u4fee\u6539\uff0c\u628a\u4ed3\u5e93\u91cd\u7f6e\u4e3a\u8fdc\u7a0b\u72b6\u6001\u3002\u672a\u540c\u6b65\u7684\u6539\u52a8\u4f1a\u4e22\u5931\u3002\u786e\u5b9a\u7ee7\u7eed\u5417\uff1f",
    confirmCancel: "\u53d6\u6d88",
    confirmDiscardAndPull: "\u4e22\u5f03\u5e76\u62c9\u53d6",
    noticePullOk: "Simple Git\uff1a\u62c9\u53d6\u6210\u529f",
    noticePullFail: (m) => `Simple Git\uff1a\u62c9\u53d6\u5931\u8d25 - ${m}`,
    noticeForcePullOk: (b) => `Simple Git\uff1a\u5df2\u5f3a\u5236\u62c9\u53d6\uff08\u91cd\u7f6e\u5230 origin/${b}\uff09`,
    noticeForcePullFail: (m) => `Simple Git\uff1a\u5f3a\u5236\u62c9\u53d6\u5931\u8d25 - ${m}`,
    noticeNothingToCommit: "Simple Git\uff1a\u6ca1\u6709\u53ef\u63d0\u4ea4\u7684\u5185\u5bb9",
    noticeCommitPushOk: (n) => `Simple Git\uff1a\u5df2\u63d0\u4ea4 ${n} \u4e2a\u6587\u4ef6\u5e76\u63a8\u9001`,
    noticeCommitPushFail: (m) => `Simple Git\uff1a\u63d0\u4ea4/\u63a8\u9001\u5931\u8d25 - ${m}`,
    noticeCloneOk: "Simple Git\uff1a\u5df2\u81ea\u52a8\u521d\u59cb\u5316\u5e76\u62c9\u53d6\u3002\u8bf7\u91cd\u542f Obsidian \u4ee5\u5237\u65b0\u4ed3\u5e93\u3002",
    noticeRepoMissing: "\u5f53\u524d\u4ed3\u5e93\u5c1a\u672a\u521d\u59cb\u5316\uff0c\u8bf7\u5148\u6267\u884c\u62c9\u53d6\u3002",
    noticeNoRemote: "\u5c1a\u672a\u8bbe\u7f6e\u8fdc\u7a0b\u4ed3\u5e93\u5730\u5740\uff0c\u8bf7\u5728\u63d2\u4ef6\u8bbe\u7f6e\u4e2d\u914d\u7f6e\u3002",
    noticeLoadFail: (m) => `Simple Git\uff1a\u52a0\u8f7d\u5931\u8d25 - ${m}`,
    settingsTitle: "Simple Git Sync \u8bbe\u7f6e",
    settingLanguage: "\u8bed\u8a00",
    settingLanguageDesc: "\u63d2\u4ef6\u754c\u9762\u663e\u793a\u8bed\u8a00",
    settingRemoteUrl: "\u8fdc\u7a0b\u4ed3\u5e93\u5730\u5740",
    settingRemoteUrlDesc: "GitHub \u4ed3\u5e93\u7684 HTTPS \u5730\u5740",
    settingUsername: "\u7528\u6237\u540d",
    settingUsernameDesc: "\u4f60\u7684 GitHub \u7528\u6237\u540d",
    settingToken: "\u4ee4\u724c / \u5bc6\u7801",
    settingTokenDesc: "GitHub \u4e2a\u4eba\u8bbf\u95ee\u4ee4\u724c\uff08PAT\uff09",
    settingAutoPullOnOpen: "\u6253\u5f00\u65f6\u81ea\u52a8\u62c9\u53d6",
    settingAutoPullOnOpenDesc: "\u6253\u5f00\u4ed3\u5e93\u65f6\u81ea\u52a8\u6267\u884c\u62c9\u53d6",
    settingAutoPullInterval: "\u81ea\u52a8\u62c9\u53d6\u95f4\u9694\uff08\u5206\u949f\uff09",
    settingAutoPullIntervalDesc: "0 = \u5173\u95ed\u3002\u6309\u6b64\u95f4\u9694\u81ea\u52a8\u62c9\u53d6\u3002",
    viewTitle: "\u6e90\u4ee3\u7801\u7ba1\u7406",
    viewRefresh: "\u5237\u65b0",
    viewCommit: "\u63d0\u4ea4",
    viewCommitPush: "\u63d0\u4ea4\u5e76\u63a8\u9001",
    viewNoChanges: "\u672a\u68c0\u6d4b\u5230\u6539\u52a8",
    viewCommitPlaceholder: "\u63d0\u4ea4\u4fe1\u606f\uff08\u53ef\u9009\uff09",
    viewModified: "\u5df2\u4fee\u6539",
    viewAdded: "\u5df2\u6dfb\u52a0",
    viewDeleted: "\u5df2\u5220\u9664",
    viewScanning: "\u6b63\u5728\u626b\u63cf\u6539\u52a8...",
    viewCommitting: "\u6b63\u5728\u63d0\u4ea4\u5e76\u63a8\u9001...",
    viewRebuildIndex: "\u91cd\u5efa\u7d22\u5f15",
    viewIndexCorrupt: "Git \u7d22\u5f15\u5df2\u635f\u574f\uff0c\u70b9\u51fb\u4e0b\u65b9\u91cd\u5efa\u3002",
    viewUnstagedChanges: "\u672a\u6682\u5b58\u7684\u66f4\u6539",
    viewStagedChanges: "\u5df2\u6682\u5b58\u7684\u66f4\u6539",
    viewSelectAll: "\u5168\u9009",
    viewStageSelected: "\u6682\u5b58",
    viewUnstageSelected: "\u53d6\u6d88\u6682\u5b58",
    viewStage: "\u6682\u5b58",
    viewUnstage: "\u53d6\u6d88\u6682\u5b58",
    viewNothingStaged: "\u6ca1\u6709\u5df2\u6682\u5b58\u7684\u6587\u4ef6",
    noticeRebuildIndexOk: "Simple Git\uff1a\u7d22\u5f15\u5df2\u91cd\u5efa",
    noticeRebuildIndexFail: (m) => `Simple Git\uff1a\u91cd\u5efa\u7d22\u5f15\u5931\u8d25 - ${m}`,
    noticeNothingStaged: "Simple Git\uff1a\u6ca1\u6709\u5df2\u6682\u5b58\u7684\u6587\u4ef6\uff0c\u8bf7\u5148\u6682\u5b58\u6587\u4ef6\u3002",
    menuRebuildIndex: "\u91cd\u5efa git \u7d22\u5f15",
    settingDefaultCommitMessage: "\u9ed8\u8ba4\u63d0\u4ea4\u4fe1\u606f",
    settingDefaultCommitMessageDesc: "\u63d0\u4ea4\u65f6\u7684\u9ed8\u8ba4\u4fe1\u606f\uff0c\u53ef\u5728\u4fa7\u680f\u4fee\u6539",
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
  },
};

export class ObsidianFsAdapter {
  private adapter: any;
  promises: any;

  constructor(adapter: any) {
    this.adapter = adapter;

    const toRelativePath = (filepath: string): string => {
      const normalized = filepath
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/\/$/, "");
      if (normalized === ".") return "";
      return normalized.replace(/^\.\//, "");
    };

    const basename = (filepath: string): string => {
      const normalized = filepath.replace(/\\/g, "/").replace(/\/$/, "");
      return normalized.slice(normalized.lastIndexOf("/") + 1);
    };

    this.promises = {
      readFile: async (
        filepath: string,
        options?: { encoding?: string } | string
      ): Promise<string | Uint8Array> => {
        const relativePath = toRelativePath(filepath);
        const encoding = typeof options === "string" ? options : options?.encoding;
        if (encoding === "utf8" || encoding === "utf-8") {
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
          const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
          await this.adapter.writeBinary(relativePath, new Uint8Array(bytes).buffer);
        }
      },

      readdir: async (filepath: string): Promise<string[]> => {
        const relativePath = toRelativePath(filepath);
        const listed = await this.adapter.list(relativePath);
        return [...listed.files, ...listed.folders].map(basename);
      },

      mkdir: async (filepath: string): Promise<void> => {
        const relativePath = toRelativePath(filepath);
        if (!relativePath || await this.adapter.exists(relativePath)) return;
        await this.adapter.mkdir(relativePath);
      },

      rmdir: async (filepath: string, options?: { recursive?: boolean }): Promise<void> => {
        const relativePath = toRelativePath(filepath);
        await this.adapter.rmdir(relativePath, options?.recursive === true);
      },

      stat: async (filepath: string): Promise<any> => {
        const relativePath = toRelativePath(filepath);
        if (!relativePath) {
          return {
            isDirectory: () => true,
            isFile: () => false,
            isSymbolicLink: () => false,
            size: 0,
            mtimeMs: 0,
            ctimeMs: 0,
            mtime: new Date(0),
            ctime: new Date(0),
            mode: 0o755,
            dev: 0,
            ino: 0,
            uid: 0,
            gid: 0,
            nlink: 1,
          };
        }
        const exists = await this.adapter.exists(relativePath);
        if (!exists) {
          const err: any = new Error("ENOENT: no such file or directory");
          err.code = "ENOENT";
          throw err;
        }
        const stats = await this.adapter.stat(relativePath);
        const isDir = stats?.type === "folder";
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
          mode: isDir ? 0o755 : 0o644,
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
        await this.adapter.remove(relativePath);
      },

      rm: async (filepath: string): Promise<void> => {
        const relativePath = toRelativePath(filepath);
        await this.adapter.remove(relativePath);
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
  defaultCommitMessage: string;
}

const DEFAULT_SETTINGS: SimpleGitSettings = {
  remoteUrl: "",
  username: "",
  token: "",
  autoPullOnOpen: false,
  autoPullInterval: 0,
  language: "en",
  defaultCommitMessage: "vault backup",
};

export interface ChangedFile {
  path: string;
  status: "modified" | "added" | "deleted";
  staged: boolean;
}

export default class SimpleGitSyncPlugin extends Plugin {
  settings: SimpleGitSettings;
  private autoPullTimer: number | null = null;
  stagedFiles: Set<string> = new Set();

  get strings(): Strings {
    return STRINGS[this.settings.language] || STRINGS.en;
  }

  async onload() {
    try {
      await this.loadSettings();

      this.registerView(VIEW_TYPE, (leaf) => new SimpleGitView(leaf, this));

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
        id: "simple-git-source-control",
        name: "Open source control view",
        callback: () => this.activateView(),
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

  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = Platform.isMobile
      ? this.app.workspace.getLeftLeaf(false)
      : this.app.workspace.getRightLeaf(false);

    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  private getDir(): string {
    return "/";
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

  private async ensureRepository(): Promise<void> {
    if (!await this.app.vault.adapter.exists(".git")) {
      throw new Error(this.strings.noticeRepoMissing);
    }
  }

  private getFs(): ObsidianFsAdapter {
    return new ObsidianFsAdapter(this.app.vault.adapter);
  }

  private async hasUsableRepository(): Promise<boolean> {
    if (!await this.app.vault.adapter.exists(".git")) return false;
    try {
      await git.resolveRef({ fs: this.getFs(), dir: this.getDir(), ref: "HEAD" });
      return true;
    } catch {
      return false;
    }
  }

  private async removeGitDirectory(): Promise<void> {
    if (await this.app.vault.adapter.exists(".git")) {
      await this.app.vault.adapter.rmdir(".git", true);
    }
  }

  async getChangedFiles(): Promise<ChangedFile[]> {
    const status = await git.statusMatrix({
      fs: this.getFs(),
      dir: this.getDir(),
    });

    const changed: ChangedFile[] = [];
    for (const [filepath, head, workdir] of status) {
      if (head === workdir) continue;
      let statusType: "modified" | "added" | "deleted";
      if (head === 0) {
        statusType = "added";
      } else if (workdir === 0) {
        statusType = "deleted";
      } else {
        statusType = "modified";
      }
      changed.push({ path: filepath, status: statusType, staged: this.stagedFiles.has(filepath) });
    }
    return changed;
  }

  async stageFile(filepath: string) {
    const fs = this.getFs();
    const dir = this.getDir();
    await git.add({ fs, dir, filepath });
    this.stagedFiles.add(filepath);
  }

  async unstageFile(filepath: string) {
    const fs = this.getFs();
    const dir = this.getDir();
    await git.remove({ fs, dir, filepath });
    this.stagedFiles.delete(filepath);
  }

  async stageAll(files: ChangedFile[]) {
    for (const f of files) {
      await this.stageFile(f.path);
    }
  }

  async unstageAll(files: ChangedFile[]) {
    for (const f of files) {
      await this.unstageFile(f.path);
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
        .setTitle(s.menuSourceControl)
        .setIcon("git-commit")
        .onClick(() => this.activateView())
    );
    menu.addItem((item) =>
      item
        .setTitle(s.menuCommitPush)
        .setIcon("upload")
        .onClick(() => this.doCommitPush())
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle(s.menuRebuildIndex)
        .setIcon("wrench")
        .onClick(() => this.rebuildIndex())
    );
    menu.showAtMouseEvent(evt);
  }

  private async cloneIntoVault(): Promise<void> {
    if (!this.settings.remoteUrl) {
      throw new Error(this.strings.noticeNoRemote);
    }

    if (await this.app.vault.adapter.exists(".git")) {
      await this.removeGitDirectory();
    }

    try {
      const fs = this.getFs();
      const dir = this.getDir();
      await git.clone({
        fs,
        http,
        dir,
        url: this.settings.remoteUrl,
        singleBranch: true,
        noTags: true,
        onAuth: () => this.getAuth(),
        nonBlocking: !Platform.isDesktop,
        batchSize: 50,
      });

      const username = this.settings.username || "user";
      await git.setConfig({ fs, dir, path: "user.name", value: username });
      await git.setConfig({ fs, dir, path: "user.email", value: `${username}@local` });
    } catch (error) {
      try {
        await this.removeGitDirectory();
      } catch (cleanupError) {
        console.error("Simple Git clone cleanup failed:", cleanupError);
      }
      throw error;
    }
  }

  async doPull() {
    try {
      if (!await this.hasUsableRepository()) {
        await this.cloneIntoVault();
        new Notice(this.strings.noticeCloneOk, 10000);
        return;
      }
      await this.ensureRemote();
      await git.pull({
        fs: this.getFs(),
        http,
        dir: this.getDir(),
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
      await this.ensureRepository();
      await this.ensureRemote();
      const fs = this.getFs();
      const dir = this.getDir();
      await git.fetch({
        fs,
        http,
        dir,
        remote: "origin",
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
      await this.ensureRepository();
      await this.ensureRemote();

      const changedFiles = await this.getChangedFiles();

      if (changedFiles.length === 0) {
        new Notice(this.strings.noticeNothingToCommit);
        return;
      }

      const fs = this.getFs();
      const dir = this.getDir();

      for (const file of changedFiles) {
        if (file.status === "deleted") {
          await git.remove({ fs, dir, filepath: file.path });
        } else {
          await git.add({ fs, dir, filepath: file.path });
        }
      }

      const now = new Date();
      const timestamp = now.toISOString().replace("T", " ").slice(0, 19);
      await git.commit({
        fs,
        dir,
        message: `vault backup: ${timestamp}`,
        author: {
          name: this.settings.username || "user",
          email: "user@local",
        },
      });

      await git.push({
        fs,
        http,
        dir,
        onAuth: () => this.getAuth(),
      });

      new Notice(this.strings.noticeCommitPushOk(changedFiles.length));
    } catch (e: any) {
      console.error("Simple Git Commit/Push Error:", e);
      new Notice(this.strings.noticeCommitPushFail(e.message));
    }
  }

  async doCommitPushWithMessage(message: string) {
    try {
      await this.ensureRepository();
      await this.ensureRemote();

      const stagedFiles = Array.from(this.stagedFiles);

      if (stagedFiles.length === 0) {
        new Notice(this.strings.noticeNothingStaged);
        return;
      }

      const fs = this.getFs();
      const dir = this.getDir();

      const commitMessage = message.trim() || this.settings.defaultCommitMessage || (() => {
        const now = new Date();
        return `vault backup: ${now.toISOString().replace("T", " ").slice(0, 19)}`;
      })();

      await git.commit({
        fs,
        dir,
        message: commitMessage,
        author: {
          name: this.settings.username || "user",
          email: "user@local",
        },
      });

      await git.push({
        fs,
        http,
        dir,
        onAuth: () => this.getAuth(),
      });

      this.stagedFiles.clear();
      new Notice(this.strings.noticeCommitPushOk(stagedFiles.length));
    } catch (e: any) {
      console.error("Simple Git Commit/Push Error:", e);
      new Notice(this.strings.noticeCommitPushFail(e.message));
    }
  }

  async rebuildIndex() {
    try {
      await this.ensureRepository();
      const indexPath = ".git/index";
      if (await this.app.vault.adapter.exists(indexPath)) {
        await this.app.vault.adapter.remove(indexPath);
      }
      new Notice(this.strings.noticeRebuildIndexOk);
    } catch (e: any) {
      console.error("Simple Git Rebuild Index Error:", e);
      new Notice(this.strings.noticeRebuildIndexFail(e.message));
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class SimpleGitView extends ItemView {
  private plugin: SimpleGitSyncPlugin;
  private unstagedListEl: HTMLElement;
  private stagedListEl: HTMLElement;
  private selectUnstagedBtnEl: HTMLButtonElement;
  private stageBtnEl: HTMLButtonElement;
  private selectStagedBtnEl: HTMLButtonElement;
  private unstageBtnEl: HTMLButtonElement;
  private commitInputEl: HTMLTextAreaElement;
  private commitBtnEl: HTMLButtonElement;
  private refreshBtnEl: HTMLButtonElement;
  private errorEl: HTMLElement;
  private selectedFiles: Set<string> = new Set();

  constructor(leaf: WorkspaceLeaf, plugin: SimpleGitSyncPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.plugin.strings.viewTitle;
  }

  getIcon(): string {
    return "git-commit";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.classList.add("simple-git-view");

    const header = container.createDiv("simple-git-header");
    header.createEl("h4", { text: this.plugin.strings.viewTitle });

    const headerActions = header.createDiv("simple-git-header-actions");
    this.refreshBtnEl = headerActions.createEl("button", { cls: "simple-git-btn" });
    this.refreshBtnEl.innerHTML = '<svg viewBox="0 0 100 100" width="16" height="16"><path d="M50 10a40 40 0 1 0 40 40h-10a30 30 0 1 1-30-30v20l30-25-30-25v20z" fill="currentColor"/></svg>';
    this.refreshBtnEl.title = this.plugin.strings.viewRefresh;
    this.refreshBtnEl.onclick = () => this.refresh();

    const body = container.createDiv("simple-git-body");

    const unstagedSection = body.createDiv("simple-git-section");
    const unstagedHeader = unstagedSection.createDiv("simple-git-section-header");
    unstagedHeader.createEl("span", { text: this.plugin.strings.viewUnstagedChanges, cls: "simple-git-section-title" });
    const unstagedActions = unstagedHeader.createDiv("simple-git-section-actions");
    this.selectUnstagedBtnEl = unstagedActions.createEl("button", { text: this.plugin.strings.viewSelectAll, cls: "simple-git-section-btn" });
    this.selectUnstagedBtnEl.onclick = () => this.toggleSelectAll(false);
    this.stageBtnEl = unstagedActions.createEl("button", { text: this.plugin.strings.viewStageSelected, cls: "simple-git-section-btn mod-cta" });
    this.stageBtnEl.onclick = () => this.doStageSelected();
    this.unstagedListEl = unstagedSection.createDiv("simple-git-file-list");

    const stagedSection = body.createDiv("simple-git-section");
    const stagedHeader = stagedSection.createDiv("simple-git-section-header");
    stagedHeader.createEl("span", { text: this.plugin.strings.viewStagedChanges, cls: "simple-git-section-title" });
    const stagedActions = stagedHeader.createDiv("simple-git-section-actions");
    this.selectStagedBtnEl = stagedActions.createEl("button", { text: this.plugin.strings.viewSelectAll, cls: "simple-git-section-btn" });
    this.selectStagedBtnEl.onclick = () => this.toggleSelectAll(true);
    this.unstageBtnEl = stagedActions.createEl("button", { text: this.plugin.strings.viewUnstageSelected, cls: "simple-git-section-btn mod-warning" });
    this.unstageBtnEl.onclick = () => this.doUnstageSelected();
    this.stagedListEl = stagedSection.createDiv("simple-git-file-list");

    this.errorEl = body.createDiv("simple-git-error-area");

    const footer = container.createDiv("simple-git-footer");
    this.commitInputEl = footer.createEl("textarea", {
      cls: "simple-git-commit-input",
      attr: { placeholder: this.plugin.settings.defaultCommitMessage || this.plugin.strings.viewCommitPlaceholder, rows: "2" },
    });

    this.commitBtnEl = footer.createEl("button", {
      text: this.plugin.strings.viewCommitPush,
      cls: "mod-cta simple-git-commit-btn",
    });
    this.commitBtnEl.onclick = () => this.doCommit();

    await this.refresh();
  }

  async onClose() {}

  async refresh() {
    const s = this.plugin.strings;
    this.unstagedListEl.empty();
    this.stagedListEl.empty();
    this.errorEl.empty();

    this.commitInputEl.setAttribute("placeholder", this.plugin.settings.defaultCommitMessage || s.viewCommitPlaceholder);

    try {
      const changed = await this.plugin.getChangedFiles();
      const unstaged = changed.filter((f) => !f.staged);
      const staged = changed.filter((f) => f.staged);

      const unstagedSelected = unstaged.filter((f) => this.selectedFiles.has(f.path));
      const stagedSelected = staged.filter((f) => this.selectedFiles.has(f.path));

      this.selectUnstagedBtnEl.textContent = unstagedSelected.length === unstaged.length && unstaged.length > 0
        ? s.viewSelectAll
        : s.viewSelectAll;
      this.selectStagedBtnEl.textContent = s.viewSelectAll;

      this.stageBtnEl.disabled = unstagedSelected.length === 0;
      this.unstageBtnEl.disabled = stagedSelected.length === 0;

      if (unstaged.length === 0) {
        this.unstagedListEl.createEl("div", { text: s.viewNoChanges, cls: "simple-git-empty" });
      } else {
        for (const file of unstaged) {
          this.createFileRow(this.unstagedListEl, file, false);
        }
      }

      if (staged.length === 0) {
        this.stagedListEl.createEl("div", { text: s.viewNothingStaged, cls: "simple-git-empty" });
      } else {
        for (const file of staged) {
          this.createFileRow(this.stagedListEl, file, true);
        }
      }

      this.commitBtnEl.disabled = staged.length === 0;
    } catch (e: any) {
      const isIndexError = e.message && (
        e.message.includes("dircache") ||
        e.message.includes("Invalid dircache") ||
        e.message.includes("index")
      );
      if (isIndexError) {
        this.errorEl.createEl("div", { text: s.viewIndexCorrupt, cls: "simple-git-error" });
        const rebuildBtn = this.errorEl.createEl("button", { text: s.viewRebuildIndex, cls: "simple-git-rebuild-btn" });
        rebuildBtn.onclick = async () => {
          await this.plugin.rebuildIndex();
          await this.refresh();
        };
      } else {
        this.errorEl.createEl("div", { text: `Error: ${e.message}`, cls: "simple-git-error" });
      }
    }
  }

  private createFileRow(container: HTMLElement, file: ChangedFile, isStaged: boolean) {
    const row = container.createDiv("simple-git-file");
    const isSelected = this.selectedFiles.has(file.path);
    if (isSelected) row.classList.add("simple-git-file-selected");

    const statusClass = file.status === "modified" ? "modified" : file.status === "added" ? "added" : "deleted";
    const statusLabel = file.status === "modified" ? this.plugin.strings.viewModified[0]
      : file.status === "added" ? this.plugin.strings.viewAdded[0]
      : this.plugin.strings.viewDeleted[0];

    row.createSpan({ text: statusLabel, cls: `simple-git-file-status ${statusClass}` });
    row.createSpan({ text: file.path, cls: "simple-git-file-path" });

    row.onclick = () => {
      if (this.selectedFiles.has(file.path)) {
        this.selectedFiles.delete(file.path);
      } else {
        this.selectedFiles.add(file.path);
      }
      this.refresh();
    };
  }

  private toggleSelectAll(isStagedSection: boolean) {
    const allFiles = isStagedSection
      ? Array.from(this.plugin.stagedFiles)
      : [];

    if (!isStagedSection) {
      // Get all unstaged files
      const allChanged = Array.from(this.plugin.stagedFiles);
      // We need to get unstaged files - get all changed and filter
      this.plugin.getChangedFiles().then((changed) => {
        const unstaged = changed.filter((f) => !f.staged);
        const allSelected = unstaged.every((f) => this.selectedFiles.has(f.path));
        if (allSelected) {
          unstaged.forEach((f) => this.selectedFiles.delete(f.path));
        } else {
          unstaged.forEach((f) => this.selectedFiles.add(f.path));
        }
        this.refresh();
      });
    } else {
      const allSelected = allFiles.every((f) => this.selectedFiles.has(f));
      if (allSelected) {
        allFiles.forEach((f) => this.selectedFiles.delete(f));
      } else {
        allFiles.forEach((f) => this.selectedFiles.add(f));
      }
      this.refresh();
    }
  }

  private async doStageSelected() {
    const changed = await this.plugin.getChangedFiles();
    const unstaged = changed.filter((f) => !f.staged && this.selectedFiles.has(f.path));
    for (const f of unstaged) {
      await this.plugin.stageFile(f.path);
      this.selectedFiles.delete(f.path);
    }
    await this.refresh();
  }

  private async doUnstageSelected() {
    const changed = await this.plugin.getChangedFiles();
    const staged = changed.filter((f) => f.staged && this.selectedFiles.has(f.path));
    for (const f of staged) {
      await this.plugin.unstageFile(f.path);
      this.selectedFiles.delete(f.path);
    }
    await this.refresh();
  }

  private async doCommit() {
    const s = this.plugin.strings;
    const message = this.commitInputEl.value;

    this.commitBtnEl.disabled = true;
    this.commitBtnEl.textContent = s.viewCommitting;

    try {
      await this.plugin.doCommitPushWithMessage(message);
      this.commitInputEl.value = "";
      this.selectedFiles.clear();
      await this.refresh();
    } finally {
      this.commitBtnEl.disabled = false;
      this.commitBtnEl.textContent = s.viewCommitPush;
    }
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
        drop.addOption("zh", "\u4e2d\u6587");
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

    new Setting(containerEl)
      .setName(s.settingDefaultCommitMessage)
      .setDesc(s.settingDefaultCommitMessageDesc)
      .addText((text) =>
        text
          .setPlaceholder("vault backup")
          .setValue(this.plugin.settings.defaultCommitMessage)
          .onChange(async (value) => {
            this.plugin.settings.defaultCommitMessage = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
