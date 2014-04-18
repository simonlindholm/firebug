/* See license.txt for terms of usage */
/*jshint esnext:true, curly:false, loopfunc:true*/
/*global Components:1, define:1, Element:1*/

// TODO:
// UI:
// - clicking event handlers doesn't do anything (are they even in the script panel?) (not until they have run?)
// - collapsed headers shouldn't have spacing between them
// - styling of event groups, collapsible?, headery
// - replace derived listener right arrow symbol by image, for cross-platform stability
//   (note: need to gray if out if disabled/not applying)
// - capture
// - a11y, RTL...
// - all XXX's
// Functionality:
// - detect eventbug (maybe)

// Other:
// - see if there are more extra event targets?
// - new issue about having source code as title
// - dynamic updates for jQuery listeners will be awful. watch('length') technically works, but timeouts are probably a better idea.
// - source links should work even without script panel
// - derived listeners on Google Code:
//  - one listener is "function(ev) { otherfunction(ev); }"
//  - another has two steps of indirection, and the second is very non-trivial (jQuery-like)...
//  - generally I am seeing a lot of double indirection, if it could be handled through the same code-path it would be great

// Testing TODO:
// - disabling event listener, event handlers, attribute event handlers
// - jquery filtering by descendant selector
// - duplicate listeners and such
// - derived listeners (jQuery and others)
// - capture, source links

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/dom",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "firebug/lib/locale",
    "firebug/chrome/menu",
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/lib/wrapper",
    "firebug/chrome/reps",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/script/sourceFile",
    "firebug/remoting/debuggerClient",
],
function(Firebug, FBTrace, Dom, Domplate, Events, Locale, Menu, Obj, Options, Wrapper, FirebugReps,
    DebuggerLib, SourceFile, DebuggerClient) {

"use strict";

// ********************************************************************************************* //
// Constants

var {domplate, DIV, FOR, TAG, H1, H2, SPAN} = Domplate;
var Cu = Components.utils;

var Trace = FBTrace.to("DBG_EVENTS");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// Events Panel (HTML side panel)

function EventsPanel() {}

EventsPanel.prototype = Obj.extend(Firebug.Panel,
{
    name: "html-events",
    parentPanel: "html",
    order: 4,

    template: domplate(
    {
        cascadedTag:
            DIV(
                DIV({"class": "listenersNonInherited",
                        "aria-label": Locale.$STR("a11y.labels.event_listeners")},
                    TAG("$sectionTag", {object: "$element", list: "$own"})
                ),
                DIV({role: "list", "aria-label": Locale.$STR("a11y.labels.inherited_event_listeners")},
                    FOR("section", "$inherited",
                        DIV({"class": "listenerLabeledSection foldableGroup", $opened: "$section.opened"},
                            H1({"class": "listenerInheritHeader groupHeader focusRow", role: "listitem"},
                                DIV({"class": "twisty", role: "presentation"}),
                                SPAN({"class": "listenerInheritLabel"}, "$section.label"),
                                TAG("$section.tag", {object: "$section.object"})
                            ),
                            TAG("$sectionTag", {object: "$section.object", list: "$section.list"})
                        )
                    )
                 )
            ),

        sectionTag:
            DIV({"class": "listenerSection", role: "group", _sectionTarget: "$object"},
                FOR("category", "$list",
                    TAG("$categoryTag", {category: "$category"})
                )
            ),

        categoryTag:
            DIV({"class": "listenerCategory"},
                H2({"class": "listenerCategoryHeader"}, "$category.type"),
                FOR("listener", "$category.list",
                    TAG("$listenerTag", {listener: "$listener"})
                )
            ),

        listenerTag:
            DIV({"class": "listenerLineGroup", $disabled: "$listener.disabled",
                _listenerObject: "$listener"},
                DIV({"class": "listenerLine originalListener"},
                    SPAN({"class": "listenerIndent", "role": "presentation"}),
                    TAG(FirebugReps.Func.tag, {object: "$listener.func"}),
                    SPAN({"class": "listenerCapturing", "hidden": "$listener|capturingHidden"}, "C"), // XXX
                    TAG(FirebugReps.SourceLink.tag, {object: "$listener.sourceLink"})),
                FOR("derivedListener", "$listener.derivedListeners",
                    DIV({"class": "listenerLine derivedListener", $doesNotApply: "$derivedListener.doesNotApply"},
                        SPAN({"class": "listenerIndent", "role": "presentation"}),
                        TAG(FirebugReps.Func.tag, {object: "$derivedListener.func"}),
                        SPAN({"class": "selector"}, "$derivedListener|getSelectorText"),
                        TAG(FirebugReps.SourceLink.tag, {object: "$derivedListener.sourceLink"}))
                )
            ),

        noOwnListenersTag:
            DIV({"class": "noOwnListenersText"}, "$text"),

        emptyTag: SPAN(),

        capturingHidden: function(listener)
        {
            return listener.capturing ? undefined : "";
        },

        getSelectorText: function(listener)
        {
            if (!listener.selector)
                return "";
            // XXX Localize
            return " (" + listener.selector + ")";
        },
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
        DebuggerClient.addListener(this);
    },

    destroyNode: function()
    {
        DebuggerClient.removeListener(this);
        Events.removeEventListener(this.panelNode, "click", this.onClick, false);
        Firebug.Panel.destroyNode.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    isDebuggerEnabled: function()
    {
        return this.context.isPanelEnabled("script") && this.context.activeThread;
    },

    shouldShowDerivedListeners: function()
    {
        return Options.get("showDerivedListeners") && this.isDebuggerEnabled();
    },

    updateOption: function(name)
    {
        if (name === "showDerivedListeners")
            this.refresh();
    },

    updateSelection: function(selection)
    {
        if (!(selection instanceof Element))
            return;
        Trace.sysout("events.updateSelection; " + selection.localName);

        try
        {
            var own = this.getOwnSection(selection);
            var inherited = this.getInheritedSections(selection);
            this.template.cascadedTag.replace({element: selection, own: own, inherited: inherited},
                this.panelNode);

            var firstSection = this.panelNode.getElementsByClassName("listenerSection")[0];
            if (!firstSection.firstChild)
            {
                var text = Locale.$STR("events.noEventListeners");
                this.template.noOwnListenersTag.replace({text: text}, firstSection);
            }
        }
        catch (exc)
        {
            TraceError.sysout("events.updateSelection FAILS", exc);
        }
    },

    onThreadAttached: function()
    {
        // Refresh the panel if the debugger becomes enabled, so we get source links.
        if (this.context.sidePanelName === this.name)
            this.refresh();
    },

    getDisabledMap: function(context)
    {
        if (!context.listenerDisabledMap)
            context.listenerDisabledMap = new WeakMap();
        return context.listenerDisabledMap;
    },

    getDerivedListeners: function(func, type, target)
    {
        // Try to see if the listener (often from a library) wraps another user-defined
        // listener, and if so extract the user-defined listener(s). We do this through
        // pattern-matching on function calls that go through call or apply, which are
        // often used to set 'this' to something which is reasonable from a library user's
        // point of view, but are rather uncommon outside of library code. We then use
        // debugger magic to extract the original functions from the listener's closure.
        var src = String(func);
        var mIndirection = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\.(call|apply)/.exec(src);
        if (!mIndirection)
            return null;
        var funcName = mIndirection[1];

        var global = Cu.getGlobalForObject(func);
        var dbgGlobal = DebuggerLib.getThreadDebuggeeGlobalForContext(this.context, global);
        var dbgFunc = dbgGlobal && dbgGlobal.makeDebuggeeValue(func);
        var dbgEnv = dbgFunc && dbgFunc.environment;
        if (!dbgEnv)
            return null;

        if (src.charAt(mIndirection.index - 1) === ".")
        {
            // Not a direct call; bail. Before we give up entirely, try one last special case:
            // jQuery. For reasons of old-IE compat and extensibility, jQuery (and only jQuery)
            // stores all event listeners in a data structure separated from the closure of the
            // listener function. We special-case it only because it is so common.
            return this.getDerivedJqueryListeners(target, type, dbgEnv, funcName, src);
        }

        dbgEnv = dbgEnv.find(funcName);
        if (!dbgEnv || !dbgEnv.parent)
            return null;
        var dbgDerivedF = dbgEnv.getVariable(funcName);
        var derivedF = DebuggerLib.unwrapDebuggeeValue(dbgDerivedF);
        if (typeof derivedF !== "function")
            return null;
        return [{func: derivedF}];
    },

    getDerivedJqueryListeners: function(target, type, dbgEnv, funcName, src)
    {
        if (funcName !== "handle" && funcName !== "dispatch")
            return null;
        try
        {
            // Pattern match on the occurance of '<minified name>.event.<funcName>.apply'.
            var matches = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\.event\.(dispatch|handle)\.apply/.exec(src);
            var jqName = (matches && matches[1]) || "";
            dbgEnv = dbgEnv.find(jqName);
            var dbgJq = dbgEnv && dbgEnv.getVariable(jqName);
            if (!dbgJq)
                return null;

            var jq = DebuggerLib.unwrapDebuggeeValue(dbgJq);
            var eventData = jq._data(target, "events");
            var listeners = eventData && eventData[type];
            if (!listeners)
                return null;

            var ret = [];
            for (var i = 0; i < listeners.length; i++)
            {
                let e = listeners[i];
                let listener = {
                    func: e.origHandler || e.handler
                };
                if (typeof listener.func !== "function")
                    continue;

                let selector = e.selector;
                if (typeof selector === "string")
                {
                    var needsContext = e.needsContext;
                    listener.selector = selector;
                    listener.appliesToElement = (element) =>
                        this.jQueryListenerApplies(jq, target, selector, needsContext, element);
                }
                ret.push(listener);
            }
            return ret;
        }
        catch (exc)
        {
            Trace.sysout("events.getDerivedJqueryListeners threw an error", exc);
            return null;
        }
    },

    jQueryListenerApplies: function(jq, target, selector, needsContext, element)
    {
        try
        {
            // Only show this listener if jQuery runs it on this node, i.e., if the
            // element or some ancestor of it matches the listener selector.
            var global = Cu.getGlobalForObject(jq);
            var elements = new global.Array(), elementSet = new Set();
            var cur = element;
            while (cur)
            {
                elements.push(cur);
                elementSet.add(cur);
                cur = cur.parentNode;
            }

            var matches;
            if (needsContext)
            {
                // Handle selectors like "> a" (for versions >= 1.9).
                matches = jq(selector, target).filter(function()
                {
                    return elementSet.has(this);
                });
            }
            else
            {
                matches = jq.find(selector, target, null, elements);
            }

            return (matches.length > 0);
        }
        catch (exc)
        {
            Trace.sysout("events.getDerivedJqueryListeners.appliesToElement threw an error", exc);
            return true;
        }
    },

    getNormalEventListeners: function(target)
    {
        var context = this.context;
        var listeners = Events.getEventListenersForTarget(target);
        var hasOneHandler = new Set();
        listeners.forEach((li) =>
        {
            li.disabled = false;
            li.target = target;
            li.sourceLink = SourceFile.findSourceForFunction(li.func, context);

            if (this.shouldShowDerivedListeners())
            {
                var derived = this.getDerivedListeners(li.func, li.type, target) || [];
                li.derivedListeners = derived.map(function(listener)
                {
                    return {
                        func: listener.func,
                        appliesToElement: listener.appliesToElement,
                        selector: listener.selector,
                        sourceLink: SourceFile.findSourceForFunction(listener.func, context)
                    };
                });
            }

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

            var inherited = (inherits && object !== baseElement);
            var label = inherited ? Locale.$STR("InheritedFrom") : Locale.$STR("events.otherListeners");
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

            for (let listener of list)
            {
                if (!listener.derivedListeners)
                    continue;
                for (let li of listener.derivedListeners)
                {
                    // For non-inherited listeners, filtering by the current node doesn't make sense.
                    if (inherits && li.appliesToElement)
                        li.doesNotApply = !li.appliesToElement(baseElement);
                    else
                        li.doesNotApply = false;
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

    // XXX(simon): This is almost identical to code in css/computedPanel, css/selectorPanel,
    // and debugger/breakpoints/breakpointReps - we should share it somehow.
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
        if (header && !Dom.getAncestorByClass(target, "objectLink"))
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

    getOptionsMenuItems: function()
    {
        var label = Locale.$STR("events.option.showDerivedListeners");
        var tooltip = Locale.$STR("events.option.tip.showDerivedListeners");
        tooltip = Locale.$STRF("script.Script_panel_must_be_enabled", [tooltip]);
        var menuItem = Menu.optionMenu(label, "showDerivedListeners", tooltip);
        menuItem.nol10n = true;
        menuItem.disabled = !this.isDebuggerEnabled();

        return [
            menuItem,
            "-",
            {
                label: "Refresh",
                tooltiptext: "panel.tip.Refresh",
                command: this.refresh.bind(this)
            }
        ];
    },

    getContextMenuItems: function(object)
    {
        if (object)
            return;
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
