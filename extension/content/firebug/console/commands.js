/* See license.txt for terms of usage */
/*global define: true */

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

// Signal used to designate that a command should not be shown in the
// completion box, but still works. (Used e.g. for ":unprofile" when
// not profiling.)
var DISCOURAGED = {};

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

function require(handler, checker)
{
    var oldReq = handler._require;
    handler._require = function(context)
    {
        var ret = checker(context);
        if (ret)
        {
            // The command is disallowed/discouraged. Pass on the strongest signal
            // from the chain.
            if (ret === DISCOURAGED)
                return (oldReq && oldReq(context)) || ret;
            else
                return ret;
        }
        return oldReq && oldReq(context);
    };
    return handler;
}

function requireScriptPanel(handler, name)
{
    return require(handler, function(context)
    {
        var scriptPanel = context.getPanel("script");
        if (!scriptPanel || !scriptPanel.isEnabled())
        {
            if (name)
                return Locale.$STRF("commandline.CommandNeedsScriptPanel", [name]);
            else
                return DISCOURAGED;
        }
    });
}

function requireTraceAllActive(handler, on)
{
    return require(handler, function(context)
    {
        if (Firebug.Debugger.traceAllActive(context) !== on)
            return DISCOURAGED;
    });
}

function requireProfiling(handler, on)
{
    return require(handler, function(context)
    {
        if (Firebug.Profiler.isProfiling() !== on)
            return DISCOURAGED;
    });
}

function noParams(handler)
{
    handler._noparams = 1;
    return handler;
}

