import Store from "../store";
import WebSocketAsPromised from "websocket-as-promised";

// Handlers for web socket stuff
class BaseWebSocket {
  createConnection() {
    const token = Store.getState().storage.token;
    const wsUrl = `ws://localhost:8000/sessions/?token=${token}`;
    return new WebSocketAsPromised(wsUrl, {
      packMessage: data => JSON.stringify(data),
      unpackMessage: message => JSON.parse(message),
      attachRequestId: (data, requestId) =>
        Object.assign({ id: requestId }, data),
      extractRequestId: data => data && data.id
    });
  }

  createSession(pull_request_id, organisation, reponame) {
    this.wsp = this.createConnection();
    // this.wsp.onPackedMessage.addListener(data =>
    //   console.log("received:", data)
    // );

    return this.wsp
      .open()
      .then(() =>
        this.wsp.sendRequest({
          type: "session.create",
          payload: {
            pull_request_id,
            organisation,
            name: reponame,
            service: "github"
          }
        })
      )
      .then(response => {
        console.log("sessionc reate response", response);
      });
  }

  getHover(sessionId, baseOrHead, filePath, lineNumber, charNumber) {
    const queryParams = {
      is_base_repo: baseOrHead === "base" ? "true" : "false",
      location_id: `${filePath}#L${lineNumber}#C${charNumber}`
    };
    return this.wsp.sendRequest({
      type: "session.hover",
      payload: queryParams
    });
  }

  getReferences(sessionId, baseOrHead, filePath, lineNumber, charNumber) {
    const queryParams = {
      is_base_repo: baseOrHead === "base" ? "true" : "false",
      location_id: `${filePath}#L${lineNumber}#C${charNumber}`
    };
    return this.wsp.sendRequest({
      type: "session.references",
      payload: queryParams
    });
  }

  getDefinition(sessionId, baseOrHead, filePath, lineNumber, charNumber) {
    const queryParams = {
      is_base_repo: baseOrHead === "base" ? "true" : "false",
      location_id: `${filePath}#L${lineNumber}#C${charNumber}`
    };
    return this.wsp.sendRequest({
      type: "session.definition",
      payload: queryParams
    });
  }
}

export const WS = new BaseWebSocket();
