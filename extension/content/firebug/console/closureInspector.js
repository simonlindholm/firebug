/* See license.txt for terms of usage */
/*jshint esnext:true, es5:true, curly:false */
/*global FBTrace:true, Components:true, Proxy:true, define:true */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/wrapper"
],
function(Obj, Firebug, Wrapper) {
"use strict";

// ********************************************************************************************* //
// Constants

const Ci = Components.interfaces;
const Cu = Components.utils;

// ********************************************************************************************* //

var ClosureInspector =
{
    dispatchName: "closureInspector",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    hasInit: false,
    Debugger: null,

    getInactiveDebuggerForContext: function(context)
    {
        if (!this.hasInit)
        {
            this.hasInit = true;
            try
            {
                Cu.import("resource://gre/modules/jsdebugger.jsm");
                window.addDebuggerToGlobal(window);
                this.Debugger = window.Debugger;
            }
            catch (exc)
            {
                if (FBTrace.DBG_COMMANDLINE)
                    FBTrace.sysout("ClosureInspector; Debugger not found", exc);
            }
        }
        if (!this.Debugger)
            return;

        if (!context.inactiveDebugger)
        {
            var dbg = new this.Debugger();
            dbg.enabled = false;
            context.inactiveDebugger = dbg;
        }
        return context.inactiveDebugger;
    },

    unwrap: function(global, dglobal, obj)
    {
        dglobal.defineProperty("_firebugUnwrappedDebuggerObject", {
            value: obj,
            writable: true,
            configurable: true
        });
        return global._firebugUnwrappedDebuggerObject;
    },

    scopeIsInteresting: function(env)
    {
        return env.type !== "object";
    },

    getFunctionFromObject: function(obj)
    {
        if (obj.environment)
            return obj;

        var first = true;
        while (obj)
        {
            var names = obj.getOwnPropertyNames(), pd;
            for (var i = 0; i < names.length; ++i)
            {
                // We assume that the first own property, or the first
                // enumerable property of the prototype, that is a
                // function with some scope (i.e., it is interpreted,
                // JSScript-backed, and without optimized-away scope)
                // shares this scope with 'obj'.

                try
                {
                    pd = obj.getOwnPropertyDescriptor(names[i]);
                }
                catch (e)
                {
                    // getOwnPropertyDescriptor sometimes fails with
                    // "Illegal operation on WrappedNative prototype object",
                    // for instance on [window].proto.gopd('localStorage').
                    continue;
                }
                if (!pd || (!first && !pd.enumerable))
                    continue;
                var toTest = [pd.get, pd.set, pd.value];
                for (var j = 0; j < toTest.length; ++j)
                {
                    var f = toTest[j];
                    if (f && f.environment && this.scopeIsInteresting(f.environment))
                        return f;
                }
            }

            if (!first)
                break;
            first = false;
            obj = obj.proto;
        }

        // None found. :(
        return undefined;
    },

    getScopedVariableRaw: function(obj, mem)
    {
        try
        {
            var env = obj.environment.find(mem);
            if (env)
                return env.getVariable(mem);
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; getScopedVariableRaw didn't find anything");
        }
        catch (exc)
        {
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; getScopedVariableRaw failed", exc);
        }

        // Nothing found, for whatever reason.
        return undefined;
    },

    setScopedVariableRaw: function(obj, mem, to)
    {
        try
        {
            var env = obj.environment.find(mem);
            if (env)
            {
                env.setVariable(mem, to);
                return;
            }
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; setScopedVariableRaw didn't find anything");
        }
        catch (exc)
        {
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; setScopedVariableRaw failed", exc);
            throw exc;
        }
        throw new Error("Can't create new closure variables.");
    },

    getScopedVariablesListRaw: function(obj)
    {
        var ret = [];
        try
        {
            for (var sc = obj.environment; sc; sc = sc.parent)
            {
                if (sc.type === "with" && sc.getVariable("profileEnd"))
                {
                    // Almost certainly the with(_FirebugCommandLine) block,
                    // which is at the top of the scope chain on objects
                    // defined through the console. Hide it for a nicer display.
                    break;
                }
                if (sc.type === "object" && sc.getVariable("Object"))
                {
                    // Almost certainly the window object, which we don't need.
                    break;
                }
                ret.push.apply(ret, sc.names());
            }
        }
        catch (exc)
        {
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; getScopedVariablesRaw failed", exc);
        }
        return ret;
    },

    getScopedVariablesList: function(obj, context)
    {
        // Avoid 'window' and 'document' getting associated with closures.
        var global = context.baseWindow || context.window;
        if (obj === global || obj === global.document)
            return [];

        var dbg = this.getInactiveDebuggerForContext(context);
        if (!dbg)
            return [];
        var dglobal = dbg.addDebuggee(global);

        obj = dglobal.makeDebuggeeValue(obj);
        if (!obj || typeof obj !== "object")
            return [];

        obj = this.getFunctionFromObject(obj);
        if (!obj)
            return [];

        return this.getScopedVariablesListRaw(obj);
    },

    getScopedVarsWrapper: function(obj, uwGlobal, context)
    {
        var dbg = this.getInactiveDebuggerForContext(context);
        if (!dbg)
            throw new Error("Debugger not available.");
        var dglobal = dbg.addDebuggee(uwGlobal);

        obj = dglobal.makeDebuggeeValue(obj);
        if (!obj || typeof obj !== "object")
            throw new Error("Tried to get scope of non-object.");

        obj = this.getFunctionFromObject(obj);

        // Return a wrapper for its scoped variables.
        var self = this;
        var handler = {};
        handler.getOwnPropertyDescriptor = function(name)
        {
            if (name === "__exposedProps__")
            {
                // Expose mostly everything, rw, through another proxy.
                return {
                    value: Proxy.create({
                        getPropertyDescriptor: function(name)
                        {
                            if (name === "__exposedProps__" || name === "__proto__")
                                return;
                            return {value: "rw", enumerable: true};
                        }
                    })
                };
            }

            return {
                get: function()
                {
                    try
                    {
                        if (!obj)
                            return undefined;
                        var ret = self.getScopedVariableRaw(obj, name);
                        return self.unwrap(uwGlobal, dglobal, ret);
                    }
                    catch (exc)
                    {
                        if (FBTrace.DBG_COMMANDLINE)
                            FBTrace.sysout("ClosureInspector; failed to return value from getter", exc);
                    }
                },

                set: function(value)
                {
                    if (!obj)
                        throw new Error("Missing closure.");
                    value = dglobal.makeDebuggeeValue(value);
                    self.setScopedVariableRaw(obj, name, value);
                }
            };
        };
        handler.getPropertyDescriptor = handler.getOwnPropertyDescriptor;
        return Proxy.create(handler);
    },

    extendLanguageSyntax: function (expr, global, context)
    {
        var fname = "__fb_scopedVars";

        var newExpr = Firebug.JSAutoCompleter.transformScopeOperator(expr, fname);
        if (expr === newExpr)
            return expr;

        if (FBTrace.DBG_COMMANDLINE)
        {
            FBTrace.sysout("ClosureInspector; transforming expression: `" +
                    expr + "` -> `" + newExpr + "`");
        }

        // Stick the helper function for .%-expressions on the global object.
        // This really belongs on the command line object, but that doesn't
        // work when stopped in the debugger (issue 5321, which depends on
        // integrating JSD2) and we really need this to work there.
        // To avoid leaking capabilities into arbitrary web pages, this is
        // only injected when needed.
        try
        {
            var self = this;
            var uwGlobal = Wrapper.getContentView(global);
            Object.defineProperty(uwGlobal, fname, {
                value: function(obj)
                {
                    return self.getScopedVarsWrapper(obj, uwGlobal, context);
                },
                writable: true,
                configurable: true
            });
        }
        catch (exc)
        {
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; failed to inject " + fname, exc);
        }

        return newExpr;
    }
};

return ClosureInspector;

// ********************************************************************************************* //
});
