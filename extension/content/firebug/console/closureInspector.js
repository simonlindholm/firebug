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
        if (obj.environment && this.scopeIsInteresting(obj.environment))
            return obj;

        var first = true;
        while (obj)
        {
            var names = obj.getOwnPropertyNames(), pd;

            // "constructor" is boring, use it last
            var ind = names.indexOf("constructor");
            if (ind !== -1)
            {
                names.splice(ind, 1);
                names.push("constructor");
            }

            for (var i = 0; i < names.length; ++i)
            {
                // We assume that the first own property, or the first
                // enumerable property of the prototype (or "constructor"),
                // that is a function with some scope (i.e., it is interpreted,
                // JSScript-backed, and without optimized-away scope) shares
                // this scope with 'obj'.

                var name = names[i];
                try
                {
                    pd = obj.getOwnPropertyDescriptor(name);
                }
                catch (e)
                {
                    // getOwnPropertyDescriptor sometimes fails with
                    // "Illegal operation on WrappedNative prototype object",
                    // for instance on [window].proto.gopd("localStorage").
                    continue;
                }
                if (!pd || (!first && !pd.enumerable && name !== "constructor"))
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

    getScopedVariableRaw: function(env, mem)
    {
        try
        {
            env = env.find(mem);
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

    setScopedVariableRaw: function(env, mem, to)
    {
        try
        {
            env = env.find(mem);
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
        throw new Error("can't create new closure variables");
    },

    getScopedVariablesListRaw: function(env)
    {
        var ret = [];
        try
        {
            while (env)
            {
                if (env.type === "with" && env.getVariable("profileEnd"))
                {
                    // Almost certainly the with(_FirebugCommandLine) block,
                    // which is at the top of the scope chain on objects
                    // defined through the console. Hide it for a nicer display.
                    break;
                }
                if (env.type === "object" && env.getVariable("Object"))
                {
                    // Almost certainly the window object, which we don't need.
                    break;
                }
                ret.push.apply(ret, env.names());
                env = env.parent;
            }
        }
        catch (exc)
        {
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; getScopedVariablesRaw failed", exc);
        }
        return ret;
    },

    // Within the security context of the (wrapped) window 'win', find a relevant
    // closure for the content object 'obj' (may be from another frame).
    // Throws exceptions on error.
    getEnvironmentForObject: function(win, obj, context)
    {
        var dbg = this.getInactiveDebuggerForContext(context);
        if (!dbg)
            throw new Error("debugger not available");

        if (!obj || !(typeof obj === "object" || typeof obj === "function"))
            throw new TypeError("can't get scope of non-object");

        var objGlobal = Cu.getGlobalForObject(obj);
        if (win !== objGlobal && !(win.document && objGlobal.document &&
            win.document.nodePrincipal.subsumes(objGlobal.document.nodePrincipal)))
        {
            throw new Error("permission denied to access cross origin scope");
        }

        var dglobal = dbg.addDebuggee(objGlobal);

        var dobj = dglobal.makeDebuggeeValue(obj);

        dobj = this.getFunctionFromObject(dobj);

        if (!dobj)
            throw new Error("missing closure");

        return dobj.environment;
    },

    getScopedVariablesList: function(obj, context)
    {
        // Avoid 'window' and 'document' getting associated with closures.
        var win = context.baseWindow || context.window;
        if (obj === win || obj === win.document)
            return [];

        try
        {
            var env = this.getEnvironmentForObject(win, obj, context);
            return this.getScopedVariablesListRaw(env);
        }
        catch (exc)
        {
            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("ClosureInspector; getScopedVariablesList failed", exc);
            return [];
        }
    },

    getScopedVarsWrapper: function(obj, win, context)
    {
        var env = this.getEnvironmentForObject(win, obj, context);

        var dbg = this.getInactiveDebuggerForContext(context);
        var dglobal = dbg.addDebuggee(win);

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
                        var ret = self.getScopedVariableRaw(env, name);
                        var uwWin = Wrapper.getContentView(win);
                        return self.unwrap(uwWin, dglobal, ret);
                    }
                    catch (exc)
                    {
                        if (FBTrace.DBG_COMMANDLINE)
                            FBTrace.sysout("ClosureInspector; failed to return value from getter", exc);
                    }
                },

                set: function(value)
                {
                    value = dglobal.makeDebuggeeValue(value);
                    self.setScopedVariableRaw(env, name, value);
                }
            };
        };
        handler.getPropertyDescriptor = handler.getOwnPropertyDescriptor;
        return Proxy.create(handler);
    },

    extendLanguageSyntax: function (expr, win, context)
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

        // Stick the helper function for .%-expressions on the window object.
        // This really belongs on the command line object, but that doesn't
        // work when stopped in the debugger (issue 5321, which depends on
        // integrating JSD2) and we really need this to work there.
        // To avoid leaking capabilities into arbitrary web pages, this is
        // only injected when needed.
        try
        {
            var self = this;
            Object.defineProperty(Wrapper.getContentView(win), fname, {
                value: function(obj)
                {
                    return self.getScopedVarsWrapper(obj, win, context);
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

Firebug.ClosureInspector = ClosureInspector;
return ClosureInspector;

// ********************************************************************************************* //
});
