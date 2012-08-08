/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/css",
    "firebug/css/cssModule",
],
function(Firebug, Css, CSSModule) {

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
    }
};

function isInCSSFile(rule)
{
    return !!rule.parentStyleSheet.href;
}

function RuleInfo(rule)
{
    this.selector = rule.selectorText;

    // Note: This is actually wrong in the case where the "expand shorthand
    // properties" option changes in between comparisons. However, that happens
    // only seldomly and the effect of it is harmless, so it's not worth fixing.
    //this.props = CSSModule.parseCSSProps(rule.style, Firebug.expandShorthandProps);

    var style = rule.style, propSet = [];
    for (var i = 0, len = style.length; i < len; ++i)
    {
        var propName = style.item(i);
        propSet.push(propName + ":" + Css.stripUnits(style.getPropertyValue(propName)) +
                " " + style.getPropertyPriority(propName));
    }
    this.text = propSet.sort().join(";");
}
RuleInfo.prototype.verySimilar = function(other)
{
    // Treat rules as very similar to the original (-> unsaveable) if the
    // unordered set of properties, and the selector, are the same.
    return (this.selector === other.selector && this.text === other.text);
};
RuleInfo.prototype.strCompare = function(other)
{
    // XXX Need a comparison object. Returns e.g.
    // |changed "margin-left" of "body"|, |added "margin-left" to "body"|,
    // |removed "margin-left" from "body"|, |added properties to "body"|,
    // |changed properties of "body"|, |removed properties from "body"|
    // |modified selector "body" -> "body:first-child"|
};

Firebug.CSSSaveManager = Manager;
return Manager;
});
