"use strict";

const _oUrl = require("node:url");

function MyValidateYoutubeUrl(sValue) {
  // Accetta solo URL HTTPS di YouTube, YouTube Music o youtu.be.
  let oResult = { bOk: false, sError: "Inserisci un URL YouTube HTTPS valido.", oUrl: null };
  let oUrl = null;
  let sHostname = "";
  let bSupportedHost = false;

  if (typeof sValue === "string") {
    try {
      oUrl = new _oUrl.URL(sValue.trim());
      sHostname = oUrl.hostname.toLowerCase();
      bSupportedHost = (sHostname === "youtu.be") || (sHostname === "youtube.com") || sHostname.endsWith(".youtube.com");

      if ((oUrl.protocol === "https:") && bSupportedHost && (oUrl.username.length === 0) && (oUrl.password.length === 0)) {
        oResult.bOk = true;
        oResult.sError = "";
        oResult.oUrl = oUrl;
      }
    } catch (oError) {
      oResult.sError = "URL malformato.";
    }
  }

  return oResult;
}

function MyIsPlaylistUrl(oUrl) {
  // Riconosce solo il collegamento esplicito alla pagina playlist.
  let bResult = false;

  if ((oUrl !== null) && (typeof oUrl === "object")) {
    bResult = (oUrl.pathname === "/playlist") && (oUrl.searchParams.has("list"));
  }

  return bResult;
}

module.exports = {
  MyValidateYoutubeUrl: MyValidateYoutubeUrl,
  MyIsPlaylistUrl: MyIsPlaylistUrl
};
