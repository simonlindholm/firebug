/* See license.txt for terms of usage */
/*jshint esnext:true*/
/*global define:1*/

define([
    "firebug/lib/string",
],
function(Str) {

"use strict";

// ********************************************************************************************* //
// Dom

function RemoteDom(server)
{
    this._server = server;
    this._nextId = 0;
    this._idMap = new Map();
}

RemoteDom.prototype._allocateId = function(thing)
{
    if (this._id)
        throw new Error("dom node already has an ID");
    this._nextId++;
    thing._id = this._nextId;
    this._idMap.set(thing._id, thing);
};

RemoteDom.prototype._destroyId = function(thing)
{
    this._idMap.delete(thing._id);
    thing._id = 0;
};

RemoteDom._lookup = function(id)
{
    return this._idMap.get(id);
};

RemoteDom.handleEvent = function({type, target})
{
    target = this._lookup(target);
    var event = new Event(type, target);
    var bubbling = [];
    var capturing = [];
    for (; target; target = target._eventParent)
    {
        var el = target._eventListeners;
        if (!el || !el.hasOwnProperty(type))
            continue;
        var map = el[type];
        for (let [fn, data] of map)
        {
            var where = (data.capturing ? capturing : bubbling);
            where.push({el, fn});
        }
    }

    var callbacks = capturing.reverse().concat(bubbling);
    for (var i = 0; i < callbacks.length; i++)
    {
        var t = callbacks[i];
        if (!t.fn.call(t.el, event))
        {
            event.stopPropagation();
            event.preventDefault();
        }

        // Break if someone called stopPropagation(). Technically we should care about
        // preventImmediatePropagation(), but in our case it doesn't really matter.
        if (event._stoppedPropagation)
            break;
    }
    return event.defaultPrevented;
};


// ********************************************************************************************* //
// Window

function RemoteWindow(dom)
{
    this._dom = dom;
    this._eventParent = null;
}


// ********************************************************************************************* //
// Document

function RemoteDocument(win)
{
    this._dom = win._dom;
    this._eventParent = win;

    this.defaultView = win;
}

RemoteDocument.prototype.createElement = function(tagName)
{
    var el = new RemoteElement(this, tagName);
    el._createOnServer();
};

RemoteDocument.prototype.createTextNode = function(text)
{
    var node = new RemoteTextNode(this, text);
    node._createOnServer();
};

RemoteDocument.prototype.createDocumentFragment = function()
{
    return new RemoteDocumentFragment(this);
};

RemoteDocument.prototype._parseXMLToFragment = function(input)
{
    function assert(cond, msg)
    {
        if (!cond)
            throw new Error("invalid markup (" + msg + ")");
    }
    function unescapeHtmlEntities(text)
    {
        // This fails for random named entities, and numeric ones, but it should be
        // good enough for domplate (which uses Str.escapeForElementAttribute).
        if (!text)
            return "";
        return Str.unescapeForElementAttribute(text);
    }

    var frag = this.createDocumentFragment();
    var stack = [frag];
    var ind = 0, ind2;
    var len = input.length;
    var reChar = /[a-zA-Z]/;
    while (ind < len)
    {
        ind2 = input.indexOf("<", ind);
        if (ind2 === -1)
            ind2 = len;
        var dec = unescapeHtmlEntities(input.substring(ind, ind2));
        if (ind2 + 1 < len && input[ind2 + 1] === "/")
        {
            // End tag, skip until next ">" and add the text contents.
            ind = input.indexOf(">", ind2 + 1) + 1;
            assert(ind !== 0 && stack.length > 1, "too many end tags");
            var target = stack.pop();
            if (dec)
            {
                if (target.childNodes.length > 0)
                    target.appendChild(this.createTextNode(dec));
                else
                    target.textContent = dec;
            }
        }
        else
        {
            // Start tag (or end of input), add text contents and push tag to stack.
            var par = stack[stack.length-1];
            if (dec)
                par.appendChild(this.createTextNode(dec));
            if (ind2 === input.length)
            {
                ind = ind2;
            }
            else
            {
                ind = ind2 = ind2 + 1;
                while (ind2 < input.length && reChar.test(input[ind2]))
                    ind2++;

                var tagName = input.substring(ind, ind2);
                var el = this.createElement(tagName);
                par.appendChild(el);
                stack.push(el);

                // Parse attributes
                for (;;)
                {
                    while (ind2 < input.length && input[ind2] === " ")
                        ind2++;
                    assert(ind2 !== input.length, "no end of tag");
                    if (input[ind2] === ">")
                        break;
                    if (input[ind2] === "/")
                    {
                        // Self-closing tag.
                        assert(input[ind2 + 1] === ">", "unexpected /");
                        ind2++;
                        stack.pop();
                        break;
                    }

                    // An attribute!
                    var eqInd = input.indexOf("=", ind2);
                    assert(eqInd !== -1, "missing attribute value");
                    var attr = input.substring(ind2, eqInd);
                    ind2 = eqInd + 1;
                    var q = input[ind2];
                    assert(q === "\"" || q === "'", "unquoted attribute value");
                    ind2++;
                    var endInd = input.indexOf(q, ind2);
                    assert(endInd !== -1, "no end of attribute value");
                    var attrValue = input.substring(ind2, endInd);
                    ind2 = endInd + 1;
                    el.setAttribute(attr, attrValue);
                }
                ind = ind2 + 1;
            }
        }
    }
    if (stack.length !== 1)
        throw new Error("invalid markup (too many start tags)");
    return frag;
};


// ********************************************************************************************* //
// Node

function RemoteNode(doc)
{
    this._dom = doc._dom;
    this._eventParent = doc;
    this._id = 0;
    this.parentNode = null;
    this.ownerDocument = doc;
}

RemoteNode.prototype._removeFromServer = function()
{
    this._send("removeNodeFromCache");
    this._dom._destroyId(this);
};

RemoteNode.prototype._forSubtree = function(callback)
{
    callback(this);
};

RemoteNode.prototype._removeSubtreeFromServer = function()
{
    this._forSubtree((node) => node._removeFromServer());
};

RemoteNode.prototype._send = function(signal, data = {}, sync = true)
{
    if (!this._id)
        throw new Error("used a removed node");
    for (var p in data)
    {
        if (data[p] instanceof RemoteNode)
            data[p] = data[p]._id;
    }
    var ret = this._dom._server.handleMessage(this._id, signal, data);
    if (sync)
        return ret;
};

RemoteNode.prototype._silentRemove = function()
{
    var par = this.parentNode;
    if (!par || par === this.ownerDocument)
        return;
    var ind = par.childNodes.lastIndexOf(this);
    if (ind === -1)
        throw new Error("node not in its parent's child list?");
    this.parentNode.childNodes.splice(ind, 1);
    this.parentNode = null;
    this._eventParent = this.ownerDocument;
};

Object.defineProperty(RemoteNode.prototype, "previousSibling", {
    get: function()
    {
        var ch = this.parentNode.childNodes;
        return ch[ch.indexOf(this) - 1] || null;
    }
});

Object.defineProperty(RemoteNode.prototype, "nextSibling", {
    get: function()
    {
        var ch = this.parentNode.childNodes;
        return ch[ch.indexOf(this) + 1] || null;
    }
});

Object.defineProperty(RemoteNode.prototype, "previousElementSibling", {
    get: function()
    {
        var el = this;
        do
            el = el.previousSibling;
        while (el && el.nodeType !== 1);
        return el;
    }
});

Object.defineProperty(RemoteNode.prototype, "nextElementSibling", {
    get: function()
    {
        var el = this;
        do
            el = el.nextSibling;
        while (el && el.nodeType !== 1);
        return el;
    }
});


// ********************************************************************************************* //
// TextNode

function RemoteTextNode(doc, text)
{
    RemoteNode.call(this, doc);
    this.data = text;
}

RemoteTextNode.prototype = Object.create(RemoteNode.prototype);

RemoteTextNode.prototype._createOnServer = function()
{
    this._dom._allocateId(this);
    this._send("createAndCacheTextNode", {text: this.data});
};

RemoteTextNode.prototype.nodeType = 3;

// ********************************************************************************************* //
// Element

function RemoteElement(doc, tagName)
{
    RemoteNode.call(this, doc);
    this._eventListeners = {};
    this._attrs = new Map();
    this._text = "";
    this._value = "";

    this.localName = tagName.toLowerCase();
    this.tagName = this.nodeName = tagName.toUpperCase();
    this.childNodes = [];
    this.classList = new RemoteClassList(this);
}

RemoteElement.prototype = Object.create(RemoteNode.prototype);

RemoteElement.prototype._createOnServer = function()
{
    this._dom._allocateId(this);
    this._send("createAndCacheElement", {tagName: this.tagName});
};

// @override
RemoteElement.prototype._forSubtree = function(callback)
{
    callback(this);
    for (var i = 0; i < this.childNodes.length; i++)
        this.childNodes[i]._forSubtree(callback);
};

RemoteElement.prototype.addEventListener = function(type, fn, capturing)
{
    if (!this._eventListeners.hasOwnProperty(type))
        this._eventListeners[type] = new Map();
    var el = this._eventListeners[type];
    if (el.has(fn))
        return;
    this._send("addListener", {type});
    el.set(fn, {capturing});
};

RemoteElement.prototype.removeEventListener = function(type, fn)
{
    var el = this._eventListeners[type];
    if (!el || !el.has(fn))
        return;
    this._send("removeListener", {type});
    el.delete(fn);
};

RemoteElement.prototype.removeChild = function(ch)
{
    if (ch.parentNode !== this)
        throw new Error("tried to remove a child which was not there");

    this._send("removeChild", {ch});
    ch._removeSubtreeFromServer();

    ch._silentRemove();
};

RemoteElement.prototype.appendChild = function(ch)
{
    if (ch instanceof RemoteDocumentFragment)
    {
        for (let node of ch._list)
            this.appendChild(node);
        return;
    }

    if (!(ch instanceof RemoteNode))
        throw new Error("tried to append a non-node");
    if (!ch._id)
        throw new Error("tried to reinsert a removed element, not supported");

    this._send("appendChild", {ch});

    ch._silentRemove();
    this.childNodes.push(ch);
    ch.parentNode = ch._eventParent = this;
};

RemoteElement.prototype.insertBefore = function(ch, before)
{
    if (!(ch instanceof RemoteNode || ch instanceof RemoteDocumentFragment))
        throw new Error("tried to append a non-element");
    if (!ch._id)
        throw new Error("tried to reinsert a removed element, not supported");
    if (before && !(before instanceof RemoteNode))
        throw new Error("second argument to insertBefore must be a node or null");
    if (before && before.parentNode !== this)
        throw new Error("second argument to insertBefore must be a child node");

    var beforePos = (before ? this.childNodes.lastIndexOf(before) : this.childNodes.length);
    if (beforePos === -1)
        throw new Error("corrupted dom");

    var list = (ch instanceof RemoteDocumentFragment ? ch._list : [ch]);
    for (let node of list)
    {
        this._send("insertBefore", {node, before});
        node._silentRemove();
        node.parentNode = node._eventParent = this;
    }
    this.childNodes.splice(beforePos, 0, ...list);
};

RemoteElement.prototype.replaceChild = function(ch, insteadOf)
{
    if (insteadOf.parentNode !== this)
        throw new Error("tried to replace a non-child");
    if (ch === insteadOf)
        return;
    this.insertBefore(ch, insteadOf);
    this.removeChild(insteadOf);
};

RemoteElement.prototype.getElementsByTagName = function(tagName)
{
    tagName = tagName.toUpperCase();
    var res = [];
    this._forSubtree(function(node)
    {
        if (node instanceof RemoteElement && node.tagName === tagName)
            res.push(node);
    });
    res.item = (i) => res[i];
    return res;
};

RemoteElement.prototype.getElementsByClassName = function(className)
{
    var res = [];
    this._forSubtree(function(node)
    {
        if (node instanceof RemoteElement && node.classList.contains(className))
            res.push(node);
    });
    res.item = (i) => res[i];
    return res;
};

RemoteElement.prototype.querySelector = function(selector)
{
    // Synchronously ask this of the server - querySelector is expected to be slow,
    // and it's much too hard to reimplement.
    var id = this._send("querySelector", {selector}, true);
    if (id === undefined)
        throw new Error("invalid selector");
    return this._dom._lookup(id) || null;
};

RemoteElement.prototype.querySelectorAll = function(selector)
{
    var ids = this._send("querySelectorAll", {selector}, true);
    if (ids === undefined)
        throw new Error("invalid selector");
    return ids.map((id) => this._dom._lookup(id));
};

RemoteElement.prototype.getAttribute = function(attr)
{
    if (attr === "class")
        return this.classList._set && this.classList._str;
    else
        return this._attrs.get(attr) || null;
};

RemoteElement.prototype.setAttribute = function(attr, value)
{
    this._send("setAttribute", {attr, value});
    if (attr === "class")
        this.classList._update(value);
    else
        this._attrs.set(attr, value);
    if (attr === "value")
        this.value = value;
};

RemoteElement.prototype.removeAttribute = function(attr)
{
    this._send("removeAttribute", {attr});
    if (attr === "class")
        this.classList._destroy();
    else
        this._attrs.delete(attr);
};

RemoteElement.prototype.focus = function()
{
    this._send("focus");
};

RemoteElement.prototype._remoteScrollTo = function(sb, ax, ay, swv)
{
    this._send("remoteScrollTo", {sb, ax, ay, swv});
};

Object.defineProperty(RemoteElement.prototype, "className", {
    get: function() { return this.getAttribute("class"); },
    set: function(value) { this.setAttribute("class", value); },
});

Object.defineProperty(RemoteElement.prototype, "firstChild", {
    get: function() { return this.childNodes[0] || null; },
});

Object.defineProperty(RemoteElement.prototype, "lastChild", {
    get: function() { return this.childNodes[this.childNodes.length-1] || null; },
});

Object.defineProperty(RemoteElement.prototype, "nextSibling", {
    get: function() { return this.childNodes[this.childNodes.indexOf(this)+1] || null; },
});

Object.defineProperty(RemoteElement.prototype, "value", {
    get: function() { return this._value; },
    set: function(value) { this._value = value; this._send("setValue", {value}); },
});

Object.defineProperty(RemoteElement.prototype, "textContent", {
    get: function() {
        if (this.childNodes.length > 0)
            throw new Error("can't get textContent of node with children");
        return this._text;
    },
    set: function(value) {
        for (var i = this.childNodes.length - 1; i >= 0; i--)
            this.removeChild(this.childNodes[i]);
        this._text = value;
        this._send("setTextContent", {value});
    },
});

Object.defineProperty(RemoteElement.prototype, "innerHTML", {
    set: function(value) {
        this.textContent = "";
        this.appendChild(this.ownerDocument._parseXMLToFragment(value));
    },
});

// Meant-to-be-slow layout-querying accessors; we ask the server to deal with them.
function defineAccessors(prop, alsoSetter)
{
    var signal = "get" + prop[0].toUpperCase() + prop.substr(1);
    var desc = {};
    desc.get = function() { return this._send(signal, {}, true); };
    if (alsoSetter)
        desc.set = function() { this._send("s" + signal.substr(1)); };
    Object.defineProperty(RemoteElement.prototype, prop, desc);
}
defineAccessors("clientWidth");
defineAccessors("clientHeight");
defineAccessors("offsetWidth");
defineAccessors("offsetHeight");
defineAccessors("offsetLeft");
defineAccessors("offsetTop");
defineAccessors("scrollLeft", true);
defineAccessors("scrollTop", true);

RemoteElement.prototype.nodeType = 1;


// ********************************************************************************************* //
// DocumentFragment

function RemoteDocumentFragment(doc)
{
    this._dom = doc._dom;
    this._list = [];
    this.ownerDocument = doc;
}

RemoteDocumentFragment.prototype.appendChild = function(ch)
{
    ch._silentRemove();
    this._list.push(ch);
};

Object.defineProperty(RemoteDocumentFragment.prototype, "firstChild", {
    get: function() { return this._list[0] || null; },
});

Object.defineProperty(RemoteDocumentFragment.prototype, "lastChild", {
    get: function() { return this._list[this._list.length-1] || null; },
});


// ********************************************************************************************* //
// Class list (i.e. DOMTokenList)

function RemoteClassList(el)
{
    this._el = el;
    this._set = null;
    this._str = "";
}

RemoteClassList._update = function(str, has)
{
    if (!has)
    {
        this._set = null;
        this._set = "";
        return;
    }

    this._str = str;
    if (!this._set)
        this._set = new Set();
    this._set.clear();
    for (let part of str.split(" "))
    {
        if (part)
            this._set.add(part);
    }
};

RemoteClassList._destroy = function()
{
    this._set = null;
    this._str = "";
};

RemoteClassList.add = function(cl)
{
    if (!this._set)
        this._set = new Set();
    if (this._set.has(cl))
        return;
    this._set.add(cl);
    if (this._str)
        this._str += " ";
    this._str += cl;
    this._el._attrs.set("class", this._str);
    this._el._send("setAttribute", {attr: "class", value: this._str});
};

RemoteClassList.remove = function(cl)
{
    if (!this._set || !this._set.has(cl))
        return;
    this._set.remove(cl);
    this._str = [...this._set].join(" ");
    this._el._attrs.set("class", this._str);
    this._el._send("setAttribute", {attr: "class", value: this._str});
};

RemoteClassList.toggle = function(cl, st)
{
    if (typeof st !== "boolean")
        st = !this.contains(cl);
    if (st)
        this.remove(cl);
    else
        this.add(cl);
    return cl;
};

RemoteClassList.contains = function(cl)
{
    return !!(this._set && this._set.has(cl));
};


// ********************************************************************************************* //
// Event

function Event(type, target)
{
    this._stoppedPropagation = false;

    this.target = target;
    this.defaultPrevented = false;
}

Event.prototype.stopPropagation = function()
{
    this._stoppedPropagation = true;
};

Event.prototype.preventDefault = function()
{
    this.defaultPrevented = true;
};


// ********************************************************************************************* //
// Other public API

function createPanelNode(server)
{
    var dom = new RemoteDom(server);
    var win = new RemoteWindow(dom);
    var doc = new RemoteDocument(win);
    var el = doc.createElement("div");
    el.parentNode = doc;
    server.setRawClientReference(dom);
    return el;
}

// ********************************************************************************************* //
// Registration

return {
    createPanelNode,
};

// ********************************************************************************************* //
});
