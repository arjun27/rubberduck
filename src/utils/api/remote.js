import parse from "what-the-diff";
import Raven from "raven-js";
import { getGitService, treeAdapter } from "../../adapters";

let GithubAPI = {
  getRemoteUsername(decoded) {
    return decoded.github_username;
  },

  getPassthroughPath() {
    return `github_passthrough/`;
  },

  buildUrl(path) {
    return `https://api.github.com/${path}`;
  },

  getPrivateErrorCodes() {
    return [401, 404];
  },

  getFilesTree(repoDetails) {
    const { username, reponame, branch, isPrivate } = repoDetails;
    const nonNullBranch = branch || "master"; // TODO(arjun): check for default branch
    const uriPath = `repos/${username}/${reponame}/git/trees/${nonNullBranch}?recursive=1`;
    return this.makeConditionalGet(uriPath, isPrivate);
  },

  getPRFiles(repoDetails) {
    const { username, reponame, prId, isPrivate } = repoDetails;
    const uriPath = `repos/${username}/${reponame}/pulls/${prId}/files`;
    return this.makeConditionalGet(uriPath, isPrivate);
  },

  getCommitFiles(repoDetails) {
    const { username, reponame, headSha, isPrivate } = repoDetails;
    const uriPath = `repos/${username}/${reponame}/commits/${headSha}`;
    return this.makeConditionalGet(uriPath, isPrivate).then(
      response => response.files
    );
  },

  getCompareFiles(repoDetails) {
    const { username, reponame, headSha, baseSha, isPrivate } = repoDetails;
    const uriPath = `repos/${username}/${reponame}/compare/${baseSha}...${headSha}`;
    return this.makeConditionalGet(uriPath, isPrivate).then(
      response => response.files
    );
  },

  getPRInfo(repoDetails) {
    const { username, reponame, isPrivate, prId } = repoDetails;
    const uriPath = `repos/${username}/${reponame}/pulls/${prId}`;
    return this.makeConditionalGet(uriPath, isPrivate);
  }
};

let BitbucketAPI = {
  getRemoteUsername(decoded) {
    return decoded.bitbucket_username;
  },

  getPassthroughPath() {
    return `bitbucket_passthrough/`;
  },

  buildUrl(path) {
    return `https://api.bitbucket.org/2.0/${path}`;
  },

  getPrivateErrorCodes() {
    return [403];
  },

  getFilesTree(repoDetails) {
    const { username, reponame, branch } = repoDetails;
    const nonNullBranch = branch || "master"; // TODO(arjun): check for default branch
    const uriPath = `repositories/${username}/${reponame}/src/${nonNullBranch}/`;
    return this.makeConditionalGet(uriPath);
  },

  parseLines(element, charToCheck) {
    const hunkValues = element.hunks.map(hunk => {
      const lines = hunk.lines;
      return lines.reduce((total, line) => {
        const num = line[0] === charToCheck ? 1 : 0;
        return total + num;
      }, 0);
    });
    return hunkValues.reduce((total, num) => total + num, 0);
  },

  getDiffData(parsedDiff) {
    // Return file path, additions and deletions by parsing the diff
    // Also uses git diff statuses: `added`, `renamed`, `modified`, `deleted`
    return parsedDiff.map(element => {
      const additions = this.parseLines(element, "+");
      const deletions = this.parseLines(element, "-");
      const filePath = element.newPath || element.oldPath;
      return {
        filename: filePath.replace("b/", ""),
        additions: additions,
        deletions: deletions,
        status: element.status
      };
    });
  },

  getPRFiles(repoDetails) {
    const { username, reponame, prId } = repoDetails;
    const uriPath = `repositories/${username}/${reponame}/pullrequests/${prId}/diff/`;
    return this.makeConditionalGet(uriPath).then(response => {
      const parsedDiff = parse.parse(response);
      return this.getDiffData(parsedDiff);
    });
  },

  getPRInfo(repoDetails) {}
};

let GitRemoteAPI = {
  isRemoteAuthorized(isPrivate) {
    const decoded = this.getDecodedToken();
    if (decoded !== null) {
      // Oauth case: github + bitbucket. If username exists,
      // then remote is definitely authorized.
      const username = this.getRemoteUsername(decoded);

      if (username !== "" && username !== undefined) {
        return true;
      }
    }

    // Now this could be the github app scenario, where
    // the decoded JWT does not have the Oauth username, but
    // remote is still authorized via an app installation.
    if (getGitService() === "github" && isPrivate) {
      // Here, if the repo is public, we can return false. But if the
      // repo is private, we should try reaching the server, just in case
      // authentication is available.
      return true;
    }

    return false;
  },

  makeConditionalGet(uriPath, isPrivate) {
    if (this.isRemoteAuthorized(isPrivate)) {
      // If user is logged in with github, we will send
      // this API call to pass through via backend.
      const uri = `${this.getPassthroughPath()}${uriPath.replace("?", "%3F")}/`;
      return this.baseRequest
        .fetch(uri)
        .then(
          response =>
            // This is required for non-json responses, as the passthrough api
            // JSONifies them with the jsonified key
            response.jsonified || response
        )
        .catch(error => {
          if (error.response.status === 401) {
            // Remote has returned auth error
            this.dispatchAuthenticated(false);
          } else {
            Raven.captureException(error);
          }
        });
    } else {
      // Make call directly to github using client IP address
      // for efficient rate limit utilisation.
      const fullUrl = this.buildUrl(uriPath);
      return this.cacheOrGet(fullUrl).catch(error => {
        const privateRepoErrorCodes = this.getPrivateErrorCodes();
        const { status } = error.response;
        if (privateRepoErrorCodes.indexOf(status) >= 0) {
          this.dispatchAuthenticated(false);
        }
      });
    }
  },

  getTree(repoDetails) {
    const { reponame, type } = repoDetails;

    switch (type) {
      case "pull":
        return this.getPRFiles(repoDetails).then(response =>
          treeAdapter.getPRChildren(reponame, response)
        );
      case "commit":
        return this.getCommitFiles(repoDetails).then(response =>
          treeAdapter.getPRChildren(reponame, response)
        );
      case "compare":
        return this.getCompareFiles(repoDetails).then(response =>
          treeAdapter.getPRChildren(reponame, response)
        );
      default:
        return this.getFilesTree(repoDetails).then(response =>
          treeAdapter.getTreeChildren(reponame, response)
        );
    }
  },

  getService() {
    switch (getGitService()) {
      case "github":
        return GithubAPI;
      case "bitbucket":
        return BitbucketAPI;
    }
  },

  getRemoteUsername(decoded) {
    return this.getService().getRemoteUsername(decoded);
  },

  getPassthroughPath() {
    return this.getService().getPassthroughPath();
  },

  buildUrl(path) {
    return this.getService().buildUrl(path);
  },

  getPrivateErrorCodes() {
    return this.getService().getPrivateErrorCodes();
  },

  getFilesTree(repoDetails) {
    return this.getService().getFilesTree(repoDetails);
  },

  getPRFiles(repoDetails) {
    return this.getService().getPRFiles(repoDetails);
  },

  getCommitFiles(repoDetails) {
    return this.getService().getCommitFiles(repoDetails);
  },

  getCompareFiles(repoDetails) {
    return this.getService().getCompareFiles(repoDetails);
  },

  getPRInfo(repoDetails) {
    return this.getService().getPRInfo(repoDetails);
  }
};

export { GitRemoteAPI };
