/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/css/cssModule",
],
function(Firebug, CSSModule) {

var Manager =
{
    /**
     * Marks a rule as potentially saveable (saving original CSS if there is
     * none already), and returns whether it actually is saveable right now.
     */
    testSaveable: function(context, rule)
    {
        var ruleData = CSSModule.getRuleData(context, rule);
        if (!ruleData.previousSave)
            ruleData.previousSave = new RuleInfo(rule);
        return ruleData.saveable;
    },

    ruleChanged: function(context, rule)
    {
        var ruleData = CSSModule.getRuleData(context, rule);
        var previousInfo = ruleData.previousSave;
        if (!previousInfo)
            return;
        ruleData.saveable = !previousInfo.equals(new RuleInfo(rule));
    }
};

function RuleInfo(rule)
{
    // XXX order somehow (CSS panel should keep it, clearly, HTML panel shouldn't; but internally it's there)
    // order change isn't a save-worthy change, I think! (but is still saved)
    this.text = rule.cssText; // WRONG
    this.selector = rule.selectorText;

    // Note: This is actually wrong in the case where the "expand shorthand
    // properties" option changes in between comparisons. However, that happens
    // only seldomly and the effect of it is harmless, so it's not worth fixing.
    this.props = CSSModule.parseCSSProps(rule.style, Firebug.expandShorthandProps);
}
RuleInfo.prototype.equals = function(other)
{
    return this.text === other.text;
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
