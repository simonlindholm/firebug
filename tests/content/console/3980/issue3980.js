function runTest()
{
    FBTest.sysout("issue3980.START");

    FBTest.openNewTab(basePath + "console/3980/issue3980.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("console");

        FBTest.enableScriptPanel();
        FBTest.enableConsolePanel(function(win)
        {
            var tests = [];
            tests.push(testCPUProfileClearButton);
            tests.push(testCPUProfileConsoleClearCommand);
            //tests.push(testMemoryProfileClearButton);
            //tests.push(testMemoryProfileConsoleClearCommand);

            FBTestFirebug.runTestSuite(tests, function()
            {
                FBTest.testDone("issue3980; DONE");
            });
        });
    });
}


function testCPUProfileClearButton(callback)
{
    var config = {tagName: "div", classes: "logRow logGroupLabel"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        var chrome = FW.Firebug.chrome;
        var doc = chrome.window.document;
        FBTest.clickToolbarButton(chrome, "fbConsoleClear");

        var button = doc.getElementById("cmd_firebug_toggleProfiling");
        FBTest.ok(!button.checked, "'Profile' button must not be pressed when 'Clear' button was pressed");

        callback();
    });

    FBTest.clickToolbarButton(null, "fbToggleProfiling");
}

function testCPUProfileConsoleClearCommand(callback)
{
    var config = {tagName: "div", classes: "logRow logGroupLabel"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        FBTest.executeCommand("console.clear()");

        var doc = FW.Firebug.chrome.window.document;
        var button = doc.getElementById("cmd_firebug_toggleProfiling");
        FBTest.ok(!button.checked, "'Profile' button must not be pressed when 'console.clear()' was executed");

        callback();
    });

    FBTest.clickToolbarButton(null, "fbToggleProfiling");
}

function testMemoryProfileClearButton(callback)
{
    var config = {tagName: "div", classes: "logRow logGroupLabel"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        var chrome = FW.Firebug.chrome;
        var doc = chrome.window.document;
        FBTest.clickToolbarButton(chrome, "fbConsoleClear");

        var button = doc.getElementById("cmd_firebug_toggleMemoryProfiling");
        FBTest.ok(!button.checked, "'Memory Profile' button must not be pressed when 'Clear' button was pressed");

        callback();
    });

    FBTest.clickToolbarButton(null, "fbToggleProfiling");
}

function testMemoryProfileConsoleClearCommand(callback)
{
    var config = {tagName: "div", classes: "logRow logGroupLabel"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        FBTest.executeCommand("console.clear()");

        var doc = FW.Firebug.chrome.window.document;
        var button = doc.getElementById("cmd_firebug_toggleMemoryProfiling");
        FBTest.ok(!button.checked, "'Memory Profile' button must not be pressed when 'console.clear()' was executed");

        callback();
    });

    FBTest.clickToolbarButton(null, "fbToggleProfiling");
}
