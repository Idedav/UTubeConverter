"use strict";

const _oFs = require("node:fs");
const _oFileManager = require("./fileManager");
const _oStringUtils = require("./utils/string");

class MyDownloadHistory {
  // Gestisce il registro persistente associato agli ID delle sorgenti.
  constructor(sHistoryPath) {
    // Memorizza il percorso del registro.
    this._sHistoryPath = sHistoryPath;
    this._oData = { version: 1, entries: {} };
  }

  async MyLoad() {
    // Carica lo storico oppure lo inizializza vuoto se non esiste.
    let oResult = { bOk: false, sError: "" };
    let sContent = "";
    let oParsed = null;

    try {
      sContent = await _oFs.promises.readFile(this._sHistoryPath, "utf8");
      oParsed = JSON.parse(sContent);
      if ((oParsed !== null) && (typeof oParsed === "object") && (oParsed.entries !== null) && (typeof oParsed.entries === "object")) {
        this._oData = { version: 1, entries: oParsed.entries };
      } else {
        this._oData = { version: 1, entries: {} };
      }
      oResult.bOk = true;
    } catch (oError) {
      if (oError.code === "ENOENT") {
        this._oData = { version: 1, entries: {} };
        oResult.bOk = true;
      } else {
        oResult.sError = _oStringUtils.MyConcat("Storico download non leggibile: ", oError.message);
      }
    }

    return oResult;
  }

  MyGetEntry(sSourceKey) {
    // Restituisce la voce associata alla chiave stabile della sorgente.
    let oResult = null;

    if (Object.hasOwn(this._oData.entries, sSourceKey)) {
      oResult = this._oData.entries[sSourceKey];
    }

    return oResult;
  }

  async MySaveEntry(sSourceKey, oEntry) {
    // Salva l'ID della sorgente, il file finale e i metadati disponibili.
    let oResult = { bOk: false, sError: "" };
    let oPrevious = this._oData.entries[sSourceKey];

    this._oData.entries[sSourceKey] = oEntry;
    oResult = await _oFileManager.MyWriteJson(this._sHistoryPath, this._oData);

    if (!oResult.bOk) {
      if (oPrevious === undefined) {
        delete this._oData.entries[sSourceKey];
      } else {
        this._oData.entries[sSourceKey] = oPrevious;
      }
    }

    return oResult;
  }

  async MyRemoveEntry(sSourceKey) {
    // Elimina una voce obsoleta quando il file registrato non è più presente.
    let oResult = { bOk: false, sError: "" };
    let oPrevious = this._oData.entries[sSourceKey];

    if (oPrevious !== undefined) {
      delete this._oData.entries[sSourceKey];
      oResult = await _oFileManager.MyWriteJson(this._sHistoryPath, this._oData);
      if (!oResult.bOk) {
        this._oData.entries[sSourceKey] = oPrevious;
      }
    } else {
      oResult.bOk = true;
    }

    return oResult;
  }
}

module.exports = {
  MyDownloadHistory: MyDownloadHistory
};
