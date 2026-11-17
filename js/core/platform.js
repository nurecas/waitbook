/* Which device is this? Used only to pick sensible defaults (which installers, which export, which apps
   to show first). Everything stays switchable in the UI; nothing is sent anywhere. */
(function (root) {
  'use strict';
  var WB = (root.WB = root.WB || {});

  function detect(nav, win) {
    nav = nav || (typeof navigator !== 'undefined' ? navigator : {});
    win = win || (typeof window !== 'undefined' ? window : {});
    var ua = String(nav.userAgent || '');
    var touch = (nav.maxTouchPoints || 0) > 1;
    var os = 'other', device = 'computer';
    var hint = nav.userAgentData && nav.userAgentData.platform ? String(nav.userAgentData.platform) : '';
    if (/iPhone|iPod/.test(ua)) { os = 'ios'; device = 'phone'; }
    else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) { os = 'ios'; device = 'tablet'; }
    else if (/Android/i.test(ua) || /Android/i.test(hint)) { os = 'android'; device = /Mobile/.test(ua) ? 'phone' : 'tablet'; }
    else if (/CrOS/.test(ua) || /Chrome OS/i.test(hint)) { os = 'chromeos'; }
    else if (/Windows/.test(ua) || /Windows/i.test(hint)) { os = 'windows'; }
    else if (/Macintosh|Mac OS X/.test(ua) || /macOS/i.test(hint)) { os = 'mac'; }
    else if (/Linux|X11/.test(ua) || /Linux/i.test(hint)) { os = 'linux'; }
    var standalone = false;
    try { standalone = !!(win.matchMedia && win.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true; } catch (e) { /* ignore */ }
    return { os: os, device: device, touch: touch, standalone: standalone, scripts: os === 'windows' || os === 'mac' || os === 'linux' || os === 'chromeos' };
  }

  /** The installer platform that matches this device, for 'os' axis items. */
  function installerOs(p) {
    if (p.os === 'windows' || p.os === 'mac' || p.os === 'linux' || p.os === 'android') return p.os;
    if (p.os === 'chromeos') return 'linux';
    return null;
  }

  WB.platform = { detect: detect, installerOs: installerOs };
  if (typeof module !== 'undefined' && module.exports) module.exports = WB.platform;
})(typeof self !== 'undefined' ? self : globalThis);
