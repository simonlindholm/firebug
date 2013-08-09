/* See license.txt for terms of usage */
/*global define:1*/

define([
    "firebug/lib/trace"
],
function(FBTrace) {
"use strict";

// ********************************************************************************************* //
// Constants

var Json = {};

// ********************************************************************************************* //
// JSON

Json.parseJSONString = function(jsonString, originURL)
{
    var regex, matches;
    if (FBTrace.DBG_JSONVIEWER)
        FBTrace.sysout("jsonviewer.parseJSON; " + jsonString);

    var first = firstNonWs(jsonString);
    if (first !== "[" && first !== "{")
    {
        // This (probably) isn't pure JSON. Let's try to strip various sorts
        // of XSSI protection/wrapping and see if that works better.

        // Prototype-style secure requests
        regex = /^\*\/\*-secure-([\s\S]*)\*\/\s*$/;
        matches = regex.exec(jsonString);
        if (matches)
        {
            jsonString = matches[1];

            if (jsonString[0] === "\\" && jsonString[1] === "n")
                jsonString = jsonString.substr(2);

            if (jsonString[jsonString.length-2] === "\\" && jsonString[jsonString.length-1] === "n")
                jsonString = jsonString.substr(0, jsonString.length-2);
        }

        // Google-style (?) delimiters
        if (jsonString.indexOf("&&&START&&&") !== -1)
        {
            regex = /&&&START&&&([\s\S]*)&&&END&&&/;
            matches = regex.exec(jsonString);
            if (matches)
                jsonString = matches[1];
        }

        // while(1);, for(;;);, and )]}'
        regex = /^\s*(\)\]\}[^\n]*\n|while\(1\);|for\(;;\);)([\s\S]*)/;
        matches = regex.exec(jsonString);
        if (matches)
            jsonString = matches[2];

        // JSONP
        regex = /^\s*([A-Za-z0-9_$.]+\s*(?:\[.*\]|))\s*\(([\s\S]*)\)/;
        matches = regex.exec(jsonString);
        if (matches)
            jsonString = matches[2];
    }

    try
    {
        return JSON.parse(jsonString);
    }
    catch (exc)
    {
        if (FBTrace.DBG_JSONVIEWER)
            FBTrace.sysout("jsonviewer.parseJSON FAILS on "+originURL+" for \"" + jsonString +
                "\" with EXCEPTION " + exc, exc);
    }

    return null;
};

function firstNonWs(str)
{
    for (var i = 0, len = str.length; i < len; i++)
    {
        var ch = str[i];
        if (ch !== " " && ch !== "\n" && ch !== "\t" && ch !== "\r")
            return ch;
    }
    return "";
}

// ********************************************************************************************* //

return Json;

// ********************************************************************************************* //
});
