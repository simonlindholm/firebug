/* See license.txt for terms of usage */
/*jshint esnext:true*/
/*global define:1*/

define([
    "lib/dom"
],
function(Dom) {

"use strict";

// ********************************************************************************************* //
// Implementation

var MessageHandlers = {
    createAndCacheElement: function(_, {tagName}, server, id)
    {
        var el = server._doc.createElement(tagName);
        server._addId(id, el);
    },

    createAndCacheTextNode: function(_, {text}, server, id)
    {
        var node = server._doc.createTextNode(text);
        server._addId(id, node);
    },

    removeNodeFromCache: function(node, _, server, id)
    {
        server._removeId(id, node);
    },

    addListener: function(el, {type}, server)
    {
        if (!el.addedListeners)
            el.addedListeners = {};
        if (el.addedListeners[type])
        {
            el.addedListeners[type]++;
            return;
        }
        el.addedListeners[type] = 1;
        el.addEventListener(type, server.handleEvent, false);
    },

    removeListener: function(el, {type}, server)
    {
        el.addedListeners[type]--;
        if (!el.addedListeners[type])
            el.removeEventListener(type, server.handleEvent, false);
    },

    appendChild: function(el, {ch}, server) { el.appendChild(server._lookup(ch)); },
    removeChild: function(el, {ch}, server) { el.removeChild(server._lookup(ch)); },

    insertBefore: function(el, {ch, before}, server)
    {
        el.insertBefore(server._lookup(ch), before && server._lookup(before));
    },

    querySelector: function(el, {selector}, server)
    {
        try
        {
            return server._reverseLookup(el.querySelector(selector)) || null;
        }
        catch (exc) {}
    },

    querySelectorAll: function(el, {selector}, server)
    {
        try
        {
            var list = el.querySelector(selector), output = [];
            for (var i = 0; i < list.length; i++)
                output.push(server._reverseLookup(list[i]));
            return output;
        }
        catch (exc) {}
    },

    setAttribute: function(el, {attr, value}) { el.setAttribute(attr, value); },
    removeAttribute: function(el, {attr}) { el.removeAttribute(attr); },

    focus: function(el) { el.focus(); },

    setTextContent: function(el, {value}) { el.textContent = value; },
    setValue: function(el, {value}) { el.value = value; },

    getClientWidth: function(el) { return el.clientWidth; },
    getClientHeight: function(el) { return el.clientHeight; },
    getOffsetHeight: function(el) { return el.offsetHeight; },
    getOffsetWidth: function(el) { return el.offsetWidth; },
    getOffsetLeft: function(el) { return el.offsetLeft; },
    getOffsetTop: function(el) { return el.offsetTop; },
    getScrollLeft: function(el) { return el.scrollLeft; },
    getScrollTop: function(el) { return el.scrollTop; },
    setScrollLeft: function(el, {value}) { el.scrollLeft = value; },
    setScrollTop: function(el, {value}) { el.scrollTop = value; },

    remoteScrollTo: function(el, {sb, ax, ay, swv}, server)
    {
        Dom.scrollTo(el, server._lookup(sb), ax, ay, swv);
    },
};

function doHandleEvent(server, event)
{
    var target = server._reverseLookup(event.target);
    if (!target)
        return;

    event.stopPropagation();

    var ev = {
        target,
        type: event.type,
    };

    // Do event handling through a CPOW. It's unfortunate to have to do this, but without
    // it we'd need another way of doing event cancellations, and it's a hard problem.
    if (server._rawClientReference.handleEvent(ev))
        event.preventDefault();
}

function RemoteDomServer(doc)
{
    this._doc = doc;
    this._nextClientId = 0;
    this._idMap = new Map();
    this._idRevMap = new Map();
    this._rawClientReference = null;
    this.handleEvent = doHandleEvent.bind(null, this);
}

RemoteDomServer.prototype.setRawClientReference = function(obj)
{
    this._rawClientReference = obj;
};

RemoteDomServer.prototype.addPanelNode = function(id, where)
{
    var node = this._lookup(id);
    where.appendChild(node);
    this._doc = where.ownerDocument;
};

RemoteDomServer.prototype.handleMessage = function(id, signal, data)
{
    var node = this._lookup(id);
    MessageHandlers[signal](node, data, this, id);
};

RemoteDomServer.prototype._addId = function(id, node)
{
    this._idMap.set(id, node);
    this._idRevMap.set(node, id);
};

RemoteDomServer.prototype._removeId = function(id, node)
{
    this._idMap.delete(id);
    this._idRevMap.delete(node);
};

RemoteDomServer.prototype._lookup = function(id)
{
    return this._idMap.get(id);
};

RemoteDomServer.prototype._reverseLookup = function(elem)
{
    return this._idRevMap.get(elem);
};

// ********************************************************************************************* //
// Registration

return {
    RemoteDomServer,
};

// ********************************************************************************************* //
});