function monitorHandler(func, action, name)
{
    var handler = exprHandler(function(context, obj, args)
    {
        if (typeof obj === "function")
        {
            Firebug.Debugger[func](context, obj, action);
            return;
        }
        Array.prototype.forEach.call(obj, function(o)
        {
            if (typeof o === "function")
                Firebug.Debugger[func](context, o, action);
        });
    },
    function(args)
    {
        if (args.length !== 1 || (typeof args[0] !== "function" && !Arr.isArray(args[0])))
            return "\"" + name + "\" needs a function, or an array of functions, as parameter.";
    });
    return requireScriptPanel(handler, name);
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
    "clear": noParams(function(context)
    {
        Firebug.Console.clear(context);
    }),

    "time": function(context, value)
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

    "profile": requireScriptPanel(requireProfiling(function(context, value)
    {
        Firebug.Profiler.startProfiling(context);
        if (!/^ *$/.test(value))
        {
            var log = Obj.bind(Firebug.Console.log, Firebug.Console);
            Firebug.CommandLine.evaluate(value, context, null, null, log, log);
            Firebug.Profiler.stopProfiling(context);
        }
    }, false), "profile"),

    "unprofile": requireScriptPanel(requireProfiling(noParams(function(context)
    {
        Firebug.Profiler.stopProfiling(context);
    }), true)),

    "cd": exprHandler(function(context, obj, args)
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

    "debug": monitorHandler("monitorFunction", "debug", "debug"),
    "undebug": monitorHandler("unmonitorFunction", "debug", "undebug"),
    "monitor": monitorHandler("monitorFunction", "monitor", "monitor"),
    "unmonitor": monitorHandler("unmonitorFunction", "monitor", "unmonitor"),

    "monitor-events": monitorEventsHandler(true),
    "unmonitor-events": monitorEventsHandler(false),

    "trace": requireScriptPanel({
        "all": requireTraceAllActive(noParams(function(context)
        {
            Firebug.Debugger.traceAll(context);
        }), false),

        "function": monitorHandler("traceCalls", undefined, "trace function"),

        "execution": function(context, value)
        {
            Firebug.Debugger.traceAll(context);
            var log = Obj.bind(Firebug.Console.log, Firebug.Console);
            Firebug.CommandLine.evaluate(value, context, null, null, log, log);
            Firebug.Debugger.untraceAll(context);
        },

        _suggestions: ["execution"]
    }, "trace"),

    "untrace": requireScriptPanel({
        "all": requireTraceAllActive(noParams(function(context)
        {
            Firebug.Debugger.untraceAll(context);
        }), true),

        "function": monitorHandler("untraceCalls", undefined, "untrace function")
    }, "untrace"),


    "inspect": exprHandler(function(context, obj, args)
    {
        Firebug.chrome.select(obj, args[1]);
    }, needObject),

    "copy": exprHandler(function(context, obj, args)
    {
        System.copyToClipboard(obj);
        var str = Locale.$STR("commandline.CopiedToClipboard");
        Firebug.Console.logFormatted([str], context, "info");
    }, needObject),

    "keys": exprHandler(function(context, obj, args)
    {
        Firebug.Console.log(Arr.keys(obj), context);
    }, needObject),

    "values": exprHandler(function(context, obj, args)
    {
        Firebug.Console.log(Arr.values(obj), context);
    }, needObject),

    "dir": exprHandler(function(context, obj, args)
    {
        Firebug.Console.log(obj, context, "dir", Firebug.DOMPanel.DirTable);
    }, needObject),

    "xml": exprHandler(function(context, obj, args)
    {
        if (obj instanceof window.Window)
            obj = obj.document;
        if (obj instanceof window.Document)
            obj = obj.documentElement;
        Firebug.Console.log(obj, context, "dirxml", Firebug.HTMLPanel.SoloElement);
    }, needObject),

    "table": exprHandler(function(context, obj, args)
    {
        Reps.Table.log(obj, args[1], context);
    }, needObject),

    _suggestions: ["clear"]
};

Firebug.CommandLineCommands = {
    // Public API for adding new commands.
    API: {
        DISCOURAGED: DISCOURAGED,
        handlers: commandHandlers,
        exprHandler: exprHandler,
        require: require,
        noParams: noParams
    },

    getParts: function(value)
    {
        return value.substr(1).split(" ");
    },

    hasCommand: function(value)
    {
        return (value.charAt(0) === ":");
    },

    // Returns null for no completions, or an structure consisting of the
    // command handler to complete for and which index in 'parts' follows it.
    findCompletionHandler: function(parts, context)
    {
        var node = commandHandlers, i = 0;
        for (; i < parts.length; ++i)
        {
            if (typeof node === "function")
                break;
            var prop = parts[i];
            if (prop.charAt(0) === "_" || !node.hasOwnProperty(prop))
                return null;
            node = node[prop];
            if (node._noparams)
                return null;
            if (context && node._require && node._require(context))
                return null;
        }
        return {
            handler: node,
            level: i
        };
    },

    findExecuteHandler: function(parts, context)
    {
        var node = commandHandlers, i = 0, err;
        for (; i < parts.length; ++i)
        {
            if (typeof node === "function" || parts[i] === "")
                break;
            err = null;
            if (parts[i].charAt(0) !== "_" && node.hasOwnProperty(parts[i]))
            {
                node = node[parts[i]];
                if (!node._require)
                    continue;
                err = node._require(context);
                if (!err || err === DISCOURAGED)
                    continue;
            }

            // The command up to here is invalid.
            if (!err)
            {
                var command = parts.slice(0, i+1).join(" ");
                err = Locale.$STRF("commandline.InvalidCommand", [command]);
            }
            Firebug.Console.logFormatted([new Error(err)], context, "error");
            return null;
        }

        if (typeof node !== "function")
        {
            var command = parts.slice(0, i).join(" ");
            err = Locale.$STRF("commandline.AdditionalParametersRequired", [command]);
            Firebug.Console.logFormatted([new Error(err)], context, "error");
            return null;
        }

        return {
            handler: node,
            level: i
        };
    },

    execute: function(value, context)
    {
        var parts = this.getParts(value);
        var h = this.findExecuteHandler(parts, context);
        if (h)
        {
            var commandText = parts.slice(0, h.level).join(" ");
            h.handler(context, value.substr(commandText.length + 1));
        }
    },

    getDefaultCompletion: function(list, value, prefix, ac)
    {
        if (ac.showCompletionPopup && value === ":" && !prefix)
            return -1;

        var parts = this.getParts(value).slice(0, -1);
        var h = this.findCompletionHandler(parts);
        if (h && h.handler.hasOwnProperty("_suggestions"))
        {
            var suggestions = h.handler._suggestions;
            for (var i = 0; i < suggestions.length; ++i)
            {
                var ind = list.indexOf(suggestions[i]);
                if (ind !== -1)
                    return ind;
            }
        }
        return null;
    },

    getCompletionValue: function(value)
    {
        var parts = this.getParts(value);
        var more = !!this.findCompletionHandler(parts);
        return value + (more ? " " : "");
    },

    complete: function(value, context)
    {
        if (!this.hasCommand(value))
        {
            return {
                expr: "",
                candidates: null
            };
        }

        var parts = this.getParts(value), pre = parts.slice(0, -1);
        var h = this.findCompletionHandler(pre, context);
        if (!h)
        {
            // No such command, or no parameters - give an empty completion list.
            return {
                expr: value,
                candidates: []
            };
        }

        var usedList, candidates;
        if (typeof h.handler === "function")
        {
            // The handler takes JavaScript input from parts[h.level] and up.
            usedList = pre.slice(0, h.level);
            candidates = null;
        }
        else
        {
            // Complete to a list of commands.
            var handler = h.handler, list = [];
            for (var command in handler)
            {
                if (!handler.hasOwnProperty(command) || command.charAt(0) === "_")
                    continue;
                var h2 = handler[command];
                if (!h2._require || !h2._require(context))
                    list.push(command);
            }
            usedList = pre;
            candidates = list.sort();
        }

        return {
            expr: ":" + (usedList.length > 0 ? usedList.join(" ") + " " : ""),
            candidates: candidates
        };
    }
};

return Firebug.CommandLineCommands;

// ********************************************************************************************* //
});
