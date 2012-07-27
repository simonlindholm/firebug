/* See license.txt for terms of usage */
define([
    "firebug/lib/object",
    "firebug/firebug"
],
function(Obj, Firebug) {

var SaveStates = {
    UNTOUCHED,


function getSaveState(context, rule) {
    var ruleData = CSSModule.getRuleData(context, rule);
    if (!ruleData.saveState)
       ruleData.saveState
}

var Manager =
{
    storeOriginalRule: function(context, rule)
    {
        var ruleData = CSSModule.getRuleData(context, rule);
        if (!ruleData.previousSave)
            ruleData.previousSave = this.getRuleInfo(rule);
    },

    markRuleChange: function(context, rule)
    {
        var ruleData = CSSModule.getRuleData(context, rule),
        var ruleInfo = this.getRuleInfo(rule), previousInfo = ruleData.previousSave;
        if (!previousInfo)
        {
            FBTrace.sysout("CSSSaveManager.markRuleChange no original rule");
            return;
        }

    },
};

Firebug.CSSSavingManager = Manager;
return Manager;
});
