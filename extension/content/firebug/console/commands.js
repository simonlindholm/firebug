/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/locale",
    "firebug/chrome/reps",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/lib/system",
    "firebug/console/eventMonitor"
],
function(Obj, Firebug, Locale, Reps, Str, Arr, System, EventMonitor) {
"use strict";

// Create a handler which parses the value as a comma-separated list of
// expressions, evaluates those, tests for error, and then finally
// passes them on to a real handler.
function exprHandler(handler, error)
{
    return function(context, value)
    {
        Firebug.CommandLine.evaluate("[\n" + value + "\n]", context, null, null,
            function success(result)
            {
                var err = error(result);
                if (err)
                    Firebug.Console.logFormatted([new Error(err)], context, "error");
                else
                    handler(context, result[0], result);
            },
            Obj.bind(Firebug.Console.log, Firebug.Console)
        );
    };
}

function needObject(args)
{
    if (args.length === 0)
        return "Object required.";
}

function monitorHandler(func, action, name)
{
    return exprHandler(function(context, obj, args)
    {
        if (typeof obj === "function")
        {
            Firebug.Debugger[func](obj, action);
            return;
        }
        Array.prototype.forEach.call(obj, function(o)
        {
            if (typeof o === "function")
                Firebug.Debugger[func](o, action);
        });
    },
    function(args)
    {
        if (args.length !== 1 || (typeof args[0] !== "function" && !Arr.isArray(args[0])))
            return "\"" + name + "\" needs a function, or an array of functions, as parameter.";
    });
}

function monitorEventsHandler(add)
{
    return exprHandler(function(context, obj, args)
    {
        var types = (args.length <= 2 ? args[1] : args.slice(1));
        if (add)
            EventMonitor.monitorEvents(obj, types, context);
        else
            EventMonitor.unmonitorEvents(obj, types, context);
    },
    function(args)
    {
        if (args.length === 0 || !(args[0] instanceof window.Node))
            return "DOM node required.";
    });
}

var commandHandlers =
{
    clear: function(context, value)
    {
        Firebug.Console.clear(context);
    },

    time: function(context, value)
    {
        var iterations = null;
        var match = /,\s*([1-9][0-9]*)$/.exec(value);
        if (match)
        {
            iterations = +match[1];
            value = value.slice(0, -match[0].length);
        }
        Firebug.Profiler.timeExecution(context, value, iterations);
    },

    profile: function(context, value)
    {
        Firebug.Profiler.startProfiling(context);
        if (!/^ *$/.test(value))
        {
            var log = Obj.bind(Firebug.Console.log, Firebug.Console);
            Firebug.CommandLine.evaluate(value, context, null, null, log, log);
            Firebug.Profiler.stopProfiling(context);
        }
    },

    unprofile: function(context, value)
    {
        Firebug.Profiler.stopProfiling(context);
    },

    cd: exprHandler(function(context, obj, args)
    {
        var win = (args.length === 0 ? context.window.wrappedJSObject : obj);
        Firebug.CommandLine.cd(context, win);
        Firebug.Console.logFormatted(["Current window: %o", context.baseWindow], context, "info");
    },
    function(args)
    {
        if (args.length > 1)
            return "Must have a single target.";
        if (args.length === 1 && !(args[0] instanceof window.Window))
            return "Object must be a window.";
    }),

    debug: monitorHandler("monitorFunction", "debug", "debug"),
    undebug: monitorHandler("unmonitorFunction", "debug", "undebug"),
    monitor: monitorHandler("monitorFunction", "monitor", "monitor"),
    unmonitor: monitorHandler("unmonitorFunction", "monitor", "unmonitor"),

    "monitor-events": monitorEventsHandler(true),
    "unmonitor-events": monitorEventsHandler(false),

    inspect: exprHandler(function(context, obj, args)
    {
        Firebug.chrome.select(obj, args[1]);
    }, needObject),

    copy: exprHandler(function(context, obj, args)
    {
        System.copyToClipboard(obj);
        var str = Locale.$STR("commandline.CopiedToClipboard");
        Firebug.Console.logFormatted([str], context, "info");
    }, needObject),

    keys: exprHandler(function(context, obj, args)
    {
        Firebug.Console.log(Arr.keys(obj), context);
    }, needObject),

    values: exprHandler(function(context, obj, args)
    {
        Firebug.Console.log(Arr.values(obj), context);
    }, needObject),

    dir: exprHandler(function(context, obj, args)
    {
        Firebug.Console.log(obj, context, "dir", Firebug.DOMPanel.DirTable);
    }, needObject),

    xml: exprHandler(function(context, obj, args)
    {
        if (obj instanceof window.Window)
            obj = obj.document;
        if (obj instanceof window.Document)
            obj = obj.documentElement;
        Firebug.Console.log(obj, context, "dirxml", Firebug.HTMLPanel.SoloElement);
    }, needObject),

    table: exprHandler(function(context, obj, args)
    {
        Reps.Table.log(obj, args[1], context);
    }, needObject)
};

Firebug.CommandLineCommands = {
    commandHandlers: commandHandlers,

    list: [
        ":cd",
        ":clear",
        ":copy",
        ":debug",
        ":dir",
        ":inspect",
        ":keys",
        ":monitor",
        ":monitor-events",
        ":profile",
        ":table",
        ":time",
        ":undebug",
        ":unmonitor",
        ":unmonitor-events",
        ":unprofile",
        ":values",
        ":xml"
    ],

    hasCommand: function(value)
    {
        return (value.charAt(0) === ":");
    },

    takesNoParams: function(value)
    {
        return ([":clear", ":unprofile"].indexOf(value) !== -1);
    },

    execute: function(value, context)
    {
        var sp = (value + " ").indexOf(" ");
        var command = value.substring(1, sp);
        var rest = value.substr(sp+1);
        if (this.commandHandlers.hasOwnProperty(command))
        {
            this.commandHandlers[command](context, rest);
        }
        else
        {
            var e = Locale.$STRF("commandline.InvalidCommand", [command]);
            Firebug.Console.logFormatted([e], context, "error");
        }
    }
};

return Firebug.CommandLineCommands;

// ********************************************************************************************* //
});
