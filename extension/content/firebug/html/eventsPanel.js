/* See license.txt for terms of usage */
/*jshint esnext:true, curly:false, loopfunc:true*/
/*global FBTrace:1, Components:1, define:1 */

// TODO:
// UI:
// - clicking elements in headers, probably (though it's problematic with `window` which covers the whole line)
//  - or else right-clicking elements in headers
// - clicking event handlers doesn't do anything (are they even in the script panel?)
// - collapsed headers shouldn't have spacing between them
// - styling of event groups, collapsible?, headery
// - source links overlap function names
// - derived listeners
//  - replace right arrow symbol by image, for cross-platform stability
// - capture
// - a11y
// Functionality:
// - detect eventbug (maybe)
// - mutation observers

// Other:
// - see if there are more extra event targets?
// - new issue about having source code as title
// - seeing closures of event listeners??
// - dynamic updates for jQuery listeners will be awful. watch('length') technically works...
// - source links should work even without script panel
// - derived listeners on Google Code:
//  - one listener is "function(ev) { otherfunction(ev); }"
//  - another has two steps of indirection, and the second is very non-trivial (jQuery-like)...

// Testing TODO:
// - disabling event listener, event handlers, attribute event handlers
// - jquery filtering by descendant selector
// - duplicate listeners and such
// - derived listeners (jQuery and others)
// - capture, source links

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/dom",
    "firebug/lib/wrapper",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/chrome/reps",
    "firebug/debugger/debuggerLib",
],
function(Obj, Firebug, Domplate, Dom, Wrapper, Locale, Events, FirebugReps, DebuggerLib) {
"use strict";

// ********************************************************************************************* //
// Constants

var {domplate, DIV, FOR, TAG, H1, H2, SPAN} = Domplate;
var Cu = Components.utils;

// ********************************************************************************************* //
// Events Panel (HTML side panel)

function EventsPanel() {}

EventsPanel.prototype = Obj.extend(Firebug.Panel,
{
    name: "html-events",
    title: Locale.$STR("events.Events"),
    parentPanel: "html",
    order: 4,

    template: domplate(
    {
        cascadedTag:
            DIV(
                DIV({"class": "listenersNonInherited",
                        "aria-label": Locale.$STR("a11y.labels.event_listeners")},
                    TAG("$sectionTag", {object: "$element", list: "$own", baseElement: "$element"})
                ),
                DIV({role: "list", "aria-label": Locale.$STR("a11y.labels.inherited_event_listeners")},
                    FOR("section", "$inherited",
                        DIV({"class": "listenerLabeledSection foldableGroup", $opened: "$section.opened"},
                            H1({"class": "listenerInheritHeader groupHeader focusRow", role: "listitem"},
                                DIV({"class": "twisty", role: "presentation"}),
                                SPAN({"class": "listenerInheritLabel"}, "$section.label"),
                                TAG("$section.tag", {object: "$section.object"})
                            ),
                            TAG("$sectionTag", {object: "$section.object", list: "$section.list", baseElement: "$element"})
                        )
                    )
                 )
            ),

        sectionTag:
            DIV({"class": "listenerSection", role: "group", _sectionTarget: "$object"},
                FOR("category", "$list",
                    TAG("$categoryTag", {category: "$category", baseElement: "$baseElement"})
                )
            ),

        categoryTag:
            DIV({"class": "listenerCategory"},
                H2({"class": "listenerCategoryHeader"}, "$category.type"),
                FOR("listener", "$category.list",
                    TAG("$listenerTag", {listener: "$listener", baseElement: "$baseElement"})
                )
            ),

        listenerTag:
            DIV({"class": "listenerLineGroup", $disabled: "$listener.disabled",
                _listenerObject: "$listener"},
                DIV({"class": "listenerLine originalListener"},
                    SPAN({"class": "listenerIndent", "role": "presentation"}),
                    TAG(FirebugReps.Func.tag, {object: "$listener.func"}),
                    SPAN({"class": "listenerCapturing", "hidden": "$listener|notCapturing"}, "C"), // XXX
                    TAG(FirebugReps.SourceLink.tag, {object: "$listener.sourceLink"})),
                FOR("derivedListener", "$listener,$baseElement|getDerivedListeners",
                    DIV({"class": "listenerLine derivedListener"},
                        SPAN({"class": "listenerIndent", "role": "presentation"}),
                        TAG(FirebugReps.Func.tag, {object: "$derivedListener.func"}),
                        TAG(FirebugReps.SourceLink.tag, {object: "$derivedListener.sourceLink"}))
                )
            ),

        noOwnListenersTag:
            DIV({"class": "noOwnListenersText"}, "$text"),

        emptyTag: SPAN(),

        notCapturing: function(listener)
        {
            return !listener.capturing;
        },

        getDerivedListeners: function(listener, baseElement)
        {
            return listener.derivedListeners.filter(function(li)
            {
                return (!li.shouldShow || li.shouldShow(baseElement));
            });
        }
    }),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        this.onClick = this.onClick.bind(this);
        Firebug.Panel.initialize.apply(this, arguments);
    },

    initializeNode: function()
    {
        Firebug.Panel.initializeNode.apply(this, arguments);
        Events.addEventListener(this.panelNode, "click", this.onClick, false);
    },

    destroyNode: function()
    {
        Events.removeEventListener(this.panelNode, "click", this.onClick, false);
        Firebug.Panel.destroyNode.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    updateSelection: function(selection)
    {
        if (!(selection instanceof Element))
            return;
        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("events.updateSelection; " + selection.localName);

        try
        {
            var own = this.getOwnSection(selection);
            var inherited = this.getInheritedSections(selection);
            this.template.cascadedTag.replace({element: selection, own: own, inherited: inherited}, this.panelNode);

            var firstSection = this.panelNode.getElementsByClassName("listenerSection")[0];
            if (!firstSection.firstChild)
            {
                var text = Locale.$STR("events.NoEventListeners");
                this.template.noOwnListenersTag.replace({text: text}, firstSection);
            }
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("events.updateSelection FAILS", exc);
        }
    },

    getDisabledMap: function(context)
    {
        if (!context.listenerDisabledMap)
            context.listenerDisabledMap = new WeakMap();
        return context.listenerDisabledMap;
    },

    getDerivedListeners: function(func, type, target)
    {
        // Try to see if the listener (often from a library) wraps another user-defined listener,
        // and if so extract the user-defined listener(s). We do this through pattern-matching on
        // function calls that go through call or apply, which are often used to set 'this' to
        // something which is reasonable from a library user's point of view, but are rather
        // uncommon outside of library code. We then use debugger magic to extract the original
        // functions from the listener's closure.
        var src = func + "";
        var mIndirection = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\.(call|apply)/.exec(src);
        if (!mIndirection)
            return null;
        var funcName = mIndirection[1];

        var global = Cu.getGlobalForObject(func);
        var dglobal = DebuggerLib.getDebuggeeGlobal(this.context, global);
        var dfunc = dglobal.makeDebuggeeValue(func);
        var env = dfunc && dfunc.environment;

        if (src.charAt(mIndirection.index - 1) === ".")
        {
            // Not a direct call; bail. Before we give up entirely, try one last special case:
            // jQuery. For reasons of old-IE compat and extensibility, jQuery (and only jQuery)
            // stores all event listeners in a data structure separated from the closure of the
            // listener function. We special-case it only because it is so common.
            return this.getDerivedJqueryListeners(target, type, env, funcName, src);
        }

        env = env && env.find(funcName);
        if (!env || !env.parent)
            return null;
        var dderivedF = env.getVariable(funcName);
        var derivedF = DebuggerLib.unwrapDebuggeeValue(dderivedF);
        if (typeof derivedF !== "function")
            return null;
        return [{func: derivedF}];
    },

    getDerivedJqueryListeners: function(target, type, env, funcName, src)
    {
        if (!(funcName === "handle" || funcName === "dispatch") || !env)
            return null;
        try
        {
            // Pattern match on the occurance of '<minified name>.event.<handle or dispatch>.apply'.
            var matches = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\.event\.(dispatch|handle)\.apply/.exec(src);
            var jqName = (matches && matches[1]) || "";
            var env2 = env.find(jqName);
            var djq = env2 && env2.getVariable(jqName);
            if (!djq)
                return null;

            var jq = DebuggerLib.unwrapDebuggeeValue(djq);
            var fnName = ("_data" in jq ? "_data" : "data");
            var eventData = jq[fnName](target, "events");
            var listeners = eventData && eventData[type];
            if (!listeners)
                return null;

            var ret = [];
            for (var i = 0; i < listeners.length; i++)
            {
                var e = listeners[i];
                var listener = {
                    func: e.handler
                };

                if (e.selector)
                {
                    // XXX test if this works with older jQuery versions and "live" / "delegate"
                    listener.shouldShow = function(e, needsToMatch)
                    {
                        // When showing the listeners of the inspected object, show even its
                        // jQuery descendant listeners.
                        // XXX should we really do this?
                        if (target === needsToMatch)
                            return true;

                        try
                        {
                            // Only show this listener if jQuery runs it on this node, i.e., if the
                            // element or some ancestor of it matches the listener selector.
                            var global = Cu.getGlobalForObject(jq);
                            var elements = Cu.createArrayIn(global), elementSet = new Set();
                            var cur = needsToMatch;
                            while (cur)
                            {
                                elements.push(cur);
                                elementSet.add(cur);
                                cur = cur.parentNode;
                            }

                            var needsContext = e.needsContext;
                            if (needsContext === undefined)
                            {
                                var reNeedsContext = (jq.expr && jq.expr.match && jq.expr.match.needsContext);
                                needsContext = (reNeedsContext && reNeedsContext.test(e.selector));
                            }
                            if (needsContext)
                            {
                                // Handle selectors like "> a".
                                return (jq(e.selector, target).filter(function()
                                {
                                    return elementSet.has(this);
                                }).length > 0);
                            }

                            return (jq.find(e.selector, target, null, elements).length > 0);
                        }
                        catch (exc)
                        {
                            if (FBTrace.DBG_EVENTS)
                                FBTrace.sysout("events.getDerivedJqueryListeners.shouldShow threw an error", exc);
                            return true;
                        }
                    }.bind(this, e);
                }
                ret.push(listener);
            }
            return ret;
        }
        catch (exc)
        {
            if (FBTrace.DBG_EVENTS)
                FBTrace.sysout("events.getDerivedJqueryListeners threw an error", exc);
            return null;
        }
    },

    getNormalEventListeners: function(target)
    {
        var context = this.context;
        var listeners = Events.getEventListenersForTarget(target);
        var hasOneHandler = new Set();
        var self = this;
        listeners.forEach(function(li)
        {
            li.disabled = false;
            li.target = target;
            li.sourceLink = Firebug.SourceFile.findSourceForFunction(li.func, context);

            var derived = self.getDerivedListeners(li.func, li.type, target) || [];
            li.derivedListeners = derived.map(function(listener)
            {
                return {
                    func: listener.func,
                    shouldShow: listener.shouldShow,
                    sourceLink: Firebug.SourceFile.findSourceForFunction(listener.func, context)
                };
            });

            var handlerName = "on" + li.type;
            if (handlerName in Object.getPrototypeOf(target) &&
                !hasOneHandler.has(handlerName) &&
                !li.capturing &&
                target[handlerName] === li.func)
            {
                // Inline event handler
                hasOneHandler.add(handlerName);
                li.enable = function()
                {
                    target[handlerName] = li.func;
                };
                li.disable = function()
                {
                    target[handlerName] = null;
                };
            }
            else
            {
                // Standard event listener
                var uwTarget = Wrapper.unwrapObject(target);
                var args = [li.type, li.func, li.capturing, li.allowsUntrusted];
                li.enable = function()
                {
                    uwTarget.addEventListener.apply(uwTarget, args);
                };
                li.disable = function()
                {
                    uwTarget.removeEventListener.apply(uwTarget, args);
                };
            }
        });
        return listeners;
    },

    getListeners: function(target)
    {
        // List first normal listeners, then disabled ones.
        var normal = this.getNormalEventListeners(target);
        var disabled = this.getDisabledMap(this.context).get(target, []);
        return normal.concat(disabled);
    },

    getOwnSection: function(element)
    {
        return categorizeListenerList(this.getListeners(element));
    },

    getInheritedSections: function(baseElement)
    {
        var ret = [];
        var context = this.context;
        var emptyTag = this.template.emptyTag;
        function addSection(object, list, inherits)
        {
            if (!list.length)
                return;

            var label = (inherits && object !== baseElement ? Locale.$STR("events.ListenersFrom") : "");
            var tag;
            if (typeof object === "string")
            {
                label = object;
                tag = emptyTag;
            }
            else
            {
                var rep = Firebug.getRep(object, context);
                tag = rep.shortTag || rep.tag;
            }

            // For non-inherited listeners, filtering by the current node doesn't make sense.
            if (!inherits)
            {
                for (let listener of list)
                {
                    for (let li of listener.derivedListeners)
                        li.shouldShow = null;
                }
            }

            ret.push({
                label: label,
                tag: tag,
                object: object,
                list: categorizeListenerList(list),
                opened: inherits
            });
        }

        var element = baseElement.parentElement;
        while (element)
        {
            var added = this.getListeners(element).filter(function(listener)
            {
                return Events.eventTypeBubbles(listener.type);
            });
            addSection(element, added, true);
            element = element.parentElement;
        }

        // Add special "document" and "window" sections, split into two parts:
        // the ones that are part of event bubbling and the ones that are not.

        var doc = baseElement.ownerDocument, docInherited = [], docOwn = [];
        if (doc)
        {
            for (let listener of this.getListeners(doc))
            {
                if (Events.eventTypeBubblesToDocument(listener.type))
                    docInherited.push(listener);
                else
                    docOwn.push(listener);
            }
        }

        var win = doc && doc.defaultView, winInherited = [], winOwn = [];
        if (win)
        {
            for (let listener of this.getListeners(win))
            {
                if (Events.eventTypeBubblesToDocument(listener.type))
                    winInherited.push(listener);
                else
                    winOwn.push(listener);
            }
        }

        addSection(doc, docInherited, true);
        addSection(win, winInherited, true);
        addSection(doc, docOwn, false);
        addSection(win, winOwn, false);
        var apc = win && win.applicationCache;
        // XXX localize
        if (apc)
            addSection("Application Cache", this.getListeners(apc), false);

        return ret;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    toggleDisableRow: function(row)
    {
        var listener = row.listenerObject;
        var shouldDisable = !listener.disabled;
        listener.disabled = shouldDisable;

        // Change the disabled styling. N.B.: When the panel is refreshed, this
        // row will be placed to the bottom. We don't move it there yet though,
        // because that would be confusing.
        if (shouldDisable)
            row.classList.add("disabled");
        else
            row.classList.remove("disabled");

        var target = listener.target;
        var disabledMap = this.getDisabledMap(this.context);
        if (!disabledMap.has(target))
            disabledMap.set(target, []);
        var map = disabledMap.get(target);

        if (shouldDisable)
        {
            map.push(listener);
            listener.disable();
        }
        else
        {
            var index = map.indexOf(listener);
            map.splice(index, 1);
            listener.enable();
        }
    },

    // XXX(simon): This is almost identical to code in css/computedPanel,
    // css/selectorPanel and js/breakpoints - we should share it somehow.
    toggleGroup: function(node)
    {
        node.classList.toggle("opened");
        if (node.classList.contains("opened"))
        {
            var offset = Dom.getClientOffset(node);
            var titleAtTop = offset.y < this.panelNode.scrollTop;

            Dom.scrollTo(node, this.panelNode, null,
                node.offsetHeight > this.panelNode.clientHeight || titleAtTop ? "top" : "bottom");
        }
    },

    refresh: function()
    {
        this.updateSelection(this.selection);
    },

    onClick: function(event)
    {
        var target = event.target;
        if (!Events.isLeftClick(event))
            return;

        var header = Dom.getAncestorByClass(target, "listenerInheritHeader");
        if (header)
        {
            this.toggleGroup(header.parentNode);
            Events.cancelEvent(event);
        }
        else if (target.classList.contains("listenerIndent") &&
            target.parentNode.classList.contains("originalListener"))
        {
            var row = Dom.getAncestorByClass(target, "listenerLineGroup");
            this.toggleDisableRow(row);
            Events.cancelEvent(event);
        }
    },

    getContextMenuItems: function()
    {
        return [
            {
                label: "Refresh",
                tooltiptext: "panel.tip.Refresh",
                command: this.refresh.bind(this)
            }
        ];
    },
});

// ********************************************************************************************* //
// Helpers


function categorizeListenerList(list)
{
    var map = new Map(), keys = [];
    for (let ev of list)
    {
        let type = ev.type;
        if (!map.has(type))
        {
            map.set(type, []);
            keys.push(type);
        }
        map.get(type).push(ev);
    }
    keys.sort();

    var ret = [];
    for (let type of keys)
    {
        ret.push({
            type: type,
            list: map.get(type)
        });
    }
    return ret;
}

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(EventsPanel);

return EventsPanel;

// ********************************************************************************************* //
});
