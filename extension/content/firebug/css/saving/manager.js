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

    // like parseCSSProps, but with sorting, and with translateName. maybe we
    // should respect expandShorthandProps somehow. (it would make us able to
    // describe the addition of "padding: 1px" correctly!)
    // maybe we should stripUnits(, false).
    //this.props = CSSModule.parseCSSProps(rule.style, Firebug.expandShorthandProps);
    var style = rule.style, props = [], propMap = new Map();
    for (var i = 0, len = style.length; i < len; ++i)
    {
        var name = style.item(i);
        var value = style.getPropertyValue(name);
        var priority = style.getPropertyPriority(name);
        name = CSSModule.translateName(name, value);
        if (!name)
            continue;
        props.push(name + ":" + Css.stripUnits(value, true) + " " + priority);
        propMap.set(name, value + (priority ? " " + priority : ""));
    }
    this.properties = propMap;
    this.text = props.sort().join(";");
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
