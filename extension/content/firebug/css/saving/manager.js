/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/css",
    "firebug/lib/url",
    "firebug/css/cssModule",
],
function(Firebug, Css, Url, CSSModule) {

var Manager =
{
    /**
     * Marks a rule as potentially saveable (saving original CSS if there is
     * none already), and returns whether it actually is saveable right now.
     */
    testSaveable: function(context, rule)
    {
        if (!isInCSSFile(rule))
            return;
        var ruleData = CSSModule.getRuleData(context, rule);
        if (!ruleData.previousSave)
            ruleData.previousSave = new RuleInfo(rule);
        return ruleData.saveable;
    },

    markRuleChanged: function(context, rule)
    {
        if (!isInCSSFile(rule))
            return false;
        var ruleData = CSSModule.getRuleData(context, rule);
        var previousInfo = ruleData.previousSave;
        if (!previousInfo)
            return false;
        ruleData.saveable = !previousInfo.verySimilar(new RuleInfo(rule));
        return ruleData.saveable;
    },

    saveRule: function(context, rule)
    {
        // TODO
        var ruleData = CSSModule.getRuleData(context, rule);
        var previousInfo = ruleData.previousSave;
        var newInfo = new RuleInfo(rule);
        alert("Saving " + previousInfo.selector + " {\n" + previousInfo.text + "\n}\n->\n" + newInfo.selector + " {\n" + newInfo.text + "\n}");
        try{
        alert(newInfo.getChangeDescription(previousInfo));
        }catch(e){
            FBTrace.A = e;
            alert(e);
        }
    }
};

function isInCSSFile(rule)
{
    var sheet = rule.parentStyleSheet;
    if (!sheet || Url.isSystemStyleSheet(sheet))
        return false;
    return !!sheet.href;
}

function RuleInfo(rule)
{
    this.selector = rule.selectorText;

    // maybe we should respect expandShorthandProps somehow. maybe we should stripUnits(, false).

    // okay, so, the problem here is that we don't know how the original looked, really.
    // parseCSSProps(, false) seems like a very reasonable guess, but it could be wrong!
    // so if we see that margin: 1px is changed to margin: 2px, then we should also
    // remove properties margin-*.
    // remember the fun case of: "border: 1px solid black; border-left-style: none;"
    // (not that Firebug handles that nicely either :) ) (well, it does reasonably,
    // except it leaves behind -moz-border-*-colors: none (wtf, we should exclude
    // that in translateName))

    var props = CSSModule.parseCSSProps(rule.style, false);
    var text = "", propMap = new Map();
    props.forEach(function(prop)
    {
        var name = CSSModule.translateName(prop.name, prop.value);
        if (!name)
            return;
        var value = Css.stripUnits(prop.value, true);
        text += name + ":" + value + (priority ? "1" : "0") + ";";
        propMap.set(name, value + (priority ? " " + priority : ""));
    }
    this.text = text;
    this.properties = propMap;
}

RuleInfo.prototype.verySimilar = function(other)
{
    // Treat rules as very similar to the original (-> unsaveable) if the
    // unordered set of properties, and the selector, are the same.
    // (Currently Firebug doesn't show ordering of properties.)
    return (this.selector === other.selector && this.text === other.text);
};

RuleInfo.prototype.getChangeDescription = function(original)
{
    // XXX Need a comparison object/localization.

    var selector = this.selector;
    if (original.selector !== selector)
    {
        if (original.text !== this.text)
            return "modified properties and selector of \"" + original.selector + "\"";
        else
            return "modified selector \"" + original.selector + "\" -> \"" + selector + "\"";
    }

    // true, false, or a singular added property
    function getAdded(original, current)
    {
        var res = false;
        for (var name of current.keys())
        {
            if (!original.has(name))
            {
                if (res !== false)
                    return true;
                res = name;
            }
        }
        return res;
    }

    var changedManyText = "changed properties of \"" + selector + "\"";
    var changed = false;
    for (var name of this.properties.keys())
    {
        if (original.properties.has(name) &&
            original.properties.get(name) !== this.properties.get(name))
        {
            if (changed !== false)
                return changedManyText;
            changed = name;
        }
    }

    var added = getAdded(original.properties, this.properties);
    var removed = getAdded(this.properties, original.properties);

    if ((added ? 1 : 0) + (removed ? 1 : 0) + (changed ? 1 : 0) > 1)
        return changedManyText;

    if (changed)
        return "changed \"" + changed + "\" of \"" + selector + "\"";
    if (added)
        return "added " + (added === true ? "properties" : "\"" + added + "\"") + " to \"" + selector + "\"";
    if (removed)
        return "removed " + (removed === true ? "properties" : "\"" + removed + "\"") + " from \"" + selector + "\"";
    return "no change";
};

return Manager;
});
