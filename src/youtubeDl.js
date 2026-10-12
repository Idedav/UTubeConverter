"use strict";

let _oYoutubeDl = null;
let _sLoadError = "";

try {
  _oYoutubeDl = require("youtube-dl-exec");
} catch (oError) {
  _sLoadError = oError.message;
}

function MyGetYoutubeDl() {
  // Espone il wrapper e l'errore originale quando non è installato.
  let oResult = { bOk: false, oYoutubeDl: null, sError: "" };

  if (_oYoutubeDl !== null) {
    oResult.bOk = true;
    oResult.oYoutubeDl = _oYoutubeDl;
  } else {
    oResult.sError = _sLoadError;
  }

  return oResult;
}

module.exports = {
  MyGetYoutubeDl: MyGetYoutubeDl
};
