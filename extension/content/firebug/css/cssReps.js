/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/chrome/infotip",
    "firebug/lib/domplate",
    "firebug/js/sourceLink",
    "firebug/lib/locale",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/string",
    "firebug/lib/fonts"
],
function(Obj, InfoTip, Domplate, SourceLink, Locale, Dom, Css, Str, Fonts) {

with (Domplate) {

// ********************************************************************************************* //
// Constants

const maxWidth = 100;
const maxHeight = 80;

// ********************************************************************************************* //

var CSSInfoTip = Obj.extend(InfoTip,
{
    dispatchName: "cssInfoTip",

    tags: domplate(
    {
        infoTipTag: DIV({"class": "infoTip"}),

        colorTag:
            DIV({"class": "infoTipColorBox"},
                DIV({style: "background: $rgbValue; width: 100px; height: 40px;"})
            ),

        imgTag:
            DIV({"class": "infoTipImageBox infoTipLoading"},
                IMG({"class": "infoTipImage", src: "$urlValue", repeat: "$repeat",
                    onload: "$onLoadImage", onerror: "$onErrorImage"}),
                DIV({"class": "infoTipBgImage", collapsed: true}),
                DIV({"class": "infoTipCaption"})
            ),

        fontFamilyTag:
            DIV({"class": "infoTipFontFamilyBox"},
                STYLE({"class": "infoTipFontFamilyStyle"}),
                DIV({"class": "infoTipFontFamilySample"},
                    FOR("fontStyle", "$fontStyles",
                        DIV({"class": "infoTipFontFace", style: "$fontStyle"},
                            Locale.$STR("css.fontFamilyPreview"))
                    )
                )
            ),

        onLoadImage: function(event)
        {
            var img = event.currentTarget;
            var bgImg = img.nextSibling;
            if (!bgImg)
                return; // Sometimes gets called after element is dead

            var caption = bgImg.nextSibling;
            var innerBox = img.parentNode;

            var w = img.naturalWidth, h = img.naturalHeight;
            var repeat = img.getAttribute("repeat");

            if (repeat == "repeat-x" || (w == 1 && h > 1))
            {
                Dom.collapse(img, true);
                Dom.collapse(bgImg, false);
                bgImg.style.background = "url(" + img.src + ") repeat-x";
                bgImg.style.width = maxWidth + "px";
                if (h > maxHeight)
                    bgImg.style.height = maxHeight + "px";
                else
                    bgImg.style.height = h + "px";
            }
            else if (repeat == "repeat-y" || (h == 1 && w > 1))
            {
                Dom.collapse(img, true);
                Dom.collapse(bgImg, false);
                bgImg.style.background = "url(" + img.src + ") repeat-y";
                bgImg.style.height = maxHeight + "px";
                if (w > maxWidth)
                    bgImg.style.width = maxWidth + "px";
                else
                    bgImg.style.width = w + "px";
            }
            else if (repeat == "repeat" || (w == 1 && h == 1))
            {
                Dom.collapse(img, true);
                Dom.collapse(bgImg, false);
                bgImg.style.background = "url(" + img.src + ") repeat";
                bgImg.style.width = maxWidth + "px";
                bgImg.style.height = maxHeight + "px";
            }
            else
            {
                if (w > maxWidth || h > maxHeight)
                {
                    if (w > h)
                    {
                        img.style.width = maxWidth + "px";
                        img.style.height = Math.round((h / w) * maxWidth) + "px";
                    }
                    else
                    {
                        img.style.width = Math.round((w / h) * maxHeight) + "px";
                        img.style.height = maxHeight + "px";
                    }
                }
            }

            caption.textContent = Locale.$STRF("Dimensions", [w, h]);

            Css.removeClass(innerBox, "infoTipLoading");
        },

        onErrorImage: function(event)
        {
            var img = event.currentTarget;
            var bgImg = img.nextSibling;
            if (!bgImg)
                return;

            var caption = bgImg.nextSibling;

            // Display an error in the caption (instead of dimensions).
            if (Str.hasPrefix(img.src, "moz-filedata"))
                caption.textContent = Locale.$STR("firebug.failedToPreviewObjectURL");
            else
                caption.textContent = Locale.$STR("firebug.failedToPreviewImageURL");

            var innerBox = img.parentNode;
            Css.removeClass(innerBox, "infoTipLoading");
        }
    }),

    populateFontFamilyInfoTip: function(infoTip, fontName)
    {
        var fontStyles = [
           "font-size:12px;",
           "font-weight:bold; font-size:12px;",
           "font-style:italic; font-size:12px;",
           "font-size:14px;",
           "font-size:18px;"
        ];
        var fontObject = Fonts.getFontInfo(null, null,
            fontName.replace(/^(["'])?(.*?)\1$/g, "$2"));

        if (FBTrace.DBG_INFOTIP)
        {
            FBTrace.sysout("infotip.populateFontFamilyInfoTip;", {fontName: fontName,
                fontObject: fontObject});
        }

        var node = this.tags.fontFamilyTag.replace({fontStyles: fontStyles, fontName: fontName,
            fontObject: fontObject}, infoTip);
        var styleNode = node.getElementsByClassName("infoTipFontFamilyStyle").item(0);

        styleNode.textContent = getFontFaceCSS(fontObject ? fontObject : fontName);
        return true;
    },

    populateColorInfoTip: function(infoTip, color)
    {
        this.tags.colorTag.replace({rgbValue: color}, infoTip);
        return true;
    },

    populateImageInfoTip: function(infoTip, url, repeat)
    {
        if (!repeat)
            repeat = "no-repeat";

        this.tags.imgTag.replace({urlValue: url, repeat: repeat}, infoTip);

        return true;
    }
});

//********************************************************************************************* //
//Local Helpers

/**
* Returns the CSS for the infotip @font-face CSS
*
* @param fontObject: Font related information
* @return @font-face CSS
*/
function getFontFaceCSS(font)
{
    var fontFaceCSS = "";
    var fontName = "";

    if (typeof font == "object")
    {
        if (font.rule)
            fontFaceCSS = font.rule.cssText.replace(/url\(.*?\)/g, "url("+font.URI+")");
        fontName = font.CSSFamilyName;
    }
    else
    {
        fontName = font;
    }

    fontFaceCSS += " .infoTipFontFace {font-family: "+fontName+";}";

    return fontFaceCSS;
}

// ********************************************************************************************* //
// Registration

return CSSInfoTip;

// ********************************************************************************************* //
}});
