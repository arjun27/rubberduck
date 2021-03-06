import { createReducer } from "redux-create-reducer";

const initialState = {
  initialized: false,
  githubAccessToken: undefined,

  // Sidebar props
  isSidebarVisible: true,
  sidebarWidth: 235,

  // Settings
  // (chrome.storage.local)
  hasHoverDebug: false,

  // API response caching: hash of url is the object key
  // (chrome.storage.local)
  apiResponses: {}
};

export default createReducer(initialState, {
  SET_FROM_CHROME_STORAGE: (state, action) => {
    return {
      ...state,
      ...action.payload,
      initialized: true
    };
  },

  UPDATE_FROM_CHROME_STORAGE: (state, action) => {
    if (!action.payload) {
      return { ...state };
    }

    return {
      ...state,
      ...action.payload
    };
  }
});
