// Minimal static renderer for .dc.html artboards (export only, not the real runtime).
(function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(patch) { Object.assign(this.state, patch); }
    forceUpdate() {}
  }

  function lookup(path, scopes) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var parts = path.split('.');
    for (var i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i] && parts[0] in scopes[i]) {
        var v = scopes[i][parts[0]];
        for (var j = 1; j < parts.length && v != null; j++) v = v[parts[j]];
        return v;
      }
    }
    return undefined;
  }

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  function interp(str, scopes) {
    return str.replace(HOLE, function (_, p) {
      var v = lookup(p, scopes);
      return v == null || typeof v === 'function' ? '' : String(v);
    });
  }

  function render(node, scopes) {
    var children = Array.prototype.slice.call(node.childNodes);
    children.forEach(function (child) {
      if (child.nodeType === 3) {
        if (HOLE.test(child.nodeValue)) { HOLE.lastIndex = 0; child.nodeValue = interp(child.nodeValue, scopes); }
        HOLE.lastIndex = 0;
        return;
      }
      if (child.nodeType !== 1) return;
      var tag = child.tagName.toLowerCase();
      if (tag === 'sc-for') {
        var listExpr = (child.getAttribute('list') || '').replace(/^\{\{\s*|\s*\}\}$/g, '');
        var list = lookup(listExpr, scopes) || [];
        var as = child.getAttribute('as') || 'item';
        var frag = document.createDocumentFragment();
        list.forEach(function (item, idx) {
          var scope = { $index: idx }; scope[as] = item;
          var holder = document.createElement('div');
          holder.innerHTML = child.innerHTML;
          render(holder, scopes.concat([scope]));
          while (holder.firstChild) frag.appendChild(holder.firstChild);
        });
        child.replaceWith(frag);
        return;
      }
      if (tag === 'sc-if') {
        var condExpr = (child.getAttribute('value') || '').replace(/^\{\{\s*|\s*\}\}$/g, '');
        if (lookup(condExpr, scopes)) {
          render(child, scopes);
          var f = document.createDocumentFragment();
          while (child.firstChild) f.appendChild(child.firstChild);
          child.replaceWith(f);
        } else {
          child.remove();
        }
        return;
      }
      Array.prototype.slice.call(child.attributes).forEach(function (a) {
        if (/^on/i.test(a.name)) { child.removeAttribute(a.name); return; }
        if (a.value.indexOf('{{') !== -1) child.setAttribute(a.name, interp(a.value, scopes));
      });
      render(child, scopes);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var host = document.querySelector('x-dc');
    var script = document.querySelector('script[data-dc-script]');
    var vals = {};
    if (script) {
      var props = {};
      try {
        var decl = JSON.parse(script.getAttribute('data-props') || '{}');
        Object.keys(decl).forEach(function (k) { if (decl[k] && 'default' in decl[k]) props[k] = decl[k].default; });
      } catch (e) {}
      var Component = new Function('DCLogic', script.textContent + '\nreturn Component;')(DCLogic);
      var inst = new Component(props);
      vals = inst.renderVals() || {};
    }
    if (host) {
      var helmet = host.querySelector('helmet');
      if (helmet) { while (helmet.firstChild) document.head.appendChild(helmet.firstChild); helmet.remove(); }
      render(host, [vals]);
      host.style.display = 'block';
    }
    document.documentElement.setAttribute('data-rendered', '1');
  });
})();
