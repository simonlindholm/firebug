/* See license.txt for terms of usage */
/*jshint esnext:true, curly:false*/
/*global FBTrace:true, Document:true, Window:true, define:true */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/dom",
    "firebug/lib/wrapper",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/chrome/reps",
],
function(Obj, Firebug, Domplate, Dom, Wrapper, Locale, Events, FirebugReps) {
"use strict";

// ********************************************************************************************* //
// Constants

const {domplate, DIV, FOR, TAG, H1, SPAN} = Domplate;

// ********************************************************************************************* //
// Events Panel (HTML side panel)

function EventsPanel() {}

EventsPanel.prototype = Obj.extend(Firebug.Panel,
{
    name: "html-events",
    title: Locale.$STR("events.Events"),
    parentPanel: "html",
    // XXX: What about a11y...
    order: 4,

    template: domplate(
    {
        cascadedTag:
            DIV(
                DIV({"class": "listenersNonInherited", role: "list",
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
                // XXX collapsible headers or something
                DIV("$category.type"),
                FOR("listener", "$category.list",
                    TAG("$listenerTag", {listener: "$listener"})
                )
            ),

        listenerTag:
            DIV({"class": "listenerLine", $disabled: "$listener.disabled",
                _listenerObject: "$listener"},
                SPAN({"class": "listenerIndent"}),
                TAG(FirebugReps.Func.tag, {object: "$listener.func"})
                // XXX capturing
                // XXX source link:
                // TAG(FirebugReps.SourceLink.tag, {object: "$rule.sourceLink"})
            )
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

        var own = this.getOwnSection(selection);
        var inherited = this.getInheritedSections(selection);
        if (!own.length && !inherited.length)
        {
            FirebugReps.Warning.tag.replace({object: "events.NoEventListeners"}, this.panelNode);
            return;
        }

        this.template.cascadedTag.replace({element: selection, own: own, inherited: inherited}, this.panelNode);
    },

    getDisabledMap: function(context)
    {
        if (!context.listenerDisabledMap)
            context.listenerDisabledMap = new WeakMap();
        return context.listenerDisabledMap;
    },

    getListeners: function(target)
    {
        // List first normal listeners, then disabled ones.
        var normal = Events.getEventListenersForElement(target);
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
        function addSection(label, object, list, opened)
        {
            if (!list.length)
                return;
            var rep = Firebug.getRep(object, context);
            ret.push({
                label: label,
                tag: rep.shortTag || rep.tag,
                object: object,
                list: categorizeListenerList(list),
                opened: opened
            });
        }

        var element = baseElement.parentElement;
        while (element)
        {
            var added = this.getListeners(element).filter(function(listener)
            {
                return Events.eventTypeBubbles(listener.type);
            });
            addSection(Locale.$STR("events.ListenersFrom"), element, added, true);
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

        addSection(Locale.$STR("events.ListenersFrom"), doc, docInherited, true);
        addSection(Locale.$STR("events.ListenersFrom"), win, winInherited, true);
        addSection("", doc, docOwn, false);
        addSection("", win, winOwn, false);

        // XXX applicationCache etc.

        return ret;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    toggleDisableRow: function(row)
    {
        var shouldDisable = !row.classList.contains("disabled");

        // Change the disabled styling. N.B.: When the panel is refreshed, this
        // row will be placed to the bottom. We don't move it there yet though,
        // because that would be confusing.
        row.classList.toggle("disabled");

        var listener = row.listenerObject;
        var target = Dom.getAncestorByClass(row, "listenerSection").sectionTarget;
        listener.disabled = shouldDisable;

        var disabledMap = this.getDisabledMap(this.context);
        if (!disabledMap.has(target))
            disabledMap.set(target, []);
        var map = disabledMap.get(target);

        var uwTarget = Wrapper.unwrapObject(target);
        var args = [listener.type, listener.func, listener.capturing, listener.allowsUntrusted];
        if (shouldDisable)
        {
            map.push(listener);
            uwTarget.removeEventListener.apply(uwTarget, args);
        }
        else
        {
            var index = map.indexOf(listener);
            map.splice(index, 1);
            uwTarget.addEventListener.apply(uwTarget, args);
        }
    },

    // XXX This is almost identical to code in css/computedPanel,
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
        else if (target.classList.contains("listenerIndent"))
        {
            var row = Dom.getAncestorByClass(target, "listenerLine");
            this.toggleDisableRow(row);
            Events.cancelEvent(event);
        }
    },
});

// ********************************************************************************************* //
// Helpers


function categorizeListenerList(list)
{
    var map = new Map();
    for (let ev of list)
    {
        let type = ev.type;
        if (!map.has(type))
            map.set(type, []);
        map.get(type).push(ev);
    }

    var ret = [];
    for (let type of map.keys())
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

// XXX detect Eventbug

Firebug.registerPanel(EventsPanel);

return EventsPanel;

// ********************************************************************************************* //
});
