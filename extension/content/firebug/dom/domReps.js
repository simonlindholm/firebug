/* See license.txt for terms of usage */
/*jshint esnext:true, es5:true, curly:false */
/*global FBTrace:true, XPCNativeWrapper:true, Window:true, define:true */

define([
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/options",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/string",
    "firebug/dom/toggleBranch",
    "firebug/dom/domModule",
    "firebug/dom/domMemberProvider",
],
function(Firebug, D, FirebugReps, Locale, Events, Options, Dom, Css, Str, ToggleBranch,
    DOMModule, DOMMemberProvider) {

"use strict";

// ********************************************************************************************* //
// Constants

const insertSliceSize = 18;
const insertInterval = 40;

// ********************************************************************************************* //

var WatchRowTag =
    D.TR({"class": "watchNewRow", level: 0},
        D.TD({"class": "watchEditCell", colspan: 3},
            D.DIV({"class": "watchEditBox a11yFocusNoTab", role: "button", tabindex: "0",
                "aria-label": Locale.$STR("a11y.labels.press enter to add new watch expression")},
                    Locale.$STR("NewWatch")
            )
        )
    );

var SizerRow =
    D.TR({role: "presentation"},
        D.TD(),
        D.TD({width: "30%"}),
        D.TD({width: "70%"})
    );

var DirTablePlate = D.domplate(Firebug.Rep,
{
    memberRowTag:
        D.TR({"class": "memberRow $member.open $member.type\\Row", _domObject: "$member",
            $hasChildren: "$member.hasChildren",
            $cropped: "$member.value|isCropped",
            role: "presentation",
            level: "$member.level",
            breakable: "$member.breakable",
            breakpoint: "$member.breakpoint",
            disabledBreakpoint: "$member.disabledBreakpoint"},
            D.TD({"class": "memberHeaderCell"},
                D.DIV({"class": "sourceLine memberRowHeader", onclick: "$onClickRowHeader"},
                    "&nbsp;"
               )
            ),
            D.TD({"class": "memberLabelCell", style: "padding-left: $member.indent\\px",
                role: "presentation"},
                D.DIV({"class": "memberLabel $member.type\\Label", title: "$member.title"},
                    D.SPAN({"class": "memberLabelPrefix"}, "$member.prefix"),
                    D.SPAN({title: "$member|getMemberNameTooltip"}, "$member.name")
                )
            ),
            D.TD({"class": "memberValueCell", $readOnly: "$member.readOnly",
                role: "presentation"},
                D.TAG("$member.tag", {object: "$member.value"})
            )
        ),

    tag:
        D.TABLE({"class": "domTable", cellpadding: 0, cellspacing: 0, onclick: "$onClick",
            _repObject: "$object", role: "tree",
            "aria-label": Locale.$STR("aria.labels.dom properties")},
            D.TBODY({role: "presentation"},
                SizerRow,
                D.FOR("member", "$object|memberIterator",
                    D.TAG("$memberRowTag", {member: "$member"})
                )
            )
        ),

    watchTag:
        D.TABLE({"class": "domTable", cellpadding: 0, cellspacing: 0,
               _toggles: "$toggles", _domPanel: "$domPanel", onclick: "$onClick", role: "tree"},
            D.TBODY({role: "presentation"},
                SizerRow,
                WatchRowTag
            )
        ),

    tableTag:
        D.TABLE({"class": "domTable", cellpadding: 0, cellspacing: 0,
            _toggles: "$toggles", _domPanel: "$domPanel", onclick: "$onClick",
            role: "tree", "aria-label": Locale.$STR("a11y.labels.dom_properties")},
            D.TBODY({role: "presentation"},
                SizerRow
            )
        ),

    rowTag:
        D.FOR("member", "$members",
            D.TAG("$memberRowTag", {member: "$member"})
        ),

    memberIterator: function(object)
    {
        var memberProvider = new DOMMemberProvider(null);
        var members = memberProvider.getMembers(object, 0);
        if (members.length)
            return members;

        return [{
            name: Locale.$STR("firebug.dom.noChildren2"),
            type: "string",
            rowClass: "memberRow-string",
            tag: Firebug.Rep.tag,
            prefix: ""
        }];
    },

    isCropped: function(value)
    {
        return typeof value == "string" && value.length > Options.get("stringCropLength");
    },

    getMemberNameTooltip: function(member)
    {
        return member.title || member.scopeNameTooltip;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onClick: function(event)
    {
        if (!Events.isLeftClick(event))
            return;

        var row = Dom.getAncestorByClass(event.target, "memberRow");
        var label = Dom.getAncestorByClass(event.target, "memberLabel");
        var valueCell = row.getElementsByClassName("memberValueCell").item(0);
        var object = Firebug.getRepObject(event.target);
        var target = row.lastChild.firstChild;
        var isString = Css.hasClass(target,"objectBox-string");
        var inValueCell = (event.target === valueCell || event.target === target);

        if (label && (Css.hasClass(row, "hasChildren") || (isString && !inValueCell)))
        {
            row = label.parentNode.parentNode;
            this.toggleRow(row);
            Events.cancelEvent(event);
        }
        else
        {
            if (typeof object === "function")
            {
                Firebug.chrome.select(object, "script");
                Events.cancelEvent(event);
            }
            else if ((!object || typeof object !== "object") && Events.isDoubleClick(event))
            {
                var panel = row.parentNode.parentNode.domPanel;
                if (panel)
                {
                    // XXX this should use member.value
                    var rowValue = panel.getRowPropertyValue(row);
                    if (typeof rowValue === "boolean")
                        panel.setPropertyValue(row, ""+!rowValue);
                    else
                        panel.editProperty(row);

                    Events.cancelEvent(event);
                }
            }
        }
    },

    toggleRow: function(row)
    {
        var level = parseInt(row.getAttribute("level"), 10);
        var table = Dom.getAncestorByClass(row, "domTable");
        var toggles = table.toggles;
        if (!toggles)
            toggles = table.repObject.toggles;

        var domPanel = table.domPanel;
        if (!domPanel)
        {
            var panel = Firebug.getElementPanel(row);
            domPanel = panel.context.getPanel("dom");
        }

        if (!domPanel)
            return;

        var context = domPanel.context;
        var target = row.lastChild.firstChild;
        var isString = Css.hasClass(target, "objectBox-string");

        if (Css.hasClass(row, "opened"))
        {
            Css.removeClass(row, "opened");

            if (isString)
            {
                var rowValue = row.domObject.value;
                row.lastChild.firstChild.textContent = '"' + Str.cropMultipleLines(rowValue) + '"';
            }
            else
            {
                if (toggles)
                {
                    var path = Firebug.DOMBasePanel.getPath(row);

                    // Remove the path from the toggle tree
                    for (var i = 0; i < path.length; ++i)
                    {
                        if (i === path.length-1)
                            toggles.remove(path[i]);
                        else
                            toggles = toggles.get(path[i]);
                    }
                }

                var rowTag = this.rowTag;
                var tbody = row.parentNode;

                setTimeout(function()
                {
                    for (var firstRow = row.nextSibling; firstRow; firstRow = row.nextSibling)
                    {
                        if (parseInt(firstRow.getAttribute("level"), 10) <= level)
                            break;

                        tbody.removeChild(firstRow);
                    }
                }, row.insertTimeout ? row.insertTimeout : 0);
            }
        }
        else
        {
            Css.setClass(row, "opened");
            if (isString)
            {
                var rowValue = row.domObject.value;
                row.lastChild.firstChild.textContent = '"' + rowValue + '"';
            }
            else
            {
                if (toggles)
                {
                    var path = Firebug.DOMBasePanel.getPath(row);

                    // Mark the path in the toggle tree
                    for (var i = 0; i < path.length; ++i)
                    {
                        var name = path[i];
                        if (toggles.get(name))
                            toggles = toggles.get(name);
                        else
                            toggles = toggles.set(name, new ToggleBranch.ToggleBranch());
                    }
                    if (FBTrace.DBG_DOMPLATE)
                        FBTrace.sysout("toggleRow mark path "+toggles);
                }

                var members = domPanel.getMembers(target.repObject, level+1);

                var rowTag = this.rowTag;
                var lastRow = row;

                var delay = 0;
                var setSize = members.length;
                var rowCount = 1;
                while (members.length)
                {
                    let slice = members.splice(0, insertSliceSize);
                    let isLast = !members.length;
                    setTimeout(function()
                    {
                        if (lastRow.parentNode)
                        {
                            var result = rowTag.insertRows({members: slice}, lastRow);
                            lastRow = result[1];

                            Events.dispatch(DOMModule.fbListeners, "onMemberRowSliceAdded",
                                [null, result, rowCount, setSize]);

                            rowCount += insertSliceSize;
                        }

                        if (isLast)
                            delete row.insertTimeout;
                    }, delay);

                    delay += insertInterval;
                }

                row.insertTimeout = delay;
            }
        }
    },

    onClickRowHeader: function(event)
    {
        Events.cancelEvent(event);

        var rowHeader = event.target;
        if (!Css.hasClass(rowHeader, "memberRowHeader"))
            return;

        var row = Dom.getAncestorByClass(event.target, "memberRow");
        if (!row)
            return;

        var panel = row.parentNode.parentNode.domPanel;
        if (panel)
        {
            var scriptPanel = panel.context.getPanel("script", true);
            if (!scriptPanel || !scriptPanel.isEnabled())
                return;     // set the breakpoint only if the script panel will respond.
            panel.breakOnProperty(row);
        }
    }
});

var ToolboxPlate = D.domplate(
{
    tag:
        D.DIV({"class": "watchToolbox", _domPanel: "$domPanel", onclick: "$onClick"},
            D.SPAN({"class": "watchDeleteButton closeButton"})
        ),

    onClick: function(event)
    {
        var toolbox = event.currentTarget;
        toolbox.domPanel.deleteWatch(toolbox.watchRow);
    }
});

// ********************************************************************************************* //
// Registration

return {
    ToolboxPlate: ToolboxPlate,
    DirTablePlate: DirTablePlate,
    insertSliceSize: insertSliceSize,
    insertInterval: insertInterval,
};

// ********************************************************************************************* //
});
