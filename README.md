# mercury-extension

This repo is the chrome extension for the mercury project.

## Setup

1.  Install dependencies

    ```
    yarn
    ```

2.  For development, we will run the dev server, and load an unpacked extension on Chrome from `build/`. See [how to](https://developer.chrome.com/extensions/getstarted#unpacked). Open an [example github url](https://github.com/pallets/flask) to see this in action.

    ```
    npm run start-local
    ```

3.  To distribute binary file, we can pack the extension into a crx file. Generate new crx using the command. Packing needs keys (see below).

    ```
    npm run pack
    ```

4.  Run tests with (defaults to watch mode).

    ```
    yarn test
    ```

## Testing with localhost

1.  Run the local server

    ```
    python manage.py runserver
    ```

2.  Run the extension

    ```
    npm run start-local
    ```

3.  Load the unpacked extension in your Chrome from the build location: `build-local/`. The production and local builds can co-exist on Chrome, and you can enable/disable through `chrome://extensions`.

## Testing with staging

1.  Run the extension

    ```
    npm run start-staging
    ```

2.  Load the unpacked extension in your Chrome from the build location: `build-staging/`. The production and local builds can co-exist on Chrome, and you can enable/disable through `chrome://extensions`.

## Development keys setup

- To be able to pack crx (for production), you need to setup `keys/production_key.pem` in your project directory. Get this key from [here](https://drive.google.com/drive/u/0/folders/1ABADv_hmG2FAsPYJokvv_FBw-z_nMQUT) (needs Google account).

- This should not be required if we are distributing the extension through the Chrome Store. See below for publishing.

## Publishing

1.  To publish the extension, ensure that your account on the [Chrome developer dashboard](https://chrome.google.com/webstore/developer/dashboard) is setup.

2.  Bump the version -- open `manifest.json` and bump the version depending on your changes.

3.  Generate the zip file for uploading using the following. This also uploads the source maps to Sentry.

    ```
    npm run chrome-build
    ```

4.  Upload the generated zip file (`bundle.zip`) on the Chrome dashboard.

## Architecture

The extension has three components

1.  Background page (see below): this is the main page of the extension (also called "event page") in the docs. The background page listens for some chrome events, and injects scripts to the page.

2.  [Content script](src/index.js): this is the script that is injected in the page using [programmatic injection](https://developer.chrome.com/extensions/content_scripts#pi). Since the injected script renders elements, this is built using React.

3.  [Options page](public/options.html): this is the settings page. Not much to see here.

### Background page

This is generated via typescript src (located at `background/src/index.ts`). Any change in this source needs to be compiled via typescript. This is configured by following [chrome-extension-typescript-starter](https://github.com/chibat/chrome-extension-typescript-starter).

    ```
    cd background
    npm run build
    ```

This will create a file `public/background/index.js` which is then used by the `npm run...` commands.

### Docs

1.  [Authentication](docs/AUTHENTICATION.md)
2.  [Development](docs/DEVELOPMENT.md)
