/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/wrapper",
],
function(Obj, Firebug, D, Wrapper) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Cu = Components.utils;

var service = Cc["@mozilla.org/eventlistenerservice;1"].getService(Ci.nsIEventListenerService);

// ********************************************************************************************* //
// Events Panel (HTML side panel)

function EventsPanel() {}

EventsPanel.prototype = Obj.extend(Firebug.Panel,
{
    name: "html-events",
    title: $STR("events.Events"),
    parentPanel: "html",
    // XXX: What about a11y...
    order: 4,

    template: D.domplate(
    {
        // XXX domplates!
        /*
        cascadedTag:
            DIV({"class": "a11yCSSView", role: "presentation"},
                DIV({"class": "cssNonInherited", role: "list",
                        "aria-label": Locale.$STR("aria.labels.style rules") },
                    FOR("rule", "$rules",
                        TAG("$ruleTag", {rule: "$rule"})
                    )
                ),
                DIV({role: "list", "aria-label": Locale.$STR("aria.labels.inherited style rules")},
                    FOR("section", "$inherited",
                        H1({"class": "cssInheritHeader groupHeader focusRow", role: "listitem" },
                            SPAN({"class": "cssInheritLabel"}, "$inheritLabel"),
                            TAG(FirebugReps.Element.shortTag, {object: "$section.element"})
                        ),
                        DIV({role: "group"},
                            FOR("rule", "$section.rules",
                                TAG("$ruleTag", {rule: "$rule"})
                            )
                        )
                    )
                 )
            ),

        ruleTag:
            DIV({"class": "cssElementRuleContainer"},
                TAG(Firebug.CSSStyleRuleTag.tag, {rule: "$rule"}),
                TAG(FirebugReps.SourceLink.tag, {object: "$rule.sourceLink"})
            ),

        newRuleTag:
            DIV({"class": "cssElementRuleContainer"},
                DIV({"class": "cssRule insertBefore", style: "display: none"}, "")
            ),

        CSSFontPropValueTag:
                FOR("part", "$propValueParts",
                    SPAN({"class": "$part.type|getClass", _repObject: "$part.font"}, "$part.value"),
                    SPAN({"class": "cssFontPropSeparator"}, "$part|getSeparator")
                ),

        getSeparator: function(part)
        {
            if (part.lastFont || part.type == "important")
                return "";

            if (part.type == "otherProps")
                return " ";

            return ",";
        },

        getClass: function(type)
        {
            switch (type)
            {
                case "used":
                    return "cssPropValueUsed";

                case "unused":
                    return "cssPropValueUnused";

                default:
                    return "";
            }
        }
        */
    }),

    updateSelection: function(selection)
    {
FBTrace.sysout("updateselection", selection);
        if (!(element instanceof Element))
            return;
        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("events.updateSelection; " + element.localName);

        var own = this.getOwnSection(selection);
        var inherited = this.getInheritedSections(selection);
        if (!own.length && !inherited.length)
        {
            FirebugReps.Warning.tag.replace({object: "events.NoEventListeners"}, this.panelNode);
            return;
        }

        this.tag.replace({own: own, inherited: inherited}, this.panelNode);
    },

    getOwnSection: function(element)
    {
        return categorizeListenerList(getListeners(element));
    },

    getInheritedSections: function(baseElement)
    {
        var ret = [];
        function addSection(name, object, list, expanded)
        {
            ret.push({
                name: name,
                object: object,
                list: categorizeListenerList(list),
                expanded: expanded
            });
        }

        var chain = service.getEventTargetChainFor(baseElement, {});
        var onDoc = [], onWin = [], theDoc = null, theWin = null;
        for (var i = 1; i < chain.length; ++i)
        {
            var el = chain[i];
            var isDoc = (el instanceof Document), isWin = (el instanceof Window);
            var addSpecialTo = (isDoc ? asDoc : (isWin ? asWin : null));
            var listeners = getListeners(el);
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

function getListeners(element)
{
    var listeners = service.getEventListenerInfoFor(el, {});
    var ret = [];
    for (var i = 0; i < listeners.length; ++i)
    {
        var listener = listeners[i];
        var type = listener.type, capturing = listener.capturing, func;
        if (typeof listener.listenerObject !== "undefined")
        {
            func = listener.listenerObject;
        }
        else
        {
            var debugObject = listener.getDebugObject();
            func = (debugObject && Wrapper.unwrapIValue(debugObject));
        }

        // Skip chrome event listeners. XXX Is this reasonable?
        // Should we check whether things are in Firebug's compartment instead?
        if (!func || listener.inSystemEventGroup)
            continue;
        var funcGlobal = Cu.getGlobalForObject(func);
        if (!(funcGlobal instanceof Window))
            continue;
        if (funcGlobal.document.nodePrincipal.subsumes(document.nodePrincipal))
            continue;

        ret.push({
            type: type,
            capturing: capturing,
            func: func
        });
    }
    return ret;
}

function categorizeListenerList(list)
{
    var map = new Map();
    for (let ev of list)
    {
        var type = ev.type;
        if (!map.has(type))
            map.set(type, []);
        map.get(type).push(ev);
    }

    var ret = [];
    for (let type of map.keys())
    {
        var list = map.get(type);
        ret.push({
            type: type,
            list: list
        });
    }
    return ret;
}

// ********************************************************************************************* //
// Registration

// XXX detect Eventbug

Firebug.registerPanel(CSSStylePanel);

return CSSStylePanel;

// ********************************************************************************************* //
});
