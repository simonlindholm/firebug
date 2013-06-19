/* See license.txt for terms of usage */
/*jshint esnext:true, curly:false*/
/*global FBTrace:true, Document:true, Window:true, define:true */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/dom",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/chrome/reps",
],
function(Obj, Firebug, Domplate, Dom, Locale, Events, FirebugReps) {
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
                        // XXX collapsible ($section.expanded)
                        H1({"class": "listenerInheritHeader groupHeader focusRow", role: "listitem"},
                            SPAN({"class": "listenerInheritLabel"}, "$section.label"),
                            TAG("$section.tag", {object: "$section.object"})
                        ),
                        TAG("$sectionTag", {object: "$section.object", list: "$section.list"})
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
        function addSection(label, object, list, expanded)
        {
            var rep = Firebug.getRep(object, context);
            ret.push({
                label: label,
                tag: rep.shortTag || rep.tag,
                object: object,
                list: categorizeListenerList(list),
                expanded: expanded
            });
        }

        var chain = Events.getEventTargetChainFor(baseElement);
        var onDoc = [], onWin = [], theDoc = null, theWin = null;
        for (var i = 1; i < chain.length; ++i)
        {
            var el = chain[i];
            var isDoc = (el instanceof Document), isWin = (el instanceof Window);
            var addSpecialTo = (isDoc ? onDoc : (isWin ? onWin : null));
            var listeners = this.getListeners(el);
            var added = [];

            for (var j = 0; j < listeners.length; ++j)
            {
                var listener = listeners[j], type = listener.type;

                // Add the listener to where it belongs. Events specific to
                // document and window are moved to those special sections,
                // and non-bubbling events are ignored.
                if (addSpecialTo && !Events.eventTypeBubblesToDocument(type))
                    addSpecialTo.push(listener);
                else if (Events.eventTypeBubbles(type))
                    added.push(listener);
                else if (addSpecialTo)
                    addSpecialTo.push(listener);
            }

            if (added.length > 0)
                addSection(Locale.$STR("events.ListenersFrom"), el, added, true);
            if (isDoc)
                theDoc = el;
            if (isWin)
                theWin = el;
        }

        // Add the special "document" and "window" sections.
        if (onDoc.length > 0)
            addSection("", theDoc, onDoc, false);
        if (onWin.length > 0)
            addSection("", theWin, onWin, false);

        // XXX applicationCache etc.

        return ret;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    toggleDisableRow: function(row)
    {
        var shouldDisable = !row.classList.contains("disabled");

        // Change the disabled styling. N.B.: When the panel is refreshed, this
        // row will have moved to the bottom. We don't move it there yet though,
        // because that would be confusing.
        row.classList.toggle("disabled");

        var listener = row.listenerObject;
        var target = Dom.getAncestorByClass(row, "listenerSection").sectionTarget;
        listener.disabled = shouldDisable;

        var disabledMap = this.getDisabledMap(this.context);
        if (!disabledMap.has(target))
            disabledMap.set(target, []);
        var map = disabledMap.get(target);

        // XXX need to test these additions/removals
        if (shouldDisable)
        {
            map.push(listener);
            target.removeEventListener(listener.type, listener.func, listener.capturing, listener.allowsUntrusted);
        }
        else
        {
            var index = map.indexOf(listener);
            map.splice(index, 1);
            target.addEventListener(listener.type, listener.func, listener.capturing, listener.allowsUntrusted);
        }
    },

    onClick: function(event)
    {
        var target = event.target;
        if (Events.isLeftClick(event) && target.classList.contains("listenerIndent"))
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
