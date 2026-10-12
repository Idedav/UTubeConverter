"use strict";

const _oLogger = require("./logger");
const _oUrlManager = require("./urlManager");
const _oStringUtils = require("./utils/string");

class MyPlaylistManager {
  // Recupera metadati, espande playlist e prepara una coda deduplicata.
  constructor(oOptions) {
    // Conserva il wrapper e le impostazioni necessarie alle richieste.
    this._oYtDlp = oOptions.oYtDlp;
    this._oConfig = oOptions.oConfig;
    this._bInterrupted = false;
  }

  MyHandleInterrupt() {
    // Interrompe ulteriori richieste di metadati.
    this._bInterrupted = true;

    return null;
  }

  MyParseMetadata(oRawMetadata) {
    // Normalizza l'output JSON restituito dal wrapper.
    let oResult = { bOk: false, oMetadata: null, sError: "Risposta metadati non valida." };
    let oMetadata = null;

    try {
      oMetadata = (typeof oRawMetadata === "string") ? JSON.parse(oRawMetadata) : oRawMetadata;
      if ((oMetadata !== null) && (typeof oMetadata === "object")) {
        oResult.bOk = true;
        oResult.oMetadata = oMetadata;
        oResult.sError = "";
      }
    } catch (oError) {
      oResult.sError = _oStringUtils.MyConcat("Metadati non leggibili: ", oError.message);
    }

    return oResult;
  }

  async MyGetMetadata(sUrl, bPlaylist) {
    // Recupera metadati o una playlist con un numero finito di tentativi.
    let oResult = { bOk: false, oMetadata: null, sError: "" };
    let oRawMetadata = null;
    let oParsedMetadata = null;
    let oFlags = null;
    let iAttempt = 0;

    oFlags = {
      dumpSingleJson: true,
      skipDownload: true,
      noWarnings: true,
      noCallHome: true,
      noWritePlaylistMetafiles: true
    };
    if (bPlaylist) {
      oFlags.flatPlaylist = true;
    } else {
      oFlags.noPlaylist = true;
    }

    while ((iAttempt <= this._oConfig.maxRetries) && !oResult.bOk && !this._bInterrupted) {
      iAttempt += 1;
      try {
        oRawMetadata = await this._oYtDlp(sUrl, oFlags, { timeout: this._oConfig.timeoutMs, windowsHide: true });
        oParsedMetadata = this.MyParseMetadata(oRawMetadata);
        oResult = oParsedMetadata;
      } catch (oError) {
        oResult.sError = oError.stderr
          ? _oStringUtils.MyConcat(String(oError.stderr).trim(), " ", oError.message)
          : oError.message;
      }

      if (!oResult.bOk && (iAttempt <= this._oConfig.maxRetries) && !this._bInterrupted && (this._oConfig.retryDelayMs > 0)) {
        _oLogger.MyWarning(_oStringUtils.MyConcat("Recupero metadati fallito, nuovo tentativo ", iAttempt, " di ", this._oConfig.maxRetries, "."));
        await new Promise((oResolve) => setTimeout(oResolve, this._oConfig.retryDelayMs));
      }
    }

    if (this._bInterrupted && !oResult.bOk) {
      oResult.sError = "Operazione interrotta dall'utente.";
    }

    return oResult;
  }

  MyBuildSourceKey(oMetadata, sUrl) {
    // Crea una chiave stabile per lo storico usando extractor e ID.
    let sExtractor = "youtube";
    let sId = "";
    let oParsedUrl = null;

    if ((oMetadata !== null) && (typeof oMetadata === "object")) {
      sExtractor = String(oMetadata.extractor_key || oMetadata.extractor || sExtractor).toLowerCase();
      sId = String(oMetadata.id || "");
    }
    if (sId.length === 0) {
      oParsedUrl = _oUrlManager.MyValidateYoutubeUrl(sUrl);
      if (oParsedUrl.bOk) {
        sId = oParsedUrl.oUrl.searchParams.get("v") || oParsedUrl.oUrl.pathname.replace(/^\/+/, "");
      }
    }

    return (sId.length > 0) ? _oStringUtils.MyConcat(sExtractor, ":", sId) : sUrl;
  }

  MyBuildEntryUrl(oEntry) {
    // Converte la voce piatta in un URL video valido per una richiesta singola.
    let sCandidateUrl = "";
    let sEntryUrl = "";
    let sId = "";
    let oValidation = null;

    if ((oEntry !== null) && (typeof oEntry === "object")) {
      sId = String(oEntry.id || "");
      if (typeof oEntry.webpage_url === "string") {
        sCandidateUrl = oEntry.webpage_url;
      } else if ((typeof oEntry.url === "string") && /^https?:\/\//i.test(oEntry.url)) {
        sCandidateUrl = oEntry.url;
      } else if (sId.length > 0) {
        sCandidateUrl = _oStringUtils.MyConcat("https://www.youtube.com/watch?v=", encodeURIComponent(sId));
      }
    }

    oValidation = _oUrlManager.MyValidateYoutubeUrl(sCandidateUrl);
    if (oValidation.bOk) {
      sEntryUrl = oValidation.oUrl.toString();
    }

    return sEntryUrl;
  }

  MyBuildPlaylistQueue(oPlaylistMetadata, sPlaylistUrl) {
    // Prepara gli elementi disponibili della playlist e filtra i duplicati.
    let oResult = { bOk: false, aItems: [], sError: "" };
    let oEntry = null;
    let oItemMetadata = null;
    let sItemUrl = "";
    let sSourceKey = "";
    let oSeen = new Set();
    let aPlaylistEntries = [];

    if ((oPlaylistMetadata !== null) && Array.isArray(oPlaylistMetadata.entries)) {
      aPlaylistEntries = oPlaylistMetadata.entries;
      for (oEntry of aPlaylistEntries) {
        sItemUrl = this.MyBuildEntryUrl(oEntry);
        if (sItemUrl.length > 0) {
          oItemMetadata = {
            id: String(oEntry.id || ""),
            title: String(oEntry.title || ""),
            artist: String(oEntry.artist || ""),
            track: String(oEntry.track || ""),
            extractor_key: String(oEntry.extractor_key || oEntry.extractor || "youtube"),
            webpage_url: sItemUrl
          };
          sSourceKey = this.MyBuildSourceKey(oItemMetadata, sItemUrl);
          if (!oSeen.has(sSourceKey)) {
            oSeen.add(sSourceKey);
            oResult.aItems.push({ sUrl: sItemUrl, oMetadata: oItemMetadata, sSourceKey: sSourceKey });
          }
        }
      }
    }

    if (oResult.aItems.length > 0) {
      oResult.bOk = true;
    } else {
      oResult.sError = (aPlaylistEntries.length === 0)
        ? "La playlist è vuota o non contiene elementi disponibili."
        : _oStringUtils.MyConcat("Nessun elemento scaricabile identificato per la playlist ", sPlaylistUrl, ".");
    }

    return oResult;
  }
}

module.exports = {
  MyPlaylistManager: MyPlaylistManager
};
