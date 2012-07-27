/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/css/cssModule",
],
function(Firebug, CSSModule) {

var Manager =
{
    storeOriginalRule: function(context, rule)
    {
        var ruleData = CSSModule.getRuleData(context, rule);
        if (!ruleData.previousSave)
            ruleData.previousSave = new RuleInfo(rule);
    },

    markRuleChange: function(context, rule)
    {
        var ruleData = CSSModule.getRuleData(context, rule);
        var ruleInfo = new RuleInfo(rule), previousInfo = ruleData.previousSave;
        if (!previousInfo)
        {
            FBTrace.sysout("CSSSaveManager.markRuleChange no original rule");
            return;
        }

        ruleData.saveable = !ruleInfo.equals(previousInfo);
    },

    isSaveable: function(context, rule)
    {
        return CSSModule.getRuleData(context, rule).saveable;
    }
};

function RuleInfo(rule)
{
    this.text = rule.cssText;
    this.selector = rule.selectorText;

    // Note: This is actually wrong in the case where the "expand shorthand
    // properties" option changes in between comparisons. However, that happens
    // only seldomly and the effect of it is harmless, so it's not worth fixing.
    this.props = CSSModule.parseCSSProps(style, Firebug.expandShorthandProps);
}
RuleInfo.prototype.equals = function(other)
{
    return this.text === other.text;
};
RuleInfo.prototype.strCompare = function(other)
{
    // XXX Need a comparison object. E.g.
    // |changed "margin-left" of "body"|, |added "margin-left" to "body"|,
    // |removed "margin-left" from "body"|, |added properties to "body"|,
    // |changed properties of "body"|, |removed properties from "body"|
    // |modified selector "body" -> "body:first-child"|
};

Firebug.CSSSaveManager = Manager;
return Manager;
});
