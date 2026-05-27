import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Register with HostPanel package loader.
// PackageShell.tsx loads this file as a plain <script> tag, then calls
//   window.__hpkg['wireguard'].init(hostEl, api)
// and on route change calls .destroy() to unmount and clean up.

window.__hpkg = window.__hpkg || {};
window.__hpkg['wireguard'] = {
  _root: null,

  init(hostEl, api) {
    this._root = createRoot(hostEl);
    this._root.render(
      <StrictMode>
        <App api={api} />
      </StrictMode>,
    );
  },

  destroy() {
    this._root?.unmount();
    this._root = null;
  },
};
