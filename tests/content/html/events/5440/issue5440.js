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
                "onmouseout(event)",
                "mouseover",
                "function()",
                "listenerCapturing",
                "NOT hidden",
                "derivedListener",
                "NOT doesNotApply"
            );
        }

        expected = expected.concat([
            "#test",
            "click",
            "function(e)",
            "listenerCapturing",
            "hidden",
            "jquery-1.9",
            "derivedListener",
            (id === "testdiv" ? "NOT " : "") + "doesNotApply",
            "funA",
            "&gt; div",
            "issue5440.html (",
            "alert",
            "function()",
            "jquery-1.5",
            "alert",

            "Document",
            "issue5440.html",
            "click",
            "function()",
            "jquery-1.5",
            "derivedListener",
            "NOT doesNotApply",
            "funA",
            "#test",

            "Document",
            "issue5440.html",
            ">live<",

            "Window",
            "issue5440.html",
            ">load<",
        ]);

        var index = 0;
        for (var i = 0; i < expected.length; i++)
        {
            var part = expected[i];
            if (part.startsWith("NOT "))
            {
                part = part.substr(4);
                var ind = html.indexOf(">", index);
                FBTest.ok(ind !== -1, "Panel should contain: >");
                var ind2 = html.indexOf(part, index);
                FBTest.ok(ind2 === -1 || ind2 > ind, "Tag should not contain: " + part + ": " +
                    html.slice(index, ind));
                index = ind;
            }
            else
            {
                var ind = html.indexOf(part, index);
                FBTest.ok(ind !== -1, "Panel should contain: " + part);
                if (ind !== -1)
                    index = ind;
            }
        }
        callback();
    });
}
