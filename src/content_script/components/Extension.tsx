import * as React from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import * as DataActions from "../actions/dataActions";
import * as StorageActions from "../actions/storageActions";
import Sidebar from "./sidebar";
import * as ChromeUtils from "../utils/chrome";
import * as StorageUtils from "../utils/storage";
import Authorization from "../utils/authorization";
// import { getGitService } from "../adapters";
import { setupObserver as setupSpanObserver } from "../adapters/base/codespan";
import pathAdapterv2 from "../adaptersv2";

let document = window.document;

class Extension extends React.Component<any, any> {
  DataActions: any;
  StorageActions: any;

  constructor(props) {
    super(props);
    this.DataActions = bindActionCreators(DataActions, this.props.dispatch);
    this.StorageActions = bindActionCreators(
      StorageActions,
      this.props.dispatch
    );
  }

  componentDidMount() {
    this.setupChromeListener();
    this.initializeStorage();
    this.initializeRepoDetails();
    setupSpanObserver();

    // We can't use our own redux handler for pjax because that
    // is restricted to pjax calls from the sidebar.
    document.addEventListener("pjax:complete", this.onPjaxEnd);
  }

  componentDidUpdate(prevProps, prevState) {
    const { initialized: prevInitialized } = prevProps.storage;
    const { initialized: newInitialized } = this.props.storage;
    const hasLoadedStorage = !prevInitialized && newInitialized;

    if (hasLoadedStorage) {
      // Checking to trigger this only after chrome storage is loaded
      // this.setupAuthorization();
    }

    this.updateSessionAndTree(prevProps, this.props);
  }

  onPjaxEnd = () => {
    this.initializeRepoDetails();
    setupSpanObserver();
  };

  async initializeRepoDetails() {
    const viewInfo = await pathAdapterv2.getViewInfo();
    this.DataActions.setRepoDetails(viewInfo);
    return viewInfo;
  }

  updateSessionAndTree(prevProps, newProps) {
    // TODO: this is getting called literally on every action
    // like expanding/collapsing the files tree.
    const hasViewChanged = pathAdapterv2.hasViewChanged(
      prevProps.data.view,
      newProps.data.view
    );
    const hasAuthChanged = Authorization.hasChanged(
      prevProps.storage,
      newProps.storage
    );

    if (hasAuthChanged || hasViewChanged) {
      this.initializeSession();
      this.initializeFileTree();
    }
  }

  setupChromeListener() {
    ChromeUtils.addChromeListener((action, data) => {
      if (action === "URL_UPDATE") {
        // This has been replaced by pjax:complete event listener
        // Keeping this event just in case we need it
      } else if (action === "STORAGE_UPDATED") {
        this.handleStorageUpdate(data);
      }
    });
  }

  initializeStorage() {
    StorageUtils.getAllFromStore(storageData => {
      this.StorageActions.setFromChromeStorage(storageData);
    });
  }

  // setupAuthorization() {
  //   return Authorization.setup();
  // }

  handleStorageUpdate(data) {
    this.StorageActions.updateFromChromeStorage(data);
  }

  initializeSession() {
    const viewInfo: RemoteView = this.props.data.view;

    if (!!viewInfo.type) {
      this.DataActions.createNewSession(viewInfo);
    }

    // const repoDetails = this.props.data.repoDetails;
    // const hasSessionParams =
    //   repoDetails.prId || repoDetails.headSha || repoDetails.branch;

    // if (repoDetails.username && repoDetails.reponame && hasSessionParams) {
    //   const params = {
    //     organisation: repoDetails.username,
    //     name: repoDetails.reponame,
    //     pull_request_id: repoDetails.prId,
    //     type: repoDetails.type,
    //     head_sha: repoDetails.headSha || repoDetails.branch,
    //     base_sha: repoDetails.baseSha,
    //     service: getGitService()
    //   };

    //   this.DataActions.createNewSession(params);
    // }
  }

  initializeFileTree() {
    let repoDetails = this.props.data.repoDetails;

    if (repoDetails.username && repoDetails.reponame) {
      this.DataActions.callTree(repoDetails).then(response => {
        const { payload } = response.action;
        if (payload && payload.nextPage && payload.lastPage) {
          // We were not able to load the entire tree because API is paginated
          let pages: any = [];

          for (let i = payload.nextPage; i <= payload.lastPage; i++) {
            pages.push(i);
          }

          const firstPageRaw = payload.raw;
          this.DataActions.callTreePages(repoDetails, firstPageRaw, pages);
        }
      });
    }
  }

  render() {
    return <Sidebar />;
  }
}

function mapStateToProps(state) {
  const { storage, data } = state;
  return {
    storage,
    data
  };
}
export default connect(mapStateToProps)(Extension);