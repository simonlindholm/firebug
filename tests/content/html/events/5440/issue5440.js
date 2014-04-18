function runTest()
{
    FBTest.openNewTab(basePath + "html/events/5440/issue5440.html", function()
    {
        FBTest.enableScriptPanel(function(win)
        {
            FBTest.selectPanel("html");

            var tasks = new FBTest.TaskList();
            tasks.push(verify, "testdiv");
            tasks.push(verify, "testspan");
            tasks.run(FBTest.testDone, 0);
        });
    });
}

function verify(callback, id)
{
    var panelNode = FBTest.selectSidePanel("html-events").panelNode;

    FBTest.selectElementInHtmlPanel(id, () =>
    {
        var html = panelNode.innerHTML;
        var expected = [];

        if (id == "testdiv")
        {
            expected.push("noOwnListenersText");
        }
        else if (id == "testspan")
        {
            expected.push(
                "mouseout",
                "onmouseout\\(event\\)",
                "1\\)",
                "mouseover",
                "function\\(\\)",
                "listenerCapturing(?![^>]*hidden)",
                "derivedListener(?![^>]*doesNotApply)"
            );
        }

        expected = expected.concat([
            "#test",
            "click",
            "function\\(e\\)",
            "listenerCapturing[^>]*hidden",
            "jquery-1.9",
            "derivedListener(?" + (id == "testdiv" ? "!" : ":") + "[^>]*doesNotApply)",
            "funA",
            "&gt; div",
            "issue5440.html \\(",
            "alert",
            "function\\(\\)",
            "jquery-1.5",
            "alert",

            "Document",
            "issue5440.html",
            "click",
            "function\\(\\)",
            "jquery-1.5",
            "derivedListener(?![^>]*doesNotApply)",
            "funA",
            "#test",

            "Document",
            "issue5440.html",
            ">live<",

            "Window",
            "issue5440.html",
            ">load<",
        ]);

        var re = new RegExp(expected.join("[\\w\\W]*"));
        FBTest.compare(re, html, "Panel content should match");
        callback();
    });
}
