/* See license.txt for terms of usage */
/*jshint esnext:true, curly:false*/
/*global FBTrace:true, Components:true, Document:true, Window:true, define:true */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/chrome/reps",
],
function(Obj, Firebug, Domplate, Locale, Events, FirebugReps) {
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
        // XXX domplates!
        cascadedTag:
            DIV(
                DIV({"class": "listenersNonInherited", role: "list",
                        "aria-label": Locale.$STR("aria.labels.event listeners") },
                    FOR("category", "$own",
                        TAG("$categoryTag", {category: "$category"})
                    )
                ),
                DIV({role: "list", "aria-label": Locale.$STR("aria.labels.inherited event listeners")},
                    FOR("section", "$inherited",
                        // XXX collapsible ($section.expanded)
                        H1({"class": "listenerInheritHeader groupHeader focusRow", role: "listitem"},
                            SPAN({"class": "listenerInheritLabel"}, "$section.label"),
                            TAG("$section.tag", {object: "$section.object"})
                        ),
                        DIV({role: "group"},
                            FOR("category", "$section.list",
                                TAG("$categoryTag", {category: "$category"})
                            )
                        )
                    )
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
            DIV(
                // XXX indentation
                TAG(FirebugReps.Func.tag, {object: "$listener.func"})
                // XXX capturing
                // XXX source link:
                // TAG(FirebugReps.SourceLink.tag, {object: "$rule.sourceLink"})
            )
    }),

    updateSelection: function(selection)
    {
FBTrace.sysout("updateselection", selection);
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

        this.template.cascadedTag.replace({own: own, inherited: inherited}, this.panelNode);
    },

    getOwnSection: function(element)
    {
        return categorizeListenerList(Events.getEventListenersForElement(element));
    },

    getInheritedSections: function(baseElement)
    {
        var ret = [];
        var context = this.context;
FBTrace.sysout("context", context);
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
            var listeners = Events.getEventListenersForElement(el);
            var added = [];

            for (var j = 0; j < listeners.length; ++j)
            {
                var listener = listeners[j], type = listener.type;

                // Add the listener to where it belongs. Events specific to
                // document and window are moved to those special sections,
                // and non-bubbling events are ignored.
                if (onlyForDocumentAndWindow(type) && addSpecialTo)
                    addSpecialTo.push(listener);
                else if (bubbles(type, baseElement))
                    added.push(listener);
                else if (addSpecialTo)
                    addSpecialTo.push(listener);
            }

            if (added.length > 0)
                addSection("events.ListenersFrom", el, added, true);
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

        return ret;
    },

});

// ********************************************************************************************* //
// Helpers

var nonBubbling = {"blur": 1, "focus": 1, "beforeunload": 1, "load": 1, "error": 1, "unload": 1};
function bubbles(type, element)
{
    if (nonBubbling.hasOwnProperty(type))
        return false;
    if (type === "scroll")
        return (element instanceof Document);
    return true;
}

var onlyDocAndWin = {"DOMContentLoaded": 1, "message": 1}; // XXX etc.
function onlyForDocumentAndWindow(type)
{
    return onlyDocAndWin.hasOwnProperty(type);
}

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
