import { BasePathAdapter } from "./base";
import { remoteAPI } from "../utils/api";

export class GithubPathAdapter extends BasePathAdapter {
  async getViewInfo(): Promise<RemoteView | undefined> {
    const parsedUrl = this.parseUrl();
    const isPageIgnored = this.isPageIgnored();

    if (!parsedUrl || isPageIgnored) {
      return undefined;
    }

    const { user, name, type, pullRequestId, commitId, shaInUrl } = parsedUrl;
    const refs = await this.getHeadAndBase(
      user,
      name,
      type,
      pullRequestId,
      commitId,
      shaInUrl
    );

    if (!!refs) {
      return {
        type,
        head: refs.head,
        base: refs.base,
        pullRequestId,
        filePath: this.getFilePath(),
        isPrivate: this.getIsPrivate()
      };
    }
  }

  private parseUrl() {
    if (window.location.hostname !== "github.com") {
      return undefined;
    }

    // (username)/(reponame)[/(type)][/(typeId)][/(filePath)]
    const match = window.location.pathname.match(
      /([^\/]+)\/([^\/]+)(?:\/([^\/]+))?(?:\/([^\/]+))?/
    );

    if (!match) {
      return undefined;
    }

    const user = match[1];
    const name = match[2];
    const type = match[3];

    if (
      ~GH_RESERVED_USER_NAMES.indexOf(user) ||
      ~GH_RESERVED_REPO_NAMES.indexOf(name)
    ) {
      return undefined;
    }

    if (~GH_RESERVED_SUB_PAGES.indexOf(type)) {
      return undefined;
    }

    // Check if this is a Tree/Blob view
    const isFileView = type === undefined || type === "tree" || type === "blob";
    const finalType = <ViewType>(isFileView ? "file" : type);
    const pullRequestId = finalType === "pull" ? match[4] : undefined;
    const commitId = finalType === "commit" ? match[4] : undefined;
    const shaInUrl = finalType === "file" ? match[4] : undefined;

    return {
      user,
      name,
      type: finalType,
      pullRequestId,
      commitId,
      shaInUrl
    };
  }

  private isPageIgnored() {
    // This method applies some conditions to see if the page should be skipped
    // Reference: https://github.com/buunguyen/octotree/blob/master/src/adapters/github.js
    if (document.querySelector(GH_404_SEL) != null) {
      return true; // this is a 404 page
    }

    if (document.querySelector(GH_RAW_CONTENT) != null) {
      return true; // raw content page
    }

    if (document.querySelector(GH_AUTH_FORM_SEL) != null) {
      return true; // login page
    }

    return false;
  }

  private getIsPrivate() {
    const labelElement = document.querySelector("span.Label.Label--outline");
    return !!labelElement ? labelElement.textContent === "Private" : false;
  }

  private getFilePath() {
    const pathElement = document.getElementById("blob-path");

    if (!!pathElement && !!pathElement.textContent) {
      const fullPath = pathElement.textContent.trim();
      const firstSlashIndex = fullPath.indexOf("/");
      return fullPath.slice(firstSlashIndex + 1);
    }

    return undefined;
  }

  private getBranchName() {
    // Get branch by inspecting page, quite fragile so provide multiple fallbacks
    // From https://github.com/buunguyen/octotree/blob/master/src/adapters/github.js#L116
    // There are some more handled cases in Octotree
    const codePageSelector = document.querySelector(
      ".branch-select-menu .select-menu-item.selected"
    );
    let codePageBranch;

    if (codePageSelector !== null) {
      codePageBranch = codePageSelector.getAttribute("data-name");
    }

    const prPageSelector = document.querySelector(".commit-ref.base-ref");
    let prPageBranch;

    if (prPageSelector !== null) {
      const prPageTitle = prPageSelector.getAttribute("title");

      if (!!prPageTitle) {
        // title looks like org-name/repo-name:branch-name
        const match = prPageTitle.match(/(.+)\/(.+):(.+)/);

        if (!!match && match.length >= 3) {
          prPageBranch = match[3];
        }
      }
    }

    const branchMenuDiv = document.querySelector(".branch-select-menu");
    let menuBranch;

    if (!!branchMenuDiv) {
      const buttonElement = branchMenuDiv.querySelector(
        "button.select-menu-button"
      );

      if (!!buttonElement && buttonElement.textContent) {
        const label = buttonElement.textContent.trim().toLowerCase();
        const innerSpan = branchMenuDiv.querySelector("span.js-select-button");

        if (!!innerSpan && label.startsWith("branch")) {
          menuBranch = innerSpan.textContent;
        }
      }
    }

    return codePageBranch || prPageBranch || menuBranch;
  }

  private async getHeadAndBase(
    owner: string,
    name: string,
    type: ViewType,
    pullRequestId,
    commitId,
    shaInUrl
  ): Promise<{ base?: RepoReference; head: RepoReference } | undefined> {
    switch (type) {
      case ViewType.Commit:
        return this.getCommitRefs(owner, name, commitId);
      case ViewType.Compare:
        // TODO: add support for compare
        // return this.getCompareRefs(owner, name);
        throw new Error(`compare page not supported.`);
      case ViewType.PR:
        return this.getPullRefs(owner, name, pullRequestId);
      case ViewType.File:
        return this.getFileRefs(owner, name, shaInUrl);
    }
  }

  private async getCompareRefs(owner: string, name: string) {
    let base, head;

    const compareElements = Array.from(
      document.querySelectorAll("div.range-cross-repo-pair")
    );
    compareElements.forEach(element => {
      const branchElement = element.querySelector(
        "div.commitish-suggester span.js-select-button"
      );
      const repoElement = element.querySelector(
        "div.fork-suggester span.js-select-button"
      );
    });
  }

  private async getFileRefs(owner: string, name: string, shaInUrl: string) {
    const branchName = this.getBranchName();
    let head: RepoReference;

    if (!!branchName) {
      head = await remoteAPI.getBranchv2(owner, name, branchName);
    } else {
      head = {
        user: owner,
        name,
        sha: shaInUrl,
        service: "github"
      };
    }

    return {
      head,
      base: undefined
    };
  }

  private async getCommitRefs(owner, name, commitSha) {
    return await remoteAPI.getCommitInfov2(owner, name, commitSha);
  }

  private async getPullRefs(owner, name, pullRequestId) {
    return await remoteAPI.getPRInfov2(owner, name, pullRequestId);
  }

  constructFullPath(filePath: string, repo: RepoReference): string {
    const { user, name, branch } = repo;
    return `/${user}/${name}/blob/${branch}/${filePath}`;
  }
}

// prettier-ignore
const GH_RESERVED_USER_NAMES = [ // These cannot be usernames
      'settings', 'orgs', 'organizations',
      'site', 'blog', 'about', 'explore',
      'styleguide', 'showcases', 'trending',
      'stars', 'dashboard', 'notifications',
      'search', 'developer', 'account',
      'pulls', 'issues', 'features', 'contact',
      'security', 'join', 'login', 'watching',
      'new', 'integrations', 'gist', 'business',
      'mirrors', 'open-source', 'personal',
      'pricing', 'marketplace', 'apps', 'topics'
    ]
const GH_RESERVED_REPO_NAMES = ["followers", "following", "repositories"];
const GH_RESERVED_SUB_PAGES = [
  "notifications",
  "graphs",
  "network",
  "settings",
  "pulse",
  "wiki",
  "projects",
  "stargazers",
  "issues"
];
const GH_404_SEL = "#parallax_wrapper";
const GH_AUTH_FORM_SEL = ".auth-form-body";
const GH_RAW_CONTENT = "body > pre";
