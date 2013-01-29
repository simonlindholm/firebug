/* See license.txt for terms of usage */

define(["firebug/lib/domplate"], function(D) {

// ********************************************************************************************* //
// Constants

Firebug.BalloonNote = function(doc, object)
{
    this.initialize(doc, object);
};

with (D) {
Firebug.BalloonNote.prototype = domplate(
{
    tag:
        D.DIV({"class": "balloon", onclick: "$onClick"},
            D.DIV({"class": "balloonTop1"},
                D.DIV({"class": "balloonTop2"})
            ),
            D.DIV({"class": "balloonInner1"},
                D.DIV({"class": "balloonInner2"},
                    D.DIV({"class": "balloonInner3"},
                        D.DIV({"class": "balloonInner4"},
                            D.IMG({"class": "balloonCloseButton closeButton", src: "blank.gif",
                                onclick: "$onCloseAction"}),
                            D.DIV({"class": "balloonContent"},
                                D.TAG("$cause|getContentTag", {cause: "$cause"})
                            )
                        )
                    )
                )
            ),
            D.DIV({"class": "balloonBottom1"},
                D.DIV({"class": "balloonBottom2"})
            )
        ),

    getContentTag: function(object)
    {
        return D.DIV(object.message);
    },

    onCloseAction: function()
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    initialize: function(doc, object)
    {
        // xxxHonza: TODO: this object should implement the whole show/hide logic
        // move from Firebug.BreakNotification
    }
});
};

// ********************************************************************************************* //
});
