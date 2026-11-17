(function (root) {
  'use strict';
  var WB = root.WB;
  var h = WB.dom.h, icon = WB.dom.icon, P = WB.parts;
  function t(k, v) { return WB.i18n.t(k, v); }

  var PLATFORMS = ['ios', 'android', 'windows', 'mac', 'linux'];
  var LINK_OS = { ios: ['ios'], android: ['android-play', 'android-fdroid', 'android-apk'], windows: ['windows', 'windows-store'], mac: ['mac'], linux: ['linux', 'linux-flathub'] };

  WB.views.apps = {
    title: function () { return t('nav.apps'); },
    render: function (el, parts, query) {
      var detected = WB.app.platform.os === 'chromeos' ? 'linux' : WB.app.platform.os;
      var os = PLATFORMS.indexOf(query.os) !== -1 ? query.os : (PLATFORMS.indexOf(detected) !== -1 ? detected : 'android');
      var data = root.WB_APPS;

      el.appendChild(P.pageHead(t('apps.kicker'), t('nav.apps'), t('apps.lede')));
      var seg = h('fieldset.seg.platform-pick', h('legend', t('apps.platform')));
      PLATFORMS.forEach(function (p) {
        var inp = h('input', { type: 'radio', name: 'platform', value: p, checked: os === p });
        inp.addEventListener('change', function () { WB.router.setQuery({ os: p }); WB.router.render({ soft: true }); });
        seg.appendChild(h('label', inp, h('span', icon(p === 'ios' || p === 'android' ? 'phone' : 'laptop'), t('os.' + p), p === detected ? ' · ' + t('apps.thisDevice') : '')));
      });
      el.appendChild(seg);

      // Install Waitbook itself.
      el.appendChild(h('section.box-quiet', { 'aria-labelledby': 'installTitle' },
        h('h2', { id: 'installTitle', style: { 'font-size': '1.2rem' } }, icon('download'), ' ', t('apps.installTitle')),
        h('p.small', t('apps.install.' + os)),
        location.protocol === 'file:' ? h('p.small.muted', t('apps.fileMode')) : null));

      data.needs.forEach(function (need) {
        var list = need.apps.map(function (id) { return { id: id, app: data.apps[id] }; }).filter(function (x) { return x.app && x.app.platforms.indexOf(os) !== -1; });
        var sec = h('section.need', { 'aria-labelledby': 'need-' + need.id }, h('h3', { id: 'need-' + need.id }, icon(need.icon), t('need.' + need.id)));
        sec.appendChild(h('p.small.muted', t('need.' + need.id + '.d')));
        if (need.id === 'docs') sec.appendChild(h('p.small', t('apps.builtin.' + os)));
        if (!list.length) { sec.appendChild(h('p.small.muted', t('apps.noneHere'))); el.appendChild(sec); return; }
        var grid = h('div.app-cards');
        list.forEach(function (x, i) {
          var a = x.app;
          var links = h('div.app-links');
          var keys = Object.keys(a.links).filter(function (k) { return LINK_OS[os].indexOf(k) !== -1 || k === 'web'; });
          if (!keys.length) keys = Object.keys(a.links);
          keys.forEach(function (k) { links.appendChild(h('a', { href: a.links[k] }, t('link.' + k), ' ', icon('external'))); });
          grid.appendChild(h('article.app-card' + (i === 0 ? '.is-top' : ''),
            h('header', h('h4', a.name), i === 0 ? h('span.stamp.p1', t('apps.top')) : null),
            h('p', a.desc), h('div.small.muted', a.license), links));
        });
        sec.appendChild(grid);
        el.appendChild(sec);
      });

      el.appendChild(h('section.section', { 'aria-labelledby': 'shareTitle' },
        h('div.section-head', h('h2', { id: 'shareTitle' }, t('apps.shareTitle'))),
        h('div.grid.cols-2',
          h('div.box-quiet', h('h3', icon('drive'), ' ', t('apps.shareDrive')), h('p.small', t('apps.shareDriveD'))),
          h('div.box-quiet', h('h3', icon('server'), ' ', t('apps.shareWifi')), h('p.small', t('apps.shareWifiD'))),
          h('div.box-quiet', h('h3', icon('phone'), ' ', t('apps.sharePhone')), h('p.small', t('apps.sharePhoneD'))),
          h('div.box-quiet', h('h3', icon('kit'), ' ', t('apps.shareKit')), h('p.small', t('apps.shareKitD')), h('a', { href: '#/kit?tab=share' }, t('kit.tab.share'))))));
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
