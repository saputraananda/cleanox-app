/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-7e5eb42b'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-512x512.png",
    "revision": "8938545f328561d75f769a84c4189529"
  }, {
    "url": "pwa-192x192.png",
    "revision": "c71e074c782f0331dbfddafe9ab091d6"
  }, {
    "url": "KOP SURAT CLEANOX INDONESIA.png",
    "revision": "1680140e482a035f2843838ddc5b5dfc"
  }, {
    "url": "index.html",
    "revision": "8de6c3b51176a6eff3e7e6d621b7f46c"
  }, {
    "url": "cleanox.png",
    "revision": "08f731ee9eb2f1d25464091426a14645"
  }, {
    "url": "assets/workbox-window.prod.es5-BBnX5xw4.js",
    "revision": null
  }, {
    "url": "assets/purify.es-DP5U8-sc.js",
    "revision": null
  }, {
    "url": "assets/index.es-DwScaP1H.js",
    "revision": null
  }, {
    "url": "assets/index-UV0IOFGf.js",
    "revision": null
  }, {
    "url": "assets/index-0rKRZPyb.css",
    "revision": null
  }, {
    "url": "assets/html2canvas.esm-ezMWrafe.js",
    "revision": null
  }, {
    "url": "assets/CleanoxTeam6-CwgdZ8W9.webp",
    "revision": null
  }, {
    "url": "assets/CleanoxTeam5-B0fQFgti.webp",
    "revision": null
  }, {
    "url": "assets/CleanoxTeam4-Cl524At0.webp",
    "revision": null
  }, {
    "url": "assets/CleanoxTeam3-lftoUwtr.webp",
    "revision": null
  }, {
    "url": "assets/CleanoxTeam2-ecuDJvcb.webp",
    "revision": null
  }, {
    "url": "assets/CleanoxTeam1-CmvJUi7N.webp",
    "revision": null
  }, {
    "url": "assets/CleanoxTeam-Dm1n6IuY.webp",
    "revision": null
  }, {
    "url": "assets/cleanox-Dkplawwn.png",
    "revision": null
  }, {
    "url": "cleanox.png",
    "revision": "08f731ee9eb2f1d25464091426a14645"
  }, {
    "url": "pwa-192x192.png",
    "revision": "c71e074c782f0331dbfddafe9ab091d6"
  }, {
    "url": "pwa-512x512.png",
    "revision": "8938545f328561d75f769a84c4189529"
  }, {
    "url": "manifest.webmanifest",
    "revision": "62eb13dd3473c8438c66794a0070ad9d"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("/index.html")));

}));
